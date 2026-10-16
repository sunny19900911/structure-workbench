"""Apply the existing A3/two-column settings to a generated Linux DOCX."""
import sys
from docx import Document
from docx.shared import Pt
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

path, kind = sys.argv[1:3]
doc = Document(path)
top, side, gap, gutter = (90,72,21.25,0) if kind == 'measures' else (85.05,70.9,52.5,28.35) if kind == 'regulations' else (56.7,62.35,24,0)
for section in doc.sections:
    section.page_width, section.page_height = Pt(1190.55), Pt(841.9)
    section.top_margin = section.bottom_margin = Pt(top)
    section.left_margin = section.right_margin = Pt(side)
    section.gutter = Pt(gutter)
    cols = section._sectPr.find(qn('w:cols'))
    if cols is None:
        cols = OxmlElement('w:cols')
        section._sectPr.append(cols)
    for child in list(cols):
        cols.remove(child)
    cols.set(qn('w:num'), '2')
    cols.set(qn('w:equalWidth'), '1')
    cols.set(qn('w:space'), str(round(gap*20)))
doc.save(path)
