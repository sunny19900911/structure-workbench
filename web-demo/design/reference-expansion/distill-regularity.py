"""Single-unit version of the user's table 9.1-1; historical results are blanked."""
from pathlib import Path
from copy import deepcopy
from lxml import etree as E
import json,zipfile,hashlib
root=Path(__file__).resolve().parents[2]
source=Path('E:/600-工作台数据库/610-待处理/001-历史项目的设计说明/14-2026年-组团三-科研创新组团-初步设计说明-江苏无锡.docx')
w='http://schemas.openxmlformats.org/wordprocessingml/2006/main';ns={'w':w};q=lambda k:'{'+w+'}'+k
doc=E.fromstring(zipfile.ZipFile(source).read('word/document.xml'))
table=deepcopy(doc.findall('w:body/w:tbl',ns)[32]);grid=table.find('w:tblGrid',ns);cols=list(grid)
width=sum(int(c.get(q('w'))) for c in cols[3:]);cols[3].set(q('w'),str(width))
for c in cols[4:]:grid.remove(c)
rows=[]
for i,row in enumerate(table.findall('w:tr',ns)):
 cells=row.findall('w:tc',ns)
 for c in cells[4:]:row.remove(c)
 cells[3].find('w:tcPr/w:tcW',ns).set(q('w'),str(width))
 texts=[]
 for j,c in enumerate(cells[:4]):
  value=''.join(c.xpath('.//w:t/text()',namespaces=ns)) if j<3 else ('当前单体' if i==0 else '')
  value=value.replace('局部收件','局部收进')
  for n in c.xpath('.//w:t',namespaces=ns):n.text=''
  ts=c.xpath('.//w:t',namespaces=ns)
  if ts:ts[0].text=value
  texts.append({'text':value,'span':1,'merge':'','width':int(c.find('w:tcPr/w:tcW',ns).get(q('w')))})
 rows.append(texts)
path=root/'design/reference-expansion/native-tables.json';native=json.loads(path.read_text(encoding='utf-8'));native['tables']['20']=E.tostring(table,encoding='unicode');path.write_text(json.dumps(native,ensure_ascii=False),encoding='utf-8')
path=root/'reference-template-data.js';text=path.read_text(encoding='utf-8');data=json.loads(text.removeprefix('export const REFERENCE_TABLES=').strip().removesuffix(';'));data['20']={'rows':rows,'grid':[int(c.get(q('w'))) for c in grid]};path.write_text('export const REFERENCE_TABLES='+json.dumps(data,ensure_ascii=False)+';\n',encoding='utf-8')
(root/'design/reference-expansion/regularity-source.json').write_text(json.dumps({'source_id':'USER-REGULARITY-20261002','file':str(source),'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'table':'9.1-1','change':'保留前3列和一个单体列；判定结果清空；局部收件修正为局部收进'},ensure_ascii=False,indent=2),encoding='utf-8')
print('Single-unit regularity table distilled; source unchanged.')
