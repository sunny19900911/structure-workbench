"""Assemble source-bound OCR candidates by physical row, never by soil name."""
import json
import sys
from pathlib import Path


def assemble(manifest):
    identity = manifest['identity']
    required = ('sourceSha256', 'pageImageSha256', 'physicalPage')
    if any(not identity.get(k) for k in required):
        raise ValueError('Missing document/page identity')
    for column, label in [('3', '层厚m'), ('4', '层顶标高m')]:
        header = manifest['headerEvidence'].get(column, {})
        if header.get('label') != label:
            raise ValueError('Missing or incompatible quantity/unit header')
        if header.get('headerRecognition') == 'visual-review-not-ocr':
            review = header.get('headerReview', {})
            if review.get('sourceImageSha256') != identity['pageImageSha256'] or review.get('method') != 'visual-review':
                raise ValueError('Header review belongs to another page')
    expected = manifest['expectedRows']
    if not expected or any(type(r) is not int or r < 1 for r in expected) or len(set(expected)) != len(expected):
        raise ValueError('Invalid physical rows')
    grid = {(c['row'], c['column']): c for c in manifest['cells']}
    if len(grid) != len(manifest['cells']):
        raise ValueError('Duplicate physical cell')
    rows = {r: {} for r in expected}
    columns = {'layerCode': 1, 'soilName': 2, 'thicknessRange': 3,
               'thicknessMean': 3, 'thicknessOriginal': 3, 'elevationRange': 4, 'elevationMean': 4}
    for field in manifest['fields']:
        if any(field['identity'].get(k) != identity[k] for k in required):
            raise ValueError('Mixed document or page')
        row, key = field['row'], field['key']
        if row not in rows or key not in columns or key in rows[row]:
            raise ValueError('Unknown row/field or duplicate field')
        cell = grid.get((row, columns[key]))
        if not cell or field['bbox'] != cell['bbox']:
            raise ValueError('Field does not match physical cell')
        if field['comparison'].get('automaticAdoption') is not False:
            raise ValueError('Expected unadopted OCR evidence')
        rows[row][key] = field
    result = []
    for row, fields in rows.items():
        if 'thicknessOriginal' in fields and any(k in fields for k in ('thicknessRange', 'thicknessMean')):
            raise ValueError('Competing thickness layouts')
        needed = ['layerCode', 'soilName', 'elevationRange', 'elevationMean']
        needed += ['thicknessOriginal'] if 'thicknessOriginal' in fields else ['thicknessRange', 'thicknessMean']
        missing = [k for k in needed if k not in fields]
        # Repeated OCR views can make the same mistake (real scan: 土 -> 上).
        # Agreement is a diagnostic, never source verification.
        agreement = [k for k, f in fields.items() if f['comparison']['status'] == 'view-agreement']
        pending = list(fields)
        result.append({'physicalRow': row, 'fields': fields, 'missingFields': missing,
                       'reviewFields': pending, 'viewAgreementFields': agreement,
                       'sourceVerification': 'not-recorded', 'automaticAdoption': False})
    return {'identity': identity, 'headerEvidence': manifest['headerEvidence'],
            'rows': result, 'automaticAdoption': False, 'status': 'candidate-table'}


if __name__ == '__main__':
    source, destination = map(Path, sys.argv[1:3])
    destination.write_text(json.dumps(assemble(json.loads(source.read_text(encoding='utf8'))),
                                     ensure_ascii=False, indent=2), encoding='utf8')
