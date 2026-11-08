"""Office-free DOCX export for the existing measures and regulation HTML.

Only the server's cleaned HTML is accepted. Text, merged cells, numeric strings,
superscripts and subscripts are retained; no Office macros or external links run.
"""
import sys
from lxml import html
from docx import Document
from docx.shared import Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

def font(run, bold=False):
    run.font.name='Times New Roman';run.font.bold=bold
    run._element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'),'宋体')

def inline(p,node,bold=False,italic=False,sup=False,sub=False):
    bold=bold or node.tag in ('b','strong');italic=italic or node.tag in ('i','em')
    sup=sup or node.tag=='sup';sub=sub or node.tag=='sub'
    def text(value):
        if value:
            r=p.add_run(value);font(r,bold);r.italic=italic;r.font.superscript=sup;r.font.subscript=sub
    text(node.text)
    for child in node:
        if child.tag=='br':p.add_run().add_break()
        else:inline(p,child,bold,italic,sup,sub)
        text(child.tail)

def paragraph(parent,node,kind,cell=False):
    p=parent.add_paragraph()
    inline(p,node)
    tag=node.tag;fmt=p.paragraph_format
    fmt.space_before=Pt(0);fmt.space_after=Pt(0 if kind=='measures' else 1)
    fmt.line_spacing=1.5 if kind=='measures' else 1.0
    p.alignment=WD_ALIGN_PARAGRAPH.JUSTIFY
    if kind=='measures' and not cell:fmt.first_line_indent=Pt(24)
    if tag in ('h1','h2','h3'):
        fmt.keep_with_next=True;fmt.first_line_indent=Pt(0)
        for r in p.runs:r.bold=True;r.font.size=Pt(14 if kind=='measures' else 13 if tag=='h1' else 10.5)
    cls=node.get('class','')
    if cls in ('document-title','document-subtitle','regulation-heading','regulation-caption'):
        p.alignment=WD_ALIGN_PARAGRAPH.CENTER;fmt.first_line_indent=Pt(0)
        for r in p.runs:r.font.size=Pt(18 if cls=='document-title' else 10.5);r.bold=cls!='document-subtitle'
    return p

def table(doc,node,kind):
    rows=node.xpath('./tr|./thead/tr|./tbody/tr')
    if not rows:return
    slots={};layout=[];cols=0
    for ri,row in enumerate(rows):
        ci=0;items=[]
        for source in row.xpath('./td|./th'):
            while (ri,ci) in slots:ci+=1
            cs=max(1,int(source.get('colspan','1')));rs=max(1,int(source.get('rowspan','1')))
            if cs>64 or rs>len(rows) or ri+rs>len(rows):raise ValueError('表格合并范围不正确，未生成不完整文件')
            for r in range(ri,ri+rs):
                for c in range(ci,ci+cs):
                    if (r,c) in slots:raise ValueError('表格合并范围冲突')
                    slots[r,c]=True
            items.append((ci,cs,rs,source));ci+=cs
        cols=max(cols,ci);layout.append(items)
    if not cols:return
    t=doc.add_table(rows=len(rows),cols=cols);t.style='Table Grid';t.autofit=False
    width=(doc.sections[0].page_width-doc.sections[0].left_margin-doc.sections[0].right_margin-doc.sections[0].gutter-Pt(21.25 if kind=='measures' else 52.5))/2
    widths=[width/cols]*cols
    first=''.join(rows[0].itertext())
    if kind=='regulations' and cols==2 and '规范' in first:widths=[Pt(302.3),Pt(192.5)]
    for c,w in zip(t.columns,widths):c.width=int(w)
    for ri,items in enumerate(layout):
        if ri==0:
            repeat=OxmlElement('w:tblHeader');t.rows[ri]._tr.get_or_add_trPr().append(repeat)
        for ci,cs,rs,source in items:
            cell=t.cell(ri,ci)
            if cs>1 or rs>1:cell=cell.merge(t.cell(ri+rs-1,ci+cs-1))
            cell.width=int(sum(widths[ci:ci+cs]))
            for existing in list(cell._tc):
                if existing.tag!=qn('w:tcPr'):cell._tc.remove(existing)
            nodes=list(source)
            if nodes and all(n.tag in ('p','div','h1','h2','h3') for n in nodes) and not (source.text or '').strip():
                for n in nodes:paragraph(cell,n,kind,True)
            else:paragraph(cell,source,kind,True)
            for p in cell.paragraphs:
                p.paragraph_format.first_line_indent=Pt(0);p.paragraph_format.space_after=Pt(0)
                for run in p.runs:run.font.size=Pt(9 if kind=='measures' else 10.5)
    return t

def build(source,dest,kind):
    root=html.parse(source,html.HTMLParser(encoding='utf-8')).getroot().find('body');doc=Document()
    style=doc.styles['Normal'];style.font.name='Times New Roman';style.font.size=Pt(12 if kind=='measures' else 9.5)
    style.element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'),'宋体')
    for section in doc.sections:
        section.page_width=Pt(1190.55);section.page_height=Pt(841.9)
        top,side,gap,gutter=(90,72,21.25,0) if kind=='measures' else (85.05,70.9,52.5,28.35)
        section.top_margin=section.bottom_margin=Pt(top);section.left_margin=section.right_margin=Pt(side);section.gutter=Pt(gutter)
        section.header_distance=Pt(42.55);section.footer_distance=Pt(49.6)
        cols=section._sectPr.find(qn('w:cols'));cols.set(qn('w:num'),'2');cols.set(qn('w:space'),str(round(gap*20)))
    def walk(node):
        if node.tag=='table':table(doc,node,kind)
        elif node.tag in ('p','h1','h2','h3','li') or (node.tag=='div' and not any(c.tag in ('p','div','h1','h2','h3','table','ul','ol') for c in node)):paragraph(doc,node,kind)
        else:
            if node.text and node.text.strip():p=doc.add_paragraph(node.text);font(p.runs[0])
            for child in node:
                walk(child)
                if child.tail and child.tail.strip():p=doc.add_paragraph(child.tail);font(p.runs[0])
    walk(root)
    doc.save(dest)

if __name__=='__main__':build(*sys.argv[1:4])
