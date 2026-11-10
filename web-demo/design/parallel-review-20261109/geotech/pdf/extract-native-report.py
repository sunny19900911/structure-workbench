"""Extract full native PDF reports, retaining page geometry and OCR work items.

Usage: bundled-python extract-native-report.py <manifest.json> <output-dir> [--verify-numeric]
Manifest entries: id,input. POPPLER_BIN supplies the existing local renderer.
This experimental reader does not publish or write into a project database.
"""
import hashlib
import io
import importlib.util
import json
import os
import re
import sys
from collections import Counter
from contextlib import nullcontext, closing
from pathlib import Path
import pdfplumber
from pdf2image import convert_from_path

# Experimental opt-in: filled cell backgrounds are not necessarily borders.
# Preserve outlined rectangles, thin filled rules, characters and source file.
IGNORE_FILL_BACKGROUNDS = '--ignore-fill-backgrounds' in sys.argv


def keep_grid_object(obj):
    return not (obj.get('object_type') == 'rect' and obj.get('fill')
                and not obj.get('stroke') and min(obj.get('width', 0), obj.get('height', 0)) > 3)

spec = importlib.util.spec_from_file_location("native_table", Path(__file__).with_name("benchmark-native.py"))
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)

verify_spec = importlib.util.spec_from_file_location('verify_numeric_rows', Path(__file__).with_name('verify-numeric-rows.py'))
numeric_verifier = importlib.util.module_from_spec(verify_spec)
verify_spec.loader.exec_module(numeric_verifier)

identity_spec = importlib.util.spec_from_file_location('verify_sample_depth', Path(__file__).with_name('verify-sample-depth.py'))
identity_verifier = importlib.util.module_from_spec(identity_spec)
identity_spec.loader.exec_module(identity_verifier)

orientation_spec=importlib.util.spec_from_file_location('page_orientation',Path(__file__).with_name('page-orientation.py'))
orientation=importlib.util.module_from_spec(orientation_spec)
orientation_spec.loader.exec_module(orientation)
glyph_spec=importlib.util.spec_from_file_location('glyph_lines',Path(__file__).with_name('glyph-lines.py'))
glyph_module=importlib.util.module_from_spec(glyph_spec)
glyph_spec.loader.exec_module(glyph_module)


def tidy(text):
    return re.sub(r"(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])", "", str(text or "")).strip()


def glyph_table(table, verification_page=None):
    data = native.table_data(table)
    if not data.get('gridExpanded'):
        return data
    # Keep raw extraction and merge geometry; re-read each distinct physical
    # cell only once. Never take glyphs from the neighbouring cell.
    cache = {}
    for row in data['cellOrigins']:
        for origin in row:
            if not origin:
                continue
            box = tuple(origin['bbox'])
            if box not in cache:
                def inside(obj):
                    if obj.get('object_type') != 'char':
                        return False
                    x, y = (obj['x0']+obj['x1'])/2, (obj['top']+obj['bottom'])/2
                    return box[0] <= x < box[2] and box[1] <= y < box[3]
                cell = table.page.filter(inside)
                reference_size = max((c['size'] for c in cell.chars), default=None)
                cache[box] = '\n'.join(line['text'] for line in glyph_module.glyph_lines(cell, reference_size=reference_size))
            origin['originalText'] = origin['text']
            origin['text'] = cache[box]
    data['rows'] = [[o['text'] if o else '' for o in row] for row in data['cellOrigins']]
    data['glyphReflowed'] = True
    # A continuous numeric token crossing an internal cell border cannot be
    # safely split by glyph centre: both pieces may look like valid numbers.
    # Preserve the raw reading and geometry, but withhold disputed cell text.
    disputed = set(); warnings = []
    for token in table.page.crop(table.bbox).extract_words(x_tolerance=1, y_tolerance=2, return_chars=True):
        if not re.fullmatch(r'[+\-]?\d[\d.\-+]*', token['text']):
            continue
        owners = set()
        for glyph in token['chars']:
            x, y = (glyph['x0']+glyph['x1'])/2, (glyph['top']+glyph['bottom'])/2
            owners.update(box for box in cache if box[0] <= x < box[2] and box[1] <= y < box[3])
        if len(owners) > 1:
            disputed.update(owners)
            warnings.append({'text':token['text'], 'bbox':[token[k] for k in ['x0','top','x1','bottom']],
                             'cells':[list(box) for box in sorted(owners)], 'reason':'numeric-token-crosses-cell-boundary'})
    if warnings:
        for row in data['cellOrigins']:
            for origin in row:
                if origin and tuple(origin['bbox']) in disputed:
                    origin['unreviewedText'] = origin['text']; origin['text'] = ''; origin['requiresReview'] = True
        data['rows'] = [[o['text'] if o else '' for o in row] for row in data['cellOrigins']]
        data['numericBoundaryWarnings'] = warnings
    if verification_page is not None and abs(verification_page.get_height()-table.page.height) < .1 and abs(verification_page.get_width()-table.page.width) < .1:
        textpage = verification_page.get_textpage()
        try:
            if warnings:
                numeric_verifier.resolve_numeric_rows(data, textpage, table.page.height)
            identity_verifier.verify_sample_depth(data, textpage, table.page.height)
        finally:
            textpage.close()
    return data


