"""Verify native output of browser-smoke.mjs, including untouched roundtrip."""
from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256
from lxml import etree
import json, sys

folder = Path(sys.argv[1] if len(sys.argv)>1 else 'qa/portable-release/mcp/office-word-tools')
ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
W = '{' + ns['w'] + '}'

def read(name):
    with ZipFile(folder / (name + '.docx')) as z:
        assert z.testzip() is None
        for part in z.namelist():
            if part.endswith('.xml'):
                etree.fromstring(z.read(part))
        root = etree.fromstring(z.read('word/document.xml'))
        facts = {
            'text': ''.join(root.xpath('//w:t/text()', namespaces=ns)),
            'sections': [dict(node.attrib) for node in root.xpath('//w:sectPr/w:pgSz | //w:sectPr/w:cols', namespaces=ns)],
            'tables': len(root.xpath('//w:tbl', namespaces=ns)),
            'spans': root.xpath('//w:gridSpan/@w:val', namespaces=ns),
            'images': sorted(sha256(z.read(p)).hexdigest() for p in z.namelist() if p.startswith('word/media/') and not p.endswith('/')),
            'headers': sorted(''.join(etree.fromstring(z.read(p)).xpath('//w:t/text()', namespaces=ns)) for p in z.namelist() if p.startswith(('word/header', 'word/footer')) and p.endswith('.xml')),
        }
        return root, facts, etree.fromstring(z.read('word/numbering.xml'))

source, sf, _ = read('source')
untouched, uf, _ = read('untouched')
assert sf == uf, 'Untouched DOCX changed visible content/geometry/media'
root, final, numbering = read('edited')
download, downloaded, _ = read('download')
assert final == downloaded, 'Download differs from saved content'
assert final['sections'] == sf['sections']
assert final['headers'] == sf['headers']
assert set(sf['images']) <= set(final['images'])
assert final['tables'] == 2
assert '测试连廊' not in final['text'] and '高度（m）' not in final['text']
assert '冲突后人工稿保留。' in final['text']
assert len(root.xpath('//w:drawing', namespaces=ns)) == 2
assert len(root.xpath('//w:tbl[2]/w:tr', namespaces=ns)) == 2

def paragraph(text):
    return next(p for p in root.xpath('//w:p', namespaces=ns) if text in ''.join(p.xpath('.//w:t/text()', namespaces=ns)))

p = paragraph('网页已经修改并保存。')
spacing = p.find('w:pPr/w:spacing', ns)
assert {key: spacing.get(W + key) for key in ['before', 'after', 'line', 'lineRule']} == {'before':'360','after':'240','line':'480','lineRule':'auto'}
assert p.find('w:pPr/w:jc', ns).get(W + 'val') == 'right'
run = next(r for r in p.findall('w:r', ns) if '网页已经' in ''.join(r.xpath('.//w:t/text()', namespaces=ns)))
for mark in ['b', 'i', 'u', 'strike']:
    assert run.find('w:rPr/w:' + mark, ns) is not None
assert run.find('w:rPr/w:color', ns).get(W + 'val').lower() == '112233'
assert run.find('w:rPr/w:highlight', ns).get(W + 'val') == 'yellow'
assert run.find('w:rPr/w:sz', ns).get(W + 'val') == '28'
assert '仿宋' in str(run.find('w:rPr/w:rFonts', ns).attrib)
assert paragraph('图 1 测试').find('w:pPr/w:pStyle', ns).get(W + 'val') == 'Heading1'
for text, expected in [('24. 结构', 'bullet'), ('25. 结构', 'decimal')]:
    ppr = paragraph(text).find('w:pPr', ns)
    num_id = ppr.find('w:numPr/w:numId', ns).get(W + 'val')
    abstract_id = numbering.xpath(f'//w:num[@w:numId="{num_id}"]/w:abstractNumId/@w:val', namespaces=ns)[0]
    formats = numbering.xpath(f'//w:abstractNum[@w:abstractNumId="{abstract_id}"]/w:lvl[@w:ilvl="0"]/w:numFmt/@w:val', namespaces=ns)
    assert formats == [expected], formats
    assert ppr.find('w:numPr/w:ilvl', ns).get(W + 'val') == '0'

report = {'passed': True, 'untouchedRoundtrip': True, 'downloadMatchesSave': True, 'A3TwoColumnsPreserved': True, 'headerFooterAndOriginalImagePreserved': True, 'style': 'Heading1', 'spacing': {'beforePt':18, 'afterPt':12, 'lineMultiple':2}, 'lists':['bullet','decimal'], 'tables':2, 'pictures':2}
(folder / 'docx-verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
