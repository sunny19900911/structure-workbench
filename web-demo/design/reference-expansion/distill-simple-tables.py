"""Derived two-column tables; original Word samples remain read-only."""
from pathlib import Path
from copy import deepcopy
import json
from lxml import etree as E

root = Path(__file__).resolve().parents[2]
path = root / 'reference-template-data.js'
data = json.loads(path.read_text(encoding='utf-8').removeprefix('export const REFERENCE_TABLES=').strip().removesuffix(';'))
native_path = root / 'design/reference-expansion/native-tables.json'
native = json.loads(native_path.read_text(encoding='utf-8'))
w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
ns = {'w': w}
q = lambda k: '{' + w + '}' + k
for original, target in [(4,21),(13,22),(14,23),(15,24)]:
    meta = deepcopy(data[str(original)])
    table = E.fromstring(native['tables'][str(original)].encode())
    grid = table.find('w:tblGrid', ns)
    assert len(grid) == 3
    width = int(grid[1].get(q('w'))) + int(grid[2].get(q('w')))
    grid[1].set(q('w'), str(width))
    grid.remove(grid[2])
    meta['grid'] = [meta['grid'][0], sum(meta['grid'][1:])]
    for row, cells in zip(table.findall('w:tr', ns), meta['rows']):
        tc = row.findall('w:tc', ns)
        assert len(tc) == len(cells) == 3
        tc[1].find('w:tcPr/w:tcW', ns).set(q('w'), str(width))
        row.remove(tc[2])
        cells[1]['width'] = width
        cells.pop()
    data[str(target)] = meta
    native['tables'][str(target)] = E.tostring(table, encoding='unicode')
path.write_text('export const REFERENCE_TABLES=' + json.dumps(data, ensure_ascii=False) + ';\n', encoding='utf-8')
native_path.write_text(json.dumps(native, ensure_ascii=False), encoding='utf-8')
print('Derived classification and load tables: standards column removed.')
