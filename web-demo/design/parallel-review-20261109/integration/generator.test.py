"""Validate the integrated generator and actual workbook values."""
import io
import types
import unittest
import importlib.util
from pathlib import Path
from openpyxl import load_workbook
ROOT=Path(__file__).resolve().parents[3]
spec=importlib.util.spec_from_file_location('excel',ROOT/'server/office-excel-package.py')
excel=importlib.util.module_from_spec(spec);spec.loader.exec_module(excel)

class Proposal(unittest.TestCase):
    def test_typed_parameters_and_formula_like_text(self):
        spec=importlib.util.spec_from_file_location('generator',ROOT/'server/office-package.py')
        proposed=importlib.util.module_from_spec(spec);spec.loader.exec_module(proposed)
        data=proposed.generate_workbook({'parameters':[{'name':'甲','value':4},{'name':'乙','value':5},{'name':'编号','value':'0012'},{'name':'文字','value':'=原文'}]})
        data=excel.edit(data,{'op':'cell.set','sheet':'项目参数','address':'F3','expectedText':'','text':'=SUM(B3:B4)'})
        stored=load_workbook(io.BytesIO(data)).active;values=load_workbook(io.BytesIO(data),data_only=True).active
        self.assertEqual(values['F3'].value,9);self.assertEqual(stored['B5'].value,'0012');self.assertEqual(stored['B6'].data_type,'s');self.assertEqual(stored['B6'].value,'=原文')

if __name__=='__main__':unittest.main()
