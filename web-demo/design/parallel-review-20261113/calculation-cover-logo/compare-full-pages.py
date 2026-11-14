import json
import hashlib
from pathlib import Path
from PIL import Image, ImageDraw
import pypdfium2 as pdfium
import pdfplumber
from docx import Document
from docx.oxml.ns import qn

ROOT=Path(__file__).resolve().parents[3]
QA=ROOT/'qa/portable-release/calculation-cover-logo-20261113/full-source-live-compare'
paths={'original':QA/'current-source-direct.pdf','live':QA/'latest-live-render/word-render.pdf'}
report={};images={}
for name,path in paths.items():
    doc=pdfium.PdfDocument(str(path))
    images[name]=doc[0].render(scale=1.5).to_pil().convert('RGB')
    images[name].save(QA/(name+'-full-cover.png'))
    with pdfplumber.open(path) as pdf:
        page=pdf.pages[0]
        logo=page.images[0]
        def bounds(chars):
            return [min(c['x0'] for c in chars),min(c['top'] for c in chars),max(c['x1'] for c in chars),max(c['bottom'] for c in chars)]
        title=[c for c in page.chars if 70<c['top']<120 and c['text'].strip()]
        chinese=[c for c in page.chars if 700<c['top']<740 and c['x0']>185 and c['text'].strip()]
        english=[c for c in page.chars if 740<c['top']<755 and c['x0']>185 and c['text'].strip()]
        labels=[c for c in page.chars if 150<c['top']<685 and 180<c['x0']<266]
        report[name]={'pdfPages':len(pdf.pages),'pageSizePt':[page.width,page.height],
                      'titleBboxPt':bounds(title),'logoBboxPt':[logo[k] for k in ['x0','top','x1','bottom']],
                      'chineseBrandBboxPt':bounds(chinese),'englishBrandBboxPt':bounds(english),
                      'labelText':''.join(c['text'] for c in labels),'labelPositions':[[c['x0'],c['top']] for c in labels]}
for item in ['pageSizePt','titleBboxPt','logoBboxPt','chineseBrandBboxPt','englishBrandBboxPt']:
    report.setdefault('liveMinusOriginal',{})[item]=[round(b-a,5) for a,b in zip(report['original'][item],report['live'][item])]
if report['original']['labelText']==report['live']['labelText']:
    report['liveMinusOriginal']['maximumLabelShiftPt']=max(abs(a-b) for old,new in zip(report['original']['labelPositions'],report['live']['labelPositions']) for a,b in zip(old,new))
for item in report.values():
    if isinstance(item,dict):item.pop('labelPositions',None)
native=Document(QA/'latest-live.docx')
report['liveSectionColumns']=[s._sectPr.find(qn('w:cols')).get(qn('w:num'),'1') for s in native.sections]
report['liveBrandingText']=native.tables[4].cell(0,1).text
report['sourceAudit']=json.loads((QA/'current-source-audit.json').read_text(encoding='utf-8-sig'))
report['sourceHashAfter']=hashlib.sha256(Path('E:/!!!!!!!!TO HOME/QS-324 计算书封面（行政审定不用签字）.DOC').read_bytes()).hexdigest()
width=max(image.width for image in images.values());height=max(image.height for image in images.values())
sheet=Image.new('RGB',(width*2,height+50),'#eeeeee');draw=ImageDraw.Draw(sheet)
draw.text((20,15),'CURRENT ORIGINAL DOC - DIRECT WORD RENDER',fill='black')
draw.text((width+20,15),'LATEST LIVE 58727 - SYNTHETIC QA COVER',fill='black')
sheet.paste(images['original'],(0,50));sheet.paste(images['live'],(width,50))
sheet.save(QA/'原DOC直接渲染与最新live完整封面对照.png')
(QA/'full-page-comparison.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
