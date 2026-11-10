"""Discover raster figure/caption candidates; no OCR or automatic adoption.

Usage: bundled-python discover-pdf-figures.py native-report.json output.json
No image bytes are rewritten. Vector-only diagrams are outside this inventory.
"""
import hashlib
import json
import math
import re
import sys
from pathlib import Path


def union(boxes):
    return [min(b[0] for b in boxes), min(b[1] for b in boxes),
            max(b[2] for b in boxes), max(b[3] for b in boxes)]


def raster_groups(occurrences):
    """Inventory repeated encoded content, not automatic visual/semantic removal."""
    groups = {}
    for item in occurrences:
        key = (item['decodedStreamSha256'], json.dumps(item['decodeMetadata'], sort_keys=True))
        group = groups.setdefault(key, {'decodedStreamSha256': key[0],
                    'decodeMetadata': item['decodeMetadata'], 'occurrences': []})
        group['occurrences'].append({k:item[k] for k in ('page','index','bbox')})
    return [{**group, 'occurrenceCount': len(group['occurrences']),
             'pageCount': len({o['page'] for o in group['occurrences']}),
             'automaticExclusion': False} for group in groups.values()]


def discover(page, image_boxes):
    if page.get('orientation'):
        return {'status': 'pending-rotation', 'candidates': [], 'unassigned': image_boxes}
    width, height = page['width'], page['height']
    valid, ignored = [], []
    for index, box in enumerate(image_boxes):
        if (len(box) != 4 or not all(math.isfinite(v) for v in box)
                or not 0 <= box[0] < box[2] <= width or not 0 <= box[1] < box[3] <= height):
            ignored.append({'index': index, 'bbox': box, 'reason': 'invalid-bounds'})
        elif (box[2]-box[0])*(box[3]-box[1]) >= width*height*.8:
            ignored.append({'index': index, 'bbox': box, 'reason': 'page-sized-raster'})
        else:
            valid.append({'index': index, 'bbox': box})
    # Combine vertically adjacent image parts with substantial horizontal overlap.
    # This proposes map/legend groups; a human must still verify the crop.
    groups = [[v] for v in valid]
    changed = True
    while changed:
        changed = False
        for i in range(len(groups)):
            for j in range(i+1, len(groups)):
                a, b = union([x['bbox'] for x in groups[i]]), union([x['bbox'] for x in groups[j]])
                overlap = max(0, min(a[2], b[2])-max(a[0], b[0]))
                gap = max(a[1], b[1])-min(a[3], b[3])
                if 0 <= gap <= max(12, height*.02) and overlap >= .8*min(a[2]-a[0], b[2]-b[0]):
                    groups[i] += groups.pop(j);changed = True;break
            if changed:break
    captions = [b for b in page['blocks'] if b['kind']=='paragraph'
                and re.match(r'^(?:附图|图|照片)\s*\d+(?:[.\-－]\d+)*(?:\s|[:：])', b['text'])]
    matches = []
    for caption in captions:
        c = caption['bbox'];cx = (c[0]+c[2])/2
        candidates = [i for i, group in enumerate(groups)
                      if (lambda b: b[0] <= cx <= b[2] and 0 <= c[1]-b[3] <= height*.08)(union([x['bbox'] for x in group]))]
        matches.append((caption, candidates))
    usage = {i:sum(i in hits for _, hits in matches) for i in range(len(groups))}
    results = []
    assigned = set()
    for caption, hits in matches:
        item = {'caption': caption['text'], 'captionBBox': caption['bbox'],
                'automaticAdoption': False, 'visuallyReviewed': False}
        if len(hits)==1 and usage[hits[0]]==1:
            group=groups[hits[0]];assigned.add(hits[0])
            item.update(status='candidate', bbox=union([x['bbox'] for x in group]),
                        imageRegions=group, coordinateSpace='pdf-page-top-left-points')
        else:
            item.update(status='pending', reason='missing-or-ambiguous-image-caption-match', matchingGroups=hits)
        results.append(item)
    return {'status':'inventoried','candidates':results, 'ignored':ignored,
            'unassigned':[group for i,group in enumerate(groups) if i not in assigned]}


if __name__ == '__main__':
    import pdfplumber
    source, output = map(Path, sys.argv[1:3])
    report=json.loads(source.read_text(encoding='utf8'));pdf_path=Path(report['input'])
    if hashlib.sha256(pdf_path.read_bytes()).hexdigest()!=report['sha256']:
        raise ValueError('PDF source hash mismatch')
    records=[];occurrences=[]
    with pdfplumber.open(pdf_path) as pdf:
        if len(pdf.pages)!=report['pageCount'] or len(report['pages'])!=len(pdf.pages):
            raise ValueError('Page inventory mismatch')
        for number, (page, layout) in enumerate(zip(pdf.pages, report['pages']), 1):
            if layout['page']!=number:raise ValueError('Page order mismatch')
            boxes=[[im['x0'],im['top'],im['x1'],im['bottom']] for im in page.images]
            for index, im in enumerate(page.images):
                occurrences.append({'page':number,'index':index,'bbox':boxes[index],
                    'decodedStreamSha256':hashlib.sha256(im['stream'].get_data()).hexdigest(),
                    'decodeMetadata':{'sourceSize':im.get('srcsize'),'bits':im.get('bits'),
                                      'imageMask':im.get('imagemask'),'colorSpace':str(im.get('colorspace'))}})
            records.append({'page':number,**discover(layout,boxes)})
    result={'sourcePDFSha256':report['sha256'],'pageCount':report['pageCount'],
            'scope':'raster regions and existing native captions only; reviewed crops not generated',
            'automaticAdoption':False,'pages':records,'rasterGroups':raster_groups(occurrences)}
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({'pages':len(records),'candidates':sum(c['status']=='candidate' for p in records for c in p['candidates']),
                      'pendingCaptions':sum(c['status']=='pending' for p in records for c in p['candidates'])}))
