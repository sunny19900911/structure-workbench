from pathlib import Path
import zipfile
from lxml import etree
p=Path('qa/portable-release/mcp/office/real-template');ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
for name in ['source','untouched']:
 root=etree.fromstring(zipfile.ZipFile(p/(name+'.docx')).read('word/document.xml'))
 print(name)
 for index,table in enumerate(root.xpath('//w:tbl',namespaces=ns)):
  for rowno,row in enumerate(table.xpath('./w:tr',namespaces=ns)):
   for cellno,cell in enumerate(row.xpath('./w:tc',namespaces=ns)):
    text=''.join(cell.xpath('.//w:t/text()',namespaces=ns))
    if '同建筑设计说明' in text:
     print({'table':index,'row':rowno,'cell':cellno,'text':text,'vmerge':[v.get('{'+ns['w']+'}val','continue') for v in cell.xpath('./w:tcPr/w:vMerge',namespaces=ns)]})
