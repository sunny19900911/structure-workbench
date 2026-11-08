"""Synthetic document only: A3 landscape, two columns, merged cells, picture."""
from pathlib import Path
import sys, json, zipfile
from docx import Document
from docx.shared import Mm, Pt
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from PIL import Image, ImageDraw
from lxml import etree

folder=Path(sys.argv[1]);folder.mkdir(parents=True,exist_ok=True)
doc=Document();section=doc.sections[0]
section.page_width=Mm(420);section.page_height=Mm(297)
section.top_margin=section.bottom_margin=Mm(18)
section.left_margin=section.right_margin=Mm(20)
section._sectPr.get_or_add_pgSz().set(qn('w:orient'),'landscape')
cols=section._sectPr.find(qn('w:cols'));cols.set(qn('w:num'),'2');cols.set(qn('w:space'),'720')
doc.styles['Normal'].font.name='宋体';doc.styles['Normal'].font.size=Pt(10.5)
doc.add_heading('结构初步设计说明 · 离线编辑验收',0)
doc.add_paragraph('本项目位于昆明市经开区。此处为人工修改测试段落。')
doc.add_heading('表 1 结构单体性质和基本信息',1)
table=doc.add_table(rows=4,cols=3);table.style='Table Grid'
table.autofit=False
for column in table.columns:column.width=Mm(55)
for row in table.rows:
 for cell in row.cells:cell.width=Mm(55)
table.cell(0,0).merge(table.cell(0,2)).text='测试教学楼基本信息'
for cell,text in zip(table.rows[1].cells,['单体名称','层数','高度（m）']):cell.text=text
for cell,text in zip(table.rows[2].cells,['测试教学楼','5','23.70']):cell.text=text
for cell,text in zip(table.rows[3].cells,['测试连廊','2','9.50']):cell.text=text
png=folder/'picture.png';im=Image.new('RGB',(320,120),'#ddedf2');ImageDraw.Draw(im).rectangle((20,25,300,95),outline='#426270',width=3);im.save(png)
doc.add_picture(str(png),width=Mm(85));doc.add_paragraph('图 1 测试总体示意图')
for i in range(25):doc.add_paragraph(f'{i+1}. 结构设计说明验收文本。该段用于检验双栏排版、表格位置和内容保存，所有数据均为合成测试数据。')
section.header.paragraphs[0].text='本机编辑验收页眉';section.footer.paragraphs[0].text='本机编辑验收页脚'
source=folder/'A3双栏测试.docx';doc.save(source)
def facts(path):
 with zipfile.ZipFile(path) as z:
  root=etree.fromstring(z.read('word/document.xml'));ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
  sections=[]
  for s in root.xpath('//w:sectPr',namespaces=ns):
   size=s.find('w:pgSz',ns);col=s.find('w:cols',ns)
   sections.append({'width':size.get(qn('w:w')),'height':size.get(qn('w:h')),'columns':col.get(qn('w:num'))})
  return {'text':''.join(root.xpath('//w:t/text()',namespaces=ns)),'sections':sections,'tableCount':len(root.xpath('//w:tbl',namespaces=ns)),'mergedSpans':root.xpath('//w:gridSpan/@w:val',namespaces=ns),'images':len([n for n in z.namelist() if n.startswith('word/media/') and not n.endswith('/')]),'header':''.join(z.read(n).decode() for n in z.namelist() if n.startswith('word/header') and n.endswith('.xml'))}
report={'source':facts(source)}
edited=folder/'edited.docx'
if edited.exists():
 report['edited']=facts(edited)
 assert report['edited']['sections']==report['source']['sections']
 assert report['edited']['tableCount']==report['source']['tableCount']
 assert report['edited']['mergedSpans']==report['source']['mergedSpans']
 assert report['edited']['images']==report['source']['images']
 assert '网页已经修改并保存。' in report['edited']['text']
 assert '本机编辑验收页眉' in report['edited']['header']
(folder/'word-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:{j:v for j,v in d.items() if j not in ['text','header']} for k,d in report.items()},ensure_ascii=False))
