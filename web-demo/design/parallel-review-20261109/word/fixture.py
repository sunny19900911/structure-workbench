import json
from pathlib import Path
from docx import Document
from docx.shared import Mm, Pt
ROOT=Path(__file__).resolve().parents[3]
qa=ROOT/'qa/parallel-review-20261109/word'
qa.mkdir(parents=True,exist_ok=True)
doc=Document()
doc.sections[0].page_width=Mm(210);doc.sections[0].page_height=Mm(297)
doc.add_heading('Word 真实编辑验收',0)
doc.add_paragraph('这是需要在线修改的正文。')
doc.add_paragraph('参数插入位置：')
table=doc.add_table(rows=1, cols=2);table.style='Table Grid'
table.rows[0].cells[0].text='参数';table.rows[0].cells[1].text='取值'
for label,value in [('桩基结构安全等级','二级'),('桩基重要性系数','桩土承载力 1.0；桩身承载力 1.1'),('基础结构重要性系数','1.0')]:
    row=table.add_row();row.cells[0].text=label;row.cells[1].text=value
for p in doc.paragraphs:
    for run in p.runs:run.font.size=Pt(12)
doc.save(qa/'word-input.docx')
