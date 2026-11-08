"""Portable Excel results must never silently become blank or use stale caches."""
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile
from xml.etree import ElementTree as ET

from docx import Document
from openpyxl import Workbook

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('builder', ROOT / 'scripts/build-calculation-book.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
N = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'


class FormulaTests(unittest.TestCase):
    def setUp(self):
        qa = ROOT / 'qa/portable-formulas'
        qa.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=qa)
        self.root = Path(self.temp.name)
        self.mode = patch.dict(os.environ, {'WORKBENCH_PORTABLE': '1'})
        self.mode.start()

    def tearDown(self):
        self.mode.stop()
        self.temp.cleanup()

    def source(self, extra=None, cache=None, formulas=True):
        path = self.root / '跃层柱测试.xlsx'
        book = Workbook()
        sheet = book.active
        sheet.title = '计算'
        for key, value in {'B2': 8, 'B3': 4, 'B4': 5, 'B5': 6, 'B7': 7, 'B9': 9}.items():
            sheet[key] = value
        if formulas:
            for key, value in builder.VERIFIED_JUMP_FORMULAS.items():
                sheet[key] = value
        for key, value in (extra or {}).items():
            sheet[key] = value
        book.save(path)
        book.close()
        if cache:
            with zipfile.ZipFile(path) as archive:
                files = {name: archive.read(name) for name in archive.namelist()}
            root = ET.fromstring(files['xl/worksheets/sheet1.xml'])
            for cell in root.findall('.//' + N + 'c'):
                if cell.get('r') not in cache:
                    continue
                value = cell.find(N + 'v')
                if value is None:
                    value = ET.SubElement(cell, N + 'v')
                value.text = str(cache[cell.get('r')])
                if value.text.startswith('#'):
                    cell.set('t', 'e')
            files['xl/worksheets/sheet1.xml'] = ET.tostring(root)
            with zipfile.ZipFile(path, 'w') as archive:
                for name, content in files.items():
                    archive.writestr(name, content)
        return path

    def values(self, edits=None):
        return builder.workbook_values_with_edits(self.root, {'workbook': 'jump-column', 'sheet': '计算', 'edits': edits or {}})

    def test_verified_three_formulas_recalculate_without_caches_and_source_is_read_only(self):
        path = self.source()
        before = path.read_bytes()
        data, rows = self.values({'B2': 10})
        self.assertTrue(data['can_recalculate'])
        self.assertGreater(float(rows[5][1]), 0)
        self.assertIn(rows[9][1], ['满足', '不满足'])
        self.assertEqual(path.read_bytes(), before)
        with self.assertRaises(SystemExit):
            self.values({'B6': 999})

    def test_unknown_formula_missing_cache_fails_instead_of_empty_cell(self):
        self.source({'C4': '=1+1'})
        self.assertIn('C4', builder.read_workbook(self.root, 'jump-column', '计算')['missing_formula_cache'])
        with self.assertRaises(SystemExit):
            self.values()
        with patch.dict(os.environ, {'WORKBENCH_PORTABLE': ''}):
            self.assertEqual(self.values()[1][3][2], '')

    def test_cached_formula_cannot_silently_reuse_results_after_input_edit(self):
        self.source({'C4': '=B2+1'}, {'C4': 9})
        self.assertEqual(self.values()[1][3][2], '9')
        with self.assertRaises(SystemExit):
            self.values({'B2': 20})

    def test_formula_error_stops_export_and_static_sheet_does_not_get_invented_calculations(self):
        self.source({'C4': '=1/0'}, {'C4': '#DIV/0!'})
        with self.assertRaises(SystemExit):
            self.values()
        self.source({'B6': 7, 'B8': 8, 'B10': '人工记录'}, formulas=False)
        data, rows = self.values()
        self.assertFalse(data['can_recalculate'])
        self.assertEqual(rows[5][1], '7')
        self.assertEqual(rows[9][1], '人工记录')

    def test_all_visible_rows_and_columns_are_exported(self):
        book = Workbook()
        sheet = book.active
        sheet.title = '计算'
        sheet['A1'] = '表格开始'
        sheet['T40'] = '显示区域末格'
        book.save(self.root / '楼梯构件库计算表测试.xlsm')
        book.close()
        document = Document()
        builder.add_excel_block(document, self.root, {'workbook': 'stair', 'sheet': '计算', 'edits': {}})
        self.assertIn('显示区域末格', ''.join(document._element.itertext()))
        self.assertEqual(len(document.tables[0].rows), 41)
        self.assertEqual(len(document.tables[0].columns), 21)


if __name__ == '__main__':
    unittest.main()
