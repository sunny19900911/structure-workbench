"""Verify actual DOCX table and page geometry against the distilled reference."""
import json,sys,zipfile
from pathlib import Path
from lxml import etree as E
root=Path(__file__).resolve().parents[2]
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
patterns=json.loads((root/'design/reference-expansion/native-tables.json').read_text(encoding='utf-8'))
spec=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
actual=E.fromstring(zipfile.ZipFile(sys.argv[2]).read('word/document.xml'))
def shape(e):return None if e is None else (e.tag,dict(e.attrib),e.text or '',[shape(c) for c in e])
tables=actual.findall('w:body/w:tbl',ns)
expected=[b for b in spec['blocks'] if b['kind']=='table']
assert len(tables)==len(expected)
for table,b in zip(tables,expected):
 original=E.fromstring(patterns['tables'][str(b['template'])])
 for part in ['w:tblPr','w:tblGrid']:assert shape(table.find(part,ns))==shape(original.find(part,ns))
 for row,item in zip(table.findall('w:tr',ns),b['rows']):
  prototype=original.findall('w:tr',ns)[item['source']]
  assert shape(row.find('w:trPr',ns))==shape(prototype.find('w:trPr',ns))
  for cell,ref in zip(row.findall('w:tc',ns),prototype.findall('w:tc',ns)):
   assert shape(cell.find('w:tcPr',ns))==shape(ref.find('w:tcPr',ns))
base=E.fromstring(zipfile.ZipFile(root/'design/reference-expansion/base.docx').read('word/document.xml'))
for part in ['w:pgSz','w:pgMar','w:cols']:
 assert shape(actual.find('w:body/w:sectPr/'+part,ns))==shape(base.find('w:body/w:sectPr/'+part,ns))
assert len(actual.findall('.//w:drawing',ns))==sum(b['kind']=='image' for b in spec['blocks'])
print('PASS: native table widths, merged cells, row properties, A3 margins/columns and images;',len(tables),'tables')
