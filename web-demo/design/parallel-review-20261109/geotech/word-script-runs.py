"""Preserve explicit Word superscript/subscript in the scoped section contract.

Does not infer typography from geological codes, units or formula names.
Usage: python word-script-runs.py converted.docx original-copy sections.json output.json
"""
import copy
import hashlib
import json
import re
import sys
from pathlib import Path
from zipfile import ZipFile
from lxml import etree as E

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
N = {'w': W}


def read_runs(path):
    with ZipFile(path) as archive:
        parser = E.XMLParser(resolve_entities=False, no_network=True, load_dtd=False)
        root = E.fromstring(archive.read('word/document.xml'), parser)
        styles = {}
        if 'word/styles.xml' in archive.namelist():
            styles = {s.get('{'+W+'}styleId'): s for s in
                      E.fromstring(archive.read('word/styles.xml'), parser).findall('w:style', N)}
    def inherited(key, seen=None):
        seen = set() if seen is None else seen
        if not key or key in seen or key not in styles:
            return None
        seen.add(key)
        style = styles[key]
        value = style.find('w:rPr/w:vertAlign', N)
        if value is not None:
            return value.get('{'+W+'}val')
        base = style.find('w:basedOn', N)
        return inherited(base.get('{'+W+'}val'), seen) if base is not None else None
    def runs(element):
        result = []
        for r in element.xpath('.//w:r[not(ancestor::w:del)]', namespaces=N):
            text = ''.join(r.xpath('.//w:t/text()', namespaces=N))
            if not text:
                continue
            direct = r.find('w:rPr/w:vertAlign', N)
            style = r.find('w:rPr/w:rStyle', N)
            value = direct.get('{'+W+'}val') if direct is not None else inherited(style.get('{'+W+'}val') if style is not None else None)
            if value is None:
                paragraph = r.xpath('ancestor::w:p[1]', namespaces=N)
                pstyle = paragraph[0].find('w:pPr/w:pStyle', N) if paragraph else None
                value = inherited(pstyle.get('{'+W+'}val') if pstyle is not None else None)
            item = {'text': text}
            if value in ('superscript', 'subscript'):
                item['verticalAlign'] = value
            result.append(item)
        return result
    paragraphs, tables = [], []
    for block in root.find('w:body', N):
        if block.tag == '{'+W+'}p':
            parts = runs(block)
            if ''.join(p['text'] for p in parts).strip():
                paragraphs.append(parts)
        elif block.tag == '{'+W+'}tbl':
            cells = {}
            for row, tr in enumerate(block.findall('w:tr', N)):
                before = tr.find('w:trPr/w:gridBefore', N)
                column = int(before.get('{'+W+'}val')) if before is not None else 0
                for tc in tr.findall('w:tc', N):
                    cells[(row, column)] = runs(tc)
                    span = tc.find('w:tcPr/w:gridSpan', N)
                    column += int(span.get('{'+W+'}val')) if span is not None else 1
            tables.append(cells)
    return paragraphs, tables


def fit(parts, text):
    original = ''.join(p['text'] for p in parts)
    if original.strip() != text.strip():
        return None
    # Only trim boundary whitespace. Never align a changed number or label.
    start = len(original) - len(original.lstrip())
    end = len(original.rstrip())
    result, offset = [], 0
    for part in parts:
        a, b = max(start, offset), min(end, offset + len(part['text']))
        if a < b:
            result.append({**part, 'text': part['text'][a-offset:b-offset]})
        offset += len(part['text'])
    if ''.join(p['text'] for p in result) != text:
        return None
    return result


def enrich(data, paragraphs, tables):
    result = copy.deepcopy(data)
    audit = {'formattedParagraphs': 0, 'formattedCells': 0, 'scriptRuns': 0, 'unmatched': []}
    for section in result['sections']:
        for block in section['blocks']:
            targets = []
            if block['kind'] == 'paragraph':
                indices = block.get('sourceParagraphs', [])
                parts = [r for i in indices if 0 < i <= len(paragraphs) for r in paragraphs[i-1]]
                targets.append((block, parts, 'formattedParagraphs'))
            elif block['kind'] == 'geotech-source-table':
                match = re.fullmatch(r'提取表\s+(\d+)', block.get('locator', ''))
                for cell in block['cells']:
                    origin = cell.get('sourceCell')
                    if origin:
                        if origin.get('source_id') != data['source_id']:
                            raise ValueError('Cell format provenance belongs to a different source')
                        index, row, column = (origin[k]-1 for k in ('table', 'row', 'column'))
                    elif match and not block.get('scope') and not block.get('continuation'):
                        index, row, column = int(match[1])-1, cell['row'], cell['column']
                    else:
                        audit['unmatched'].append({'section': section['title'], 'locator': block.get('locator'), 'reason': 'missing physical cell provenance'})
                        continue
                    if not all(isinstance(v, int) and v >= 0 for v in (index, row, column)) or index >= len(tables):
                        raise ValueError('Cell format provenance is outside source tables')
                    targets.append((cell, tables[index].get((row, column), []), 'formattedCells'))
            for target, parts, counter in targets:
                if not any(r.get('verticalAlign') for r in parts):
                    continue
                fitted = fit(parts, target['text'])
                if fitted is None:
                    audit['unmatched'].append({'section': section['title'], 'locator': block.get('locator'), 'paragraphs': block.get('sourceParagraphs')})
                    continue
                target['textRuns'] = fitted
                audit[counter] += 1
                audit['scriptRuns'] += sum(bool(r.get('verticalAlign')) for r in fitted)
    return result, audit


if __name__ == '__main__':
    docx, original, source, output = map(Path, sys.argv[1:5])
    data = json.loads(source.read_text(encoding='utf8'))
    if hashlib.sha256(original.read_bytes()).hexdigest() != data['hash']:
        raise ValueError('Original source hash does not match section contract')
    enriched, audit = enrich(data, *read_runs(docx))
    output.write_text(json.dumps(enriched, ensure_ascii=False), encoding='utf8')
    output.with_suffix('.audit.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps(audit, ensure_ascii=False))
