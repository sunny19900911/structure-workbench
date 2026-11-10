"""Native editable table adapter for the explicit geotech-source-table contract.

Usage: bundled-python render-native-table.py spec.json output.docx
No historical reference values are inputs. This is a scoped export prototype.
"""
import json
import re
import sys
from pathlib import Path
from docx import Document
from docx.shared import Cm, Pt, RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT


def append_runs(paragraph, block):
    parts = block.get('textRuns')
    if parts is None:
        paragraph.add_run(block['text'])
        return
    if ''.join(part['text'] for part in parts) != block['text']:
        raise ValueError('Formatted runs do not match source text')
    for part in parts:
        run = paragraph.add_run(part['text'])
        if part.get('verticalAlign') == 'superscript':
            run.font.superscript = True
        elif part.get('verticalAlign') == 'subscript':
            run.font.subscript = True


def append_source_table(doc, block, width_cm=17):
    table = doc.add_table(rows=block['height'], cols=block['width'])
    table.style = 'Table Grid'; table.alignment = WD_TABLE_ALIGNMENT.CENTER; table.autofit = False
    for col in table.columns:
        col.width = Cm(width_cm/block['width'])
    # python-docx initially sizes cells for the whole section, even when it
    # has multiple columns. Changing tblGrid alone leaves those tcW values
    # intact; Word then expands the table across the neighbouring column.
    # Set physical cell widths before merging so merged widths add correctly.
    for row in table.rows:
        for cell in row.cells:
            cell.width = Cm(width_cm/block['width'])
    preferred = table._tbl.tblPr.find(qn('w:tblW'))
    preferred.set(qn('w:type'), 'dxa')
    preferred.set(qn('w:w'), str(Cm(width_cm).twips))
    for cell in block['cells']:
        start = table.cell(cell['row'], cell['column'])
        if cell['rowSpan'] > 1 or cell['colSpan'] > 1:
            start.merge(table.cell(cell['row']+cell['rowSpan']-1, cell['column']+cell['colSpan']-1))
    for cell in block['cells']:
        target = table.cell(cell['row'], cell['column'])
        target.text = ''
        content = cell if cell.get('textRuns') is not None else {**cell, 'text': re.sub(r'(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])', '', cell['text'])}
        append_runs(target.paragraphs[0], content)
        target.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        for p in target.paragraphs:
            p.alignment = 1; p.paragraph_format.space_after = Pt(4); p.paragraph_format.space_before = Pt(4)
            for run in p.runs:
                run.font.size = Pt(10.5)
                run.bold = cell['row'] < block['headerRows']
    for i, row in enumerate(table.rows):
        props = row._tr.get_or_add_trPr()
        props.append(OxmlElement('w:cantSplit'))
        if i < block['headerRows']:
            props.append(OxmlElement('w:tblHeader'))
    # Keep the rows of a vertically merged label together when Word can fit
    # the group on one page/column. Otherwise a soil name can be split across
    # pages while its values continue under an apparently blank label.
    joined_rows = {r for cell in block['cells'] if cell['rowSpan'] > 1
                   for r in range(cell['row'], cell['row'] + cell['rowSpan'] - 1)}
    for r in joined_rows:
        for cell in table.rows[r].cells:
            for paragraph in cell.paragraphs:
                paragraph.paragraph_format.keep_with_next = True
    # Embedded notes already occupy a source cell. The contract also lists
    # them for provenance; do not print the same condition again below the
    # table. Match complete text only, retaining distinct/longer conditions.
    def note_identity(text):
        text = re.sub(r'(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])', '', text)
        return re.sub(r'\s+', ' ', text).strip()
    embedded = {note_identity(cell['text']) for cell in block['cells']}
    for note in block.get('notes', []):
        if note_identity(note) not in embedded:
            doc.add_paragraph(note)
    return table


def build(spec, dest):
    doc = Document(); section = doc.sections[0]
    section.top_margin = section.bottom_margin = Cm(1.8)
    section.left_margin = section.right_margin = Cm(2)
    section.page_width = Cm(21); section.page_height = Cm(29.7)
    for name in ['Normal', 'Title', 'Heading 1']:
        style = doc.styles[name]; style.font.name = 'Times New Roman'; style.font.color.rgb = RGBColor(0,0,0)
        style._element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'), '宋体')
        for border in style._element.xpath('.//w:pBdr'):
            border.getparent().remove(border)
    doc.styles['Title'].font.size = Pt(18)
    doc.styles['Heading 1'].font.size = Pt(13)
    doc.styles['Normal'].font.size = Pt(10.5)
    for i, item in enumerate(spec['items']):
        if i: doc.add_page_break()
        doc.add_paragraph(spec['title'], style='Title')
        doc.add_paragraph(item['label'], style='Heading 1')
        if item.get('intro'): doc.add_paragraph(item['intro'])
        append_source_table(doc, item['table'])
    doc.save(dest)


if __name__ == '__main__':
    build(json.loads(Path(sys.argv[1]).read_text(encoding='utf-8')), sys.argv[2])
