"""Recheck saved example against both immutable source files and real OOXML anchors."""
import json
from pathlib import Path
from zipfile import ZipFile
from lxml import etree as E
from requirements import compare, digest, extract, report

example = Path(__file__).parent / 'examples/existing-reference-validated'
reference = json.loads((example/'requirements.json').read_text(encoding='utf-8'))
actual = json.loads((example/'actual-structure.json').read_text(encoding='utf-8'))
for record in (reference, actual):
    path = Path(record['source']['path'])
    assert digest(path) == record['source']['sha256'], path
    refreshed = extract(path)
    assert refreshed == record, 'Saved extraction differs from current reader or source'
    with ZipFile(path) as z:
        documents = {}
        for item in record['requirements']:
            locator = item['locator']; part = locator['part']
            if part not in documents: documents[part] = E.fromstring(z.read(part))
            root = documents[part]
            assert len(root.xpath(locator['xpath'], namespaces={'w': E.QName(root).namespace})) == 1, locator
            assert item['mandatory'] is False
    assert digest(path) == record['source']['sha256']
result = compare(reference, actual)
assert result == json.loads((example/'comparison.json').read_text(encoding='utf-8'))
assert report(result) == (example/'检查结果.md').read_text(encoding='utf-8')
print(json.dumps({'source_hashes_unchanged': True, 'all_locations_resolve': True,
                  'reference_counts': reference['counts'], 'actual_counts': actual['counts'],
                  'observed_comparison_counts': result['counts'], 'pass_rate': None}, ensure_ascii=False))