def repeated_margins(pages):
    """Identify small, repeated marginal lines before they join body paragraphs.

    Keep every excluded string and coordinate for audit. Repetition alone is
    insufficient: normal-size headings and table labels remain body content.
    """
    sizes = Counter()
    for p in pages:
        sizes.update(c['size'] for c in p.chars
                     if p.height*.12 < c['top'] < p.height*.85 and c['text'].strip())
        p.close()
    if not sizes:
        return {}
    total = sum(sizes.values()); middle = [(total-1)//2, total//2]
    offset = 0; central = []
    for size, count in sorted(sizes.items()):
        central.extend(size for index in middle if offset <= index < offset+count)
        offset += count
    body_size = sum(central)/2
    candidates = {}
    for i, page in enumerate(pages, 1):
        # Scan margin bands only; drawing appendices can contain thousands of
        # interior glyphs unrelated to header detection.
        margin_lines = [line for band in [(0, 0, page.width, page.height*.10),
                                         (0, page.height*.90, page.width, page.height)]
                        for line in glyph_module.glyph_lines(page.crop(band))]
        for line in margin_lines:
            marginal = line['bottom'] <= page.height*.10 or line['top'] >= page.height*.90
            if not marginal or line['bottom']-line['top'] > body_size*.85:
                continue
            text = tidy(line['text'])
            if not text or len(text) > 120 or re.fullmatch(r'[\d\s]+', text):
                continue
            key = (text, round(line['top']/page.height, 2))
            candidates.setdefault(key, []).append((i, {'text':text, 'bbox':[line['x0'],line['top'],line['x1'],line['bottom']]}))
        page.close()
    result = {}
    for entries in candidates.values():
        if len({i for i, _ in entries}) >= 3:
            for i, entry in entries:
                result.setdefault(i, []).append(entry)
    return result


def column_split(page, tables):
    chars = [c for c in page.chars if page.height*.07 < c['top'] < page.height*.93 and c['text'].strip()]
    if len(chars) < 200:
        return None
    choices = []
    for fraction in range(44, 57):
        x = page.width*fraction/100
        if any(t.bbox[0] < x < t.bbox[2] for t in tables):
            continue
        crossings = sum(c['x0'] < x+4 and c['x1'] > x-4 for c in chars)
        left = sum(c['x1'] < x for c in chars)
        right = sum(c['x0'] > x for c in chars)
        if min(left, right) > len(chars)*.2 and crossings <= max(3, len(chars)*.003):
            choices.append((crossings, abs(fraction-50), x))
    return min(choices)[2] if choices else None


def nonprinting_marker(obj):
    """Known zero-width Adobe marker font, not arbitrary small/hidden text."""
    return (obj.get('object_type') == 'char'
            and re.sub(r'^[A-Z]{6}\+', '', obj.get('fontname', '')) == 'ZWAdobeF'
            and 0 < obj.get('size', 0) <= 2
            and obj.get('adv') == 0
            and obj.get('x0') == obj.get('x1'))


def wide_spaced_continuation(previous, current, left_edge, right_edge):
    """Recognize wrapped body lines with large leading, within one column only."""
    a, b = previous['bbox'], current['bbox']
    height, next_height = a[3]-a[1], b[3]-b[1]
    if min(height, next_height) <= 0 or not .85 <= next_height/height <= 1.15:
        return False
    if re.search(r'[。！？.!?；：:]$', previous['text']) or re.match(r'^(?:图|照片)\s*\d', current['text']):
        return False
    return (0 <= b[1]-a[3] <= height*1.3
            and abs(a[2]-right_edge) <= height*1.5
            and abs(b[0]-left_edge) <= height*.6)


def page_blocks(page, page_no, excluded_margins=(), verification_page=None, table_settings=None):
    page = page.filter(lambda obj: not nonprinting_marker(obj))
    if excluded_margins:
        def keep(obj):
            if obj.get('object_type') != 'char':
                return True
            x, y = (obj['x0']+obj['x1'])/2, (obj['top']+obj['bottom'])/2
            return not any(m['bbox'][0] <= x <= m['bbox'][2] and m['bbox'][1] <= y <= m['bbox'][3] for m in excluded_margins)
        page = page.filter(keep)
    grid_page = page.filter(keep_grid_object) if IGNORE_FILL_BACKGROUNDS else page
    tables = grid_page.find_tables(table_settings)
    split = column_split(page, tables)
    def outside(obj):
        if obj.get('object_type') != 'char':
            return True
        x, y = (obj['x0']+obj['x1'])/2, (obj['top']+obj['bottom'])/2
        return not any(t.bbox[0] <= x <= t.bbox[2] and t.bbox[1] <= y <= t.bbox[3] for t in tables)
    remaining = page.filter(outside)
    regions = [(0, page.width)] if split is None else [(0, split), (split, page.width)]
    result = []
    for column, (left, right) in enumerate(regions):
        region = remaining.crop((left, 0, right, page.height))
        lines = glyph_module.glyph_lines(region)
        items = [{"kind":"line", "bbox":[l['x0'],l['top'],l['x1'],l['bottom']], "text":tidy(l['text'])} for l in lines]
        # A centred running header can protrude into this column. Use the
        # repeated body-line start rather than the leftmost margin glyph.
        starts = Counter(round(x['bbox'][0]/3)*3 for x in items if len(x['text']) >= 20)
        body_left = starts.most_common(1)[0][0] if starts else min((x['bbox'][0] for x in items), default=left)
        body_right = max((x['bbox'][2] for x in items), default=right)
        items += [{"kind":"table", **glyph_table(t, verification_page)} for t in tables if left <= (t.bbox[0]+t.bbox[2])/2 < right]
        items.sort(key=lambda x:(x['bbox'][1],x['bbox'][0]))
        buffer = []
        def flush():
            if buffer:
                result.append({"kind":"paragraph", "text":"".join(x['text'] for x in buffer), "page":page_no, "column":column, "bbox":[min(x['bbox'][0] for x in buffer),buffer[0]['bbox'][1],max(x['bbox'][2] for x in buffer),buffer[-1]['bbox'][3]]})
                buffer.clear()
        for item in items:
            if item['kind']=='table':
                flush(); result.append({**item,"page":page_no,"column":column}); continue
            text = item['text']
            if not text:
                continue
            if item['bbox'][1] > page.height*.90 and re.fullmatch(r'(?:第\s*)?\d*\s*页?(?:\s*共\s*\d+\s*页)?|第',text):
                continue
            short_heading = len(text)<85 and not re.search(r'[。；，]', text) and bool(re.match(r'^(?:\d+(?:[.．]\d+)*(?:[、.．]|\s)?|[一二三四五六七八九十]+[、．]|表\s*\d|注[:：]|附[图表])', text))
            boundary = buffer and item['bbox'][1]-buffer[-1]['bbox'][3] > max(4,(item['bbox'][3]-item['bbox'][1])*.8)
            if boundary and wide_spaced_continuation(buffer[-1], item, body_left, body_right):
                boundary = False
            if short_heading or boundary:
                flush()
            buffer.append(item)
            if short_heading or re.search(r'[。；：:]$', text):
                flush()
        flush()
    return result, split


def read_source_page(source, page, page_no, excluded_margins=(), verification_page=None):
    angle=orientation.rotation_for(page.chars)
    layout={'width':page.width,'height':page.height}
    markers = [dict(text=c['text'], fontname=c['fontname'], size=c['size'],
                    bbox=[c['x0'],c['top'],c['x1'],c['bottom']],
                    reason='zero-width-ZWAdobeF-marker') for c in page.chars if nonprinting_marker(c)]
    if markers:
        layout['excludedNonprintingGlyphs'] = markers
    if not angle:
        layout['blocks'],layout['columnSplit']=page_blocks(page,page_no,excluded_margins,verification_page)
        return layout
    content=orientation.rotated_bytes(source,page_no-1,angle)
    if verification_page is not None:
        import pypdfium2 as pdfium
    with pdfplumber.open(io.BytesIO(content)) as normalized, (pdfium.PdfDocument(content) if verification_page is not None else nullcontext(None)) as verifier:
        p=normalized.pages[0]
        if Counter(c['text'] for c in page.chars)!=Counter(c['text'] for c in p.chars):
            raise ValueError('Rotation changed the native character inventory')
        margins=[{**m,'bbox':orientation.normalized_box(m['bbox'],angle,page.width,page.height)} for m in excluded_margins]
        with (closing(verifier[0]) if verifier is not None else nullcontext(None)) as vp:
            blocks,split=page_blocks(p,page_no,margins,vp,orientation.orthogonal_table_settings(p))
        orientation.annotate_source_boxes(blocks,angle,page.width,page.height)
        layout.update(width=p.width,height=p.height,blocks=blocks,columnSplit=split,
                      orientation={'clockwiseRotation':angle,'sourceWidth':page.width,'sourceHeight':page.height,
                                   'sourcePage':page_no,'sourcePageRotation':page.rotation,'characterInventoryUnchanged':True})
    return layout


def read_available_text(source, page, page_no, excluded_margins=(), verification_page=None):
    # OCR work on raster regions must not suppress an existing text layer.
    if any(c.get('text', '').strip() for c in page.chars):
        return read_source_page(source, page, page_no, excluded_margins, verification_page)
    return {'blocks': [], 'columnSplit': None, 'width': page.width, 'height': page.height}


if __name__ == '__main__':
    manifest, output = map(Path, sys.argv[1:3]); output.mkdir(parents=True,exist_ok=True)
    verify_numeric = '--verify-numeric' in sys.argv[3:]
    if verify_numeric:
        import pypdfium2 as pdfium
    results=[]
    for entry in json.loads(manifest.read_text(encoding='utf-8')):
        source=Path(entry['input']); dest=output/entry['id']; dest.mkdir(exist_ok=True)
        (dest/'ocr-images').mkdir(exist_ok=True)
        pages=[]
        with pdfplumber.open(source) as doc, (pdfium.PdfDocument(source) if verify_numeric else nullcontext(None)) as verifier:
            margins = repeated_margins(doc.pages)
            for i,page in enumerate(doc.pages,1):
                count=len(''.join(c['text'] for c in page.chars).strip())
                image_area=sum(abs((im['x1']-im['x0'])*(im['bottom']-im['top'])) for im in page.images)
                needs_ocr=count<40 or (count<200 and image_area>page.width*page.height*.5)
                with (closing(verifier[i-1]) if verifier is not None and count else nullcontext(None)) as verification_page:
                    layout=read_available_text(source,page,i,margins.get(i,[]),verification_page)
                    blocks=layout['blocks']
                if needs_ocr:
                    target=dest/'ocr-images'/f'page-{i:03}.png'
                    convert_from_path(str(source),dpi=180,first_page=i,last_page=i,poppler_path=os.environ.get('POPPLER_BIN'))[0].save(target)
                pages.append({'page':i,**layout,'charCount':count,'method':'ocr_pending' if needs_ocr else 'native','nativeTextRetained':bool(blocks),'excludedMargins':margins.get(i,[]),'numericBoundaryAudited':bool(verify_numeric and count)})
                print(json.dumps({'id':entry['id'],'page':i,'method':pages[-1]['method'],'tables':sum(b['kind']=='table' for b in blocks)},ensure_ascii=False),flush=True)
                page.close()
        result={**entry,'name':source.name,'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'pageCount':len(pages),'pages':pages,
                'gridRulingMode':'ignore-fill-backgrounds' if IGNORE_FILL_BACKGROUNDS else 'default'}
        (dest/'native-report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
        results.append({'id':entry['id'],'pageCount':len(pages),'ocrPages':[p['page'] for p in pages if p['method']=='ocr_pending'],'nativeTables':sum(b['kind']=='table' for p in pages for b in p['blocks'])})
    (output/'inventory.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
