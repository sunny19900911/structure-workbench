import json
import hashlib
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw
import pdfplumber
import pypdfium2 as pdfium

ROOT=Path(__file__).resolve().parents[3]
QA=ROOT/'qa/portable-release/calculation-cover-logo-20261113'
cases={'original-doc':QA/'direct-doc-render/word-render.pdf',
       'converted-reference':ROOT/'qa/portable-release/calculation-cover-20261112/converted-reference-render/word-render.pdf',
       'previous-live':QA/'live-render/word-render.pdf'}
cases.update({name:QA/(name+'-render')/'word-render.pdf' for name in ['native-company','other-company','empty-company']})
if (QA/'fixed/render/word-render.pdf').exists():
    cases['fixed-empty-company']=QA/'fixed/render/word-render.pdf'
report={};crops=[]
for name,path in cases.items():
    with pdfplumber.open(path) as pdf:
        page=pdf.pages[0]
        logo=page.images[0]
        lines=page.crop((185,700,550,780)).extract_text() or ''
        chars=[c for c in page.chars if c['top']>700 and c['x0']>185]
        groups={}
        for c in chars:
            top=round(c['top'],1)
            groups.setdefault(top,[]).append(c)
        report[name]={'logoBboxPt':[logo[k] for k in ('x0','top','x1','bottom')],
                      'companyLines':[{'text':''.join(c['text'] for c in row),'bboxPt':[min(c['x0'] for c in row),min(c['top'] for c in row),max(c['x1'] for c in row),max(c['bottom'] for c in row)]} for top,row in sorted(groups.items())],
                      'text':lines}
    document=pdfium.PdfDocument(str(path))
    bitmap=document[0].render(scale=2).to_pil().convert('RGB')
    crop=bitmap.crop((240,1390,1100,1570));crop.save(QA/(name+'-logo.png'));crops.append((name,crop))
ref=report['converted-reference']['logoBboxPt']
for name,entry in report.items():entry['logoDeltaFromConvertedPt']=[round(a-b,4) for a,b in zip(entry['logoBboxPt'],ref)]
native=Image.open(QA/'native-company-logo.png').convert('RGB')
reference=Image.open(QA/'converted-reference-logo.png').convert('RGB')
report['nativeCompanyPixelIdenticalToConverted']=ImageChops.difference(native,reference).getbbox() is None
if 'fixed-empty-company' in cases:
    fixed=Image.open(QA/'fixed-empty-company-logo.png').convert('RGB')
    report['fixedEmptyCompanyPixelIdenticalToConverted']=ImageChops.difference(fixed,reference).getbbox() is None
    assert report['fixedEmptyCompanyPixelIdenticalToConverted']
sheet=Image.new('RGB',(900,len(crops)*220),'white')
draw=ImageDraw.Draw(sheet)
for i,(name,crop) in enumerate(crops):draw.text((10,i*220+5),name,fill='black');sheet.paste(crop,(10,i*220+25))
sheet.save(QA/'Logo原件与当前入口对照.png')
source=Path('E:/!!!!!!!!TO HOME/QS-324 计算书封面（行政审定不用签字）.DOC')
report['sourceSha256']=hashlib.sha256(source.read_bytes()).hexdigest()
(QA/'diagnosis.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
