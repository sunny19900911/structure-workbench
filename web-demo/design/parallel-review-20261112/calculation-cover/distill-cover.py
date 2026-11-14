"""Derive only from the reviewed Word conversion; never touch the source DOC."""
import hashlib
import importlib.util
import json
import zipfile
from pathlib import Path
from lxml import etree
from docx import Document

ROOT=Path(__file__).resolve().parents[3]
QA=ROOT/'qa/portable-release/calculation-cover-20261112'
SOURCE=Path('E:/!!!!!!!!TO HOME/QS-324 计算书封面（行政审定不用签字）.DOC')
REFERENCE=QA/'reference/reference.docx'
SOURCE_SHA='fac7d691fcd6d7bd5447b4dcf46b710199d1e5893011d1296ca3e26ee98ff401'
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==SOURCE_SHA
assert hashlib.sha256(REFERENCE.read_bytes()).hexdigest()=='3583504f3fc975b96890dd1b5c251fc996b09c67848fc029434afa7d13d53c72'
spec=importlib.util.spec_from_file_location('builder',ROOT/'scripts/build-calculation-book.py')
builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
doc=Document(REFERENCE)
builder.configure_cover_layout(doc)
builder.apply_current_cover(doc,{'company':'同济大学建筑设计研究院(集团)有限公司'})
body=etree.tostring(doc.element,xml_declaration=True,encoding='UTF-8',standalone=True)
target=ROOT/'assets/calculation-book/cover-reference.docx'
QA.mkdir(parents=True,exist_ok=True)
backup=QA/'previous-cover-reference.docx'
if target.exists() and not backup.exists():backup.write_bytes(target.read_bytes())
with zipfile.ZipFile(REFERENCE) as source,zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as result:
    for info in source.infolist():
        data=source.read(info)
        if info.filename=='word/document.xml':data=body
        elif info.filename=='docProps/core.xml':
            xml=etree.fromstring(data)
            for node in xml:
                if etree.QName(node).localname in ('creator','lastModifiedBy','description','keywords','title','subject'):node.text=''
            data=etree.tostring(xml,xml_declaration=True,encoding='UTF-8',standalone=True)
        result.writestr(info,data)
with zipfile.ZipFile(REFERENCE) as source,zipfile.ZipFile(target) as result:
    changed=[name for name in source.namelist() if source.read(name)!=result.read(name)]
    assert set(changed)<= {'word/document.xml','docProps/core.xml'}
    assert set(source.namelist())==set(result.namelist())
record={'source':str(SOURCE),'sourceSha256':SOURCE_SHA,'referenceSha256':hashlib.sha256(REFERENCE.read_bytes()).hexdigest(),'asset':'assets/calculation-book/cover-reference.docx','assetSha256':hashlib.sha256(target.read_bytes()).hexdigest(),'changedPackageParts':changed,'preservedPackageParts':len(source.namelist())-len(changed)}
(ROOT/'design/parallel-review-20261112/calculation-cover/source-manifest.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(record,ensure_ascii=False))
