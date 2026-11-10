"""Verify note placement in the actual OOXML produced by the native adapter."""
import copy
import importlib.util
from pathlib import Path
import unittest
from io import BytesIO
from docx import Document
from docx.shared import Cm

spec = importlib.util.spec_from_file_location('native', Path(__file__).with_name('render-native-table.py'))
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)


class NotePlacement(unittest.TestCase):
    def test_merged_table_fits_a3_column_after_docx_roundtrip(self):
        doc = Document()
        doc.sections[0].page_width = Cm(42)
        block = {'height': 2, 'width': 3, 'headerRows': 1, 'cells': [
            {'row': 0, 'column': 0, 'rowSpan': 1, 'colSpan': 2, 'text': '并列表头'},
            {'row': 0, 'column': 2, 'rowSpan': 1, 'colSpan': 1, 'text': '单位'},
            *[{'row': 1, 'column': c, 'rowSpan': 1, 'colSpan': 1, 'text': str(c)} for c in range(3)]]}
        native.append_source_table(doc, block, width_cm=18.5)
        stream = BytesIO()
        doc.save(stream)
        stream.seek(0)
        table = Document(stream).tables[0]
        for row in table._tbl.tr_lst:
            self.assertAlmostEqual(sum(cell.width.twips for cell in row.tc_lst), Cm(18.5).twips, delta=3)
        self.assertEqual(table.cell(0, 0).text, '并列表头')
        self.assertEqual(table.cell(1, 2).text, '2')

    def test_embedded_note_once_external_conditions_preserved(self):
        note = '注：本表为估算值，仅供设计参考。'
        block = {'height': 2, 'width': 2, 'headerRows': 0, 'cells': [
            {'row': 0, 'column': 0, 'rowSpan': 1, 'colSpan': 1, 'text': '甲'},
            {'row': 0, 'column': 1, 'rowSpan': 1, 'colSpan': 1, 'text': '20'},
            {'row': 1, 'column': 0, 'rowSpan': 1, 'colSpan': 2, 'text': note}],
            'notes': [note, note + '最终以静载试验为准。']}
        original = copy.deepcopy(block)
        doc = Document()
        native.append_source_table(doc, block)
        texts = doc._element.xpath('.//w:t/text()')
        self.assertEqual(texts.count(note), 1)
        self.assertEqual([p.text for p in doc.paragraphs], [note + '最终以静载试验为准。'])
        self.assertEqual(block, original)

    def test_numeric_spacing_is_not_silently_equated(self):
        block = {'height': 1, 'width': 1, 'headerRows': 0, 'cells': [
            {'row': 0, 'column': 0, 'rowSpan': 1, 'colSpan': 1, 'text': '注：编号1 20'}],
            'notes': ['注：编号120']}
        doc = Document()
        native.append_source_table(doc, block)
        self.assertEqual([p.text for p in doc.paragraphs], ['注：编号120'])


if __name__ == '__main__':
    unittest.main()
