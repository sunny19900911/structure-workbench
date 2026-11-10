"""Compare reviewed layer rows with OCR cells, not loose number occurrence.

Usage: python score-scan-bands.py manifest.json full-page-dir bands-dir output.json
Each expected row is [sequence, stratum, depth, thickness, layer velocity].
Raw OCR HTML is retained separately. This evaluator does not correct OCR.
"""
import json
import sys
from pathlib import Path
from lxml import html


def table_rows(path):
    tables = []
    def visit(value):
        if isinstance(value, dict):
            if value.get('type') == 'table_body' and isinstance(value.get('content'), str):
                table = html.fromstring(value['content'])
                tables.append([[c.text_content().strip() for c in row.xpath('./td|./th')]
                               for row in table.xpath('.//tr')])
            for child in value.values(): visit(child)
        elif isinstance(value, list):
            for child in value: visit(child)
    visit(json.loads(path.read_text(encoding='utf8')))
    return tables


def score(tables, expected_rows):
    checks = []
    for expected in expected_rows:
        candidates = [row for table in tables for row in table if len(row) >= 5
                      and row[0] == expected[0] and row[1] == expected[1]]
        row = candidates[0] if len(candidates) == 1 else []
        recognized = row[:4]+[row[-1]] if row else ['']*5
        checks.append({'expected': expected, 'recognized': recognized,
                       'matchingFields': [a == b for a, b in zip(expected, recognized)]})
    return {'matchingFields': sum(sum(c['matchingFields']) for c in checks),
            'total': len(checks)*5,
            'matchingNumericCells': sum(sum(c['matchingFields'][2:]) for c in checks),
            'numericTotal': len(checks)*3, 'checks': checks}


def main():
    manifest, full, bands, output = map(Path, sys.argv[1:5])
    pages = []
    for record in json.loads(manifest.read_text(encoding='utf8')):
        page = record['page']
        pages.append({'page': page, **{mode: score(table_rows(folder/f'page-{page}.json'), record['expectedRows'])
                                      for mode, folder in [('fullPage', full), ('bands', bands)]}})
    keys = ['matchingFields', 'total', 'matchingNumericCells', 'numericTotal']
    summary = {mode: {key: sum(page[mode][key] for page in pages) for key in keys}
               for mode in ['fullPage', 'bands']}
    output.write_text(json.dumps({'scope': 'unique layer row: first four OCR cells plus last velocity cell; headers excluded',
                                  'summary': summary, 'pages': pages, 'automaticAdoption': False},
                                 ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps(summary))


if __name__ == '__main__': main()
