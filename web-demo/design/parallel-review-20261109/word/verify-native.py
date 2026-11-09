"""Check the actual UI downloads, not reconstructed ideal documents."""
import json
from pathlib import Path
from zipfile import ZipFile
from lxml import etree as E
from docx import Document
ROOT=Path(__file__).resolve().parents[3]
qa=ROOT/'qa/parallel-review-20261109/word'
names=['张涛','钟海杰','刘浩','金成','朱凤峰','周汉杰','冯锋','张伊楚']
def content(path):
    with ZipFile(path) as package:
        for name in package.namelist():
            if name.endswith('.xml'):E.fromstring(package.read(name))
    doc=Document(path)
    return doc, ''.join(doc.element.itertext())
word, text=content(qa/'word-downloaded.docx')
assert '网页键盘输入已生效。' in text and 'QA-WORD-01' in text
assert word.tables[0].rows[1].cells[1].text=='一级'
assert word.tables[0].rows[2].cells[1].text=='桩土承载力 1.0；桩身承载力 1.0'
assert word.tables[0].rows[3].cells[1].text=='1.1'
assert any(r.bold for p in word.paragraphs if '网页键盘输入已生效' in p.text for r in p.runs)
for name in ['cover-reference.docx','calculation-downloaded.docx']:
    path=ROOT/'assets/calculation-book'/name if name=='cover-reference.docx' else qa/name
    with ZipFile(path) as package:
        assert not any('/media/' in p or 'thumbnail' in p for p in package.namelist())
        xml=''.join(package.read(p).decode('utf-8','ignore') for p in package.namelist() if p.endswith('.xml'))
        assert not any(n in xml for n in names)
calc,text=content(qa/'calculation-downloaded.docx')
for expected in ['QA结构工作台教学楼','QA-WORD-01','QA教学楼','QA计算软件 1.0','QA设计单位']:assert expected in text,expected
assert '{{' not in text
assert abs(calc.sections[0].page_width.mm-420)<1 and abs(calc.sections[0].page_height.mm-297)<1
for filename,grade,gamma,pile in [('expansion-downloaded.docx','一级','1.1','桩土承载力 1.0；桩身承载力 1.1'),('generated-edited.docx','二级','1.0','桩土承载力 1.0；桩身承载力 1.0')]:
    doc,text=content(qa/filename)
    values={r.cells[0].text:r.cells[1].text for t in doc.tables for r in t.rows if len(r.cells)==2}
    assert values['桩基结构安全等级']==grade
    assert values['基础结构重要性系数']==gamma
    assert values['桩基结构重要性系数']==pile
    for expected in ['(1.0 + 0.0)','1/900（3 层）','1/750（5 层）','1.25（8 层）','1.33（9 层）']:assert expected in text,expected
    assert '中震下考虑双向地震作用' not in text
result={'status':'passed','files':['word-downloaded.docx','calculation-downloaded.docx','expansion-downloaded.docx','generated-edited.docx'],'checks':['all package XML parses','native table values','bold preserved','parameters inserted','model components and floors','A3 dimensions','cover identifiers and media removed','unit/software inherited']}
(qa/'native-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False))
