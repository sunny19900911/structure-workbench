import json
import hashlib
import zipfile
from pathlib import Path
from lxml import etree
from docx import Document
import pypdfium2 as pdfium

qa=Path(__file__).resolve().parents[3]/'qa/portable-release/calculation-cover-20261112'
ref=qa/'reference/reference.docx'
doc=Document(ref)
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
report={'sha256':hashlib.sha256(ref.read_bytes()).hexdigest(),'sections':[], 'paragraphs':[], 'tables':[], 'parts':[]}
for section in doc.sections:
    report['sections'].append({'sizeMm':[section.page_width.mm,section.page_height.mm],'marginsMm':[section.top_margin.mm,section.bottom_margin.mm,section.left_margin.mm,section.right_margin.mm],'xml':section._sectPr.xml})
for i,p in enumerate(doc.paragraphs):
    report['paragraphs'].append({'index':i,'text':p.text,'xml':p._p.xml})
for i,t in enumerate(doc.tables):
    report['tables'].append({'index':i,'rows':[[c.text for c in r.cells] for r in t.rows],'xml':t._tbl.xml})
with zipfile.ZipFile(ref) as z:
    for info in z.infolist():
        report['parts'].append({'name':info.filename,'size':info.file_size,'sha256':hashlib.sha256(z.read(info)).hexdigest()})
    report['allText']={name:etree.fromstring(z.read(name)).xpath('//w:t/text()',namespaces=ns) for name in z.namelist() if name.startswith('word/') and name.endswith('.xml')}
(qa/'reference/audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
pdf=pdfium.PdfDocument(str(qa/'reference/word-render.pdf'))
for i,page in enumerate(pdf):page.render(scale=1.5).to_pil().save(qa/f'reference/page-{i+1}.png')
print(json.dumps({k:v for k,v in report.items() if k in ['sha256','allText']},ensure_ascii=False))
print(json.dumps({'paragraphs':[{k:v for k,v in p.items() if k!='xml'} for p in report['paragraphs']],'tables':[{k:v for k,v in t.items() if k!='xml'} for t in report['tables']]},ensure_ascii=False))
