"""Compare same-source native PDF reads; report changes without grading them.

Usage: python audit-native-recovery.py old-report.json new-report.json output.json
Original values and geometry stay in the private reports, never in this code.
"""
import json
import sys
from pathlib import Path


def audit(old, new):
    if not old.get('sha256') or old['sha256'] != new.get('sha256'):
        raise ValueError('Only the same original PDF may be compared')
    if [p['page'] for p in old['pages']] != [p['page'] for p in new['pages']]:
        raise ValueError('Page inventory changed; review separately')
    changes, pending, resolutions, unmatched = [], [], [], []
    paragraphs_unchanged = True
    for before, after in zip(old['pages'], new['pages']):
        paragraph = lambda p: [b for b in p['blocks'] if b['kind'] == 'paragraph']
        paragraphs_unchanged &= paragraph(before) == paragraph(after)
        tables = lambda p: {tuple(round(v,4) for v in b.get('sourceBBox',b['bbox'])): b for b in p['blocks'] if b['kind'] == 'table'}
        a, b = tables(before), tables(after)
        if a.keys() != b.keys():
            unmatched.append({'page': after['page'], 'old': list(a), 'new': list(b)})
        for bbox, table in b.items():
            page = after['page']
            if bbox in a and a[bbox]['rows'] != table['rows']:
                changes.append({'page': page, 'bbox': list(bbox), 'oldRows': a[bbox]['rows'], 'newRows': table['rows']})
            cells = {tuple(c['bbox']): c for row in table.get('cellOrigins', []) for c in row if c}
            for box, cell in cells.items():
                if cell.get('requiresReview'):
                    pending.append({'page': page, 'bbox': list(box), 'originalText': cell.get('unreviewedText', ''), 'text': cell['text']})
            for resolution in table.get('numericBoundaryResolutions', []):
                resolutions.append({'page': page, **resolution})
    return {'scope': 'Same-PDF extraction differences, not an accuracy score',
            'geometryComparisonFrame': 'original source page; coordinates rounded to 0.0001 PDF point',
            'pageOrientations': [{'page':p['page'],**p['orientation']} for p in new['pages'] if p.get('orientation')],
            'sourceHash': new['sha256'], 'pages': len(new['pages']),
            'ocrPendingPages': [p['page'] for p in new['pages'] if p['method'] == 'ocr_pending'],
            'paragraphsUnchanged': paragraphs_unchanged, 'unmatchedTableGeometry': unmatched,
            'changedTables': changes, 'pendingPhysicalCells': pending, 'resolvedRows': resolutions}


if __name__ == '__main__':
    before, after, output = map(Path, sys.argv[1:4])
    result = audit(json.loads(before.read_text(encoding='utf8')), json.loads(after.read_text(encoding='utf8')))
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps({k: v for k, v in result.items() if k not in ('changedTables', 'pendingPhysicalCells', 'resolvedRows', 'unmatchedTableGeometry')}, ensure_ascii=False))
    print(json.dumps({k: len(result[k]) for k in ('changedTables', 'pendingPhysicalCells', 'resolvedRows', 'unmatchedTableGeometry')}))
