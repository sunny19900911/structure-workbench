"""Compare live cover layout to the original converted Word reference."""
from pathlib import Path
from copy import deepcopy
import json
import sys
from docx import Document
from docx.oxml.ns import qn
from lxml import etree

document = Document(sys.argv[1])
root = Path(__file__).resolve().parents[3]
reference = Document(root / 'qa/portable-release/calculation-cover-20261112/reference/reference.docx')
columns = document.element.xpath('.//w:sectPr/w:cols')
assert len(columns) == 3
assert all(dict(column.attrib) == {qn('w:num'): '1'} and len(column) == 0 for column in columns)
assert not document.element.xpath('.//w:br[@w:type="column"]')

properties = {qn('w:' + name) for name in ('tblPr', 'tblGrid', 'trPr', 'tcPr', 'pPr')}
reference_blocks = [element for element in reference.element.body if element.tag != qn('w:sectPr')]
cover_blocks = list(document.element.body)[:len(reference_blocks)]
assert [element.tag for element in cover_blocks] == [element.tag for element in reference_blocks]

def layout(blocks):
    return [[etree.tostring(element, method='c14n') for element in block.iter() if element.tag in properties]
            for block in blocks]

assert layout(cover_blocks) == layout(reference_blocks), 'Cover table/paragraph properties differ from original Word'
original_section = reference.sections[0]
original_columns = original_section._sectPr.find(qn('w:cols'))
count = int(original_columns.get(qn('w:num'), '1'))
spacing = int(original_columns.get(qn('w:space'), '0'))
available = (original_section.page_width.twips - original_section.left_margin.twips
             - original_section.right_margin.twips - original_section.gutter.twips)
left_column_width = (available - spacing * (count - 1) + count - 1) // count
expected_right = (original_section.page_width.twips - original_section.left_margin.twips
                  - original_section.gutter.twips - left_column_width)
assert document.sections[0].right_margin.twips == expected_right
expected_section = deepcopy(original_section._sectPr)
expected_section.find(qn('w:pgMar')).set(qn('w:right'), str(expected_right))
assert [etree.tostring(element, method='c14n', exclusive=True) for element in document.sections[0]._sectPr if element.tag != qn('w:cols')] == [
    etree.tostring(element, method='c14n', exclusive=True) for element in expected_section if element.tag != qn('w:cols')
], 'Cover section properties differ beyond the equivalent single-column text region'
assert document.tables[3].cell(0, 1).paragraphs[1].text == 'QA-2026.11'
assert not any('{{' in (element.text or '') or '}}' in (element.text or '')
               for element in document.element.iter(qn('w:t')))
assert all(name in '\n'.join(paragraph.text for paragraph in document.paragraphs)
           for name in ('WMASS.OUT', 'WDISP.OUT', 'WZQ.OUT'))
print(json.dumps({'sections': 3, 'columnCounts': ['1', '1', '1'], 'childColumns': 0, 'columnBreaks': 0,
                  'coverBlocks': len(cover_blocks), 'originalTableParagraphLayout': True,
                  'originalSectionExceptSingleColumnRegion': True, 'originalLeftColumnTwips': left_column_width,
                  'coverRightMarginTwips': expected_right, 'placeholderFree': True}))
