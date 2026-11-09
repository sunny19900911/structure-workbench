"""Validate actual MCP artifacts, without editing or reconstructing them."""
import json
from pathlib import Path
from zipfile import ZipFile
from lxml import etree
from docx import Document
qa=Path(__file__).resolve().parents[3]/'qa/parallel-review-20261109/integration'
result=json.loads((qa/'mcp-native-result.json').read_text(encoding='utf-8'))
assert result['status']=='passed' and not result['wordEditorOpened']
for kind,artifact in result['artifacts'].items():
    path=Path(artifact['path'])
    assert path.resolve().is_relative_to(qa.resolve())
    with ZipFile(path) as package:
        assert package.testzip() is None
        for name in package.namelist():
            if name.endswith('.xml'):etree.fromstring(package.read(name))
        if kind=='calculation':
            assert not any('/media/' in n or 'thumbnail' in n for n in package.namelist())
            xml=''.join(package.read(n).decode('utf-8','ignore') for n in package.namelist() if n.endswith('.xml'))
            for name in ['张涛','钟海杰','刘浩','金成','朱凤峰','周汉杰','冯锋','张伊楚']:assert name not in xml
    if kind=='pptx':
        from pptx import Presentation
        assert len(Presentation(path).slides)>0
        continue
    if kind=='xlsx':
        from openpyxl import load_workbook
        assert '项目参数' in load_workbook(path).sheetnames
        continue
    doc=Document(path);text=''.join(doc.element.itertext())
    if kind=='calculation':
        for value in ['QA结构工作台教学楼','QA-WORD-01','QA教学楼','MCP计算软件 2.0','QA设计单位']:assert value in text,value
        assert abs(doc.sections[0].page_width.mm-420)<1 and abs(doc.sections[0].page_height.mm-297)<1
    else:
        for value in ['(1.0 + 0.0)','1/900（3 层）','1/750（5 层）','1.25（8 层）','1.33（9 层）']:assert value in text,value
        cells={row.cells[0].text:row.cells[1].text for table in doc.tables for row in table.rows if len(row.cells)==2}
        for key,value in [('桩基结构安全等级','一级'),('基础结构重要性系数','1.1'),('桩基结构重要性系数','桩土承载力 1.0；桩身承载力 1.1')]:assert cells[key]==value,(key,cells.get(key))
        assert '中震下考虑双向地震作用' not in text
verification={'status':'passed','files':list(result['artifacts']),'checks':['model cases and floors','native table values without leading whitespace','current unit/software on A3 cover','historical identities and media absent','package XML valid']}
(qa/'mcp-native-verification.json').write_text(json.dumps(verification,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(verification,ensure_ascii=False))
