import json
import hashlib
from pathlib import Path
from lxml import etree
from docx import Document
from docx.oxml.ns import qn
from PIL import Image, ImageChops
import pypdfium2 as pdfium
import pdfplumber

ROOT=Path(__file__).resolve().parents[3]
QA=ROOT/'qa/portable-release/calculation-cover-left-20261113'
REF=ROOT/'qa/portable-release/calculation-cover-20261112/reference/reference.docx'
path=QA/'计算书-封面按母件靠左-全部单栏.docx'
original=Document(REF)
final=Document(path)
def properties(document,tag):
    return [etree.tostring(e,method='c14n') for table in document.tables[:5] for e in table._tbl.iter(qn('w:'+tag))]
for tag in ['tblPr','tblGrid','trPr','tcPr','pPr']:
    assert properties(original,tag)==properties(final,tag),tag
# Existing run properties remain in order; text inserted into originally empty cells
# gets a copy of that paragraph's native paragraph-end run properties.
for ot,ft in zip(original.tables,final.tables[:5]):
    for op,fp in zip(ot._tbl.iter(qn('w:p')),ft._tbl.iter(qn('w:p'))):
        old=[etree.tostring(e,method='c14n') for e in op.iter(qn('w:rPr'))]
        new=[etree.tostring(e,method='c14n') for e in fp.iter(qn('w:rPr'))]
        assert new[:len(old)]==old
for section in final.sections:
    cols=section._sectPr.find(qn('w:cols'))
    assert dict(cols.attrib)=={qn('w:num'):'1'} and not len(cols)
assert not final.element.xpath('.//w:br[@w:type="column"]')
os,fs=original.sections[0],final.sections[0]
assert fs.gutter==os.gutter and fs.page_width==os.page_width and fs.page_height==os.page_height
for field in ['left_margin','top_margin','bottom_margin','header_distance','footer_distance']:
    assert getattr(fs,field)==getattr(os,field),field
assert fs.right_margin.twips==11834
pdf=pdfium.PdfDocument(str(QA/'render/word-render.pdf'))
for i,page in enumerate(pdf):page.render(scale=1.5).to_pil().save(QA/'render'/f'page-{i+1}.png')
reference_image=Image.open(ROOT/'qa/portable-release/calculation-cover-20261112/converted-reference-render/page-1.png').convert('RGB')
final_image=Image.open(QA/'render/page-1.png').convert('RGB')
regions={'title':(260,75,800,220),'labels':(280,236,400,1030),'logo':(190,1060,800,1160)}
differences={name:ImageChops.difference(reference_image.crop(box),final_image.crop(box)).getbbox() for name,box in regions.items()}
with pdfplumber.open(QA/'render/word-render.pdf') as final_pdf, pdfplumber.open(ROOT/'qa/portable-release/calculation-cover-20261112/converted-reference-render/word-render.pdf') as ref_pdf:
    def title_bounds(page):
        chars=[c for c in page.chars if 70<c['top']<120 and c['text'].strip()]
        return [min(c['x0'] for c in chars),max(c['x1'] for c in chars)]
    before,after=title_bounds(ref_pdf.pages[0]),title_bounds(final_pdf.pages[0])
    assert max(abs(a-b) for a,b in zip(before,after))<0.1,(before,after)
    def label_characters(page):
        return [c for c in page.chars if 180<c['x0']<266 and 150<c['top']<685]
    old_labels,new_labels=label_characters(ref_pdf.pages[0]),label_characters(final_pdf.pages[0])
    assert [c['text'] for c in old_labels]==[c['text'] for c in new_labels]
    label_shift=max(abs(a[key]-b[key]) for a,b in zip(old_labels,new_labels) for key in ('x0','top'))
    assert label_shift<0.2,label_shift
    assert len(final_pdf.pages)==5
    assert len(final_pdf.pages[0].images)==1
report={'pass':True,'sectionColumns':[1]*len(final.sections),'rightMarginTwips':fs.right_margin.twips,'gutterTwips':fs.gutter.twips,'titleBoundsReferencePt':before,'titleBoundsFinalPt':after,'maximumLabelShiftPt':label_shift,'fixedRegionPixelDifferenceBoxes':differences,'wordPages':len(pdf),'docx':str(path),'docxSha256':hashlib.sha256(path.read_bytes()).hexdigest()}
(QA/'layout-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
