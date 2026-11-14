import hashlib
import json
import zipfile
from pathlib import Path
from lxml import etree
from docx import Document
from PIL import Image,ImageChops
import pypdfium2 as pdfium
import pdfplumber

ROOT=Path(__file__).resolve().parents[3]
QA=ROOT/'qa/portable-release/calculation-cover-20261112'
report={'renders':{}}
for name in ['reference','converted-reference-render','asset-render','final-render','version-render']:
    pdf=pdfium.PdfDocument(str(QA/name/'word-render.pdf'))
    report['renders'][name]={'pages':len(pdf),'sizesPt':[list(page.get_size()) for page in pdf]}
    for i,page in enumerate(pdf):page.render(scale=1.5).to_pil().save(QA/name/f'page-{i+1}.png')
reference=Image.open(QA/'reference/page-1.png').convert('RGB')
final=Image.open(QA/'final-render/page-1.png').convert('RGB')
assert reference.size==final.size
comparison=Image.new('RGB',(reference.width*2,reference.height),'white');comparison.paste(reference,(0,0));comparison.paste(final,(reference.width,0));comparison.save(QA/'新母件与实际导出封面对照.png')
# Text value columns are intentionally changed; title and label/brand positions are fixed.
stable={'title':(260,75,800,220),'labels':(280,236,400,1030),'brand':(190,1060,800,1160)}
converted=Image.open(QA/'converted-reference-render/page-1.png').convert('RGB')
report['unchangedRegions']={key:ImageChops.difference(converted.crop(box),final.crop(box)).getbbox() is None for key,box in stable.items()}
assert all(report['unchangedRegions'].values()),report['unchangedRegions']
docpath=Path(json.loads((QA/'browser-report.json').read_text(encoding='utf-8'))['docx'])
doc=Document(docpath)
texts='\n'.join(t for t in doc.element.itertext())
assert '{{' not in texts and '}}' not in texts
for token in ['科创园研发中心','QA-2026-324','1号研发楼','扩初']:assert token in texts
assert doc.tables[3].cell(0,1).paragraphs[0].text=='QA结构分析软件'
assert doc.tables[3].cell(0,1).paragraphs[1].text==''
versiondoc=Document(QA/'科创园研发中心-软件版本字段-API导出.docx')
assert [p.text for p in versiondoc.tables[3].cell(0,1).paragraphs]==['QA结构分析软件','QA-9.9']
with pdfplumber.open(QA/'version-render/word-render.pdf') as pdf:
    assert 'QA-9.9' in pdf.pages[0].extract_text()
    assert len(pdf.pages)==2
for token in ['2026-07-10','V01','施工图出图','盈建科建筑结构设计软件']:assert token not in texts
with pdfplumber.open(QA/'final-render/word-render.pdf') as pdf:
    report['pdfTextPages']=[page.extract_text() for page in pdf.pages]
    assert len(pdf.pages)==2
    assert '科创园研发中心' in report['pdfTextPages'][0]
    assert 'QA结构分析软件' in report['pdfTextPages'][0]
    assert '结构计算书内容' in report['pdfTextPages'][1]
with zipfile.ZipFile(docpath) as z:
    assert z.testzip() is None
    images=[n for n in z.namelist() if n.startswith('word/media/')]
    with zipfile.ZipFile(QA/'reference/reference.docx') as ref:
        report['logoBytesRetained']=all(z.read(n)==ref.read(n) for n in images)
assert report['logoBytesRetained']
source=Path('E:/!!!!!!!!TO HOME/QS-324 计算书封面（行政审定不用签字）.DOC')
report['sourceSha256']=hashlib.sha256(source.read_bytes()).hexdigest()
assert report['sourceSha256']=='fac7d691fcd6d7bd5447b4dcf46b710199d1e5893011d1296ca3e26ee98ff401'
report['docx']=str(docpath);report['docxSha256']=hashlib.sha256(docpath.read_bytes()).hexdigest();report['pass']=True
(QA/'render-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k!='pdfTextPages'},ensure_ascii=False))
