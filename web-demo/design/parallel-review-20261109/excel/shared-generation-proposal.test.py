"""Validate the proposed shared generator patch in memory, without changing shared files."""
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
        text=(ROOT/'server/office-package.py').read_text('utf-8')
        # Derive the proposed file from the reviewed diff; only its first file is loaded.
        patch=Path(__file__).with_name('公共生成器建议.patch').read_text('utf-8')
        lines=text.splitlines(True);result=[];cursor=0
        import re
        for block in patch.split('@@ ')[1:]:
            if not re.match(r'-\d',block):continue
            header,_,body=block.partition(' @@\n')
            if not _:continue
            start=int(re.match(r'-(\d+)',header)[1])-1
            if start<cursor:break
            result.extend(lines[cursor:start]);cursor=start
            for line in body.splitlines(True):
                if line.startswith('--- a/web-demo/office-workbench.js'):break
                if line.startswith(' '):result.append(line[1:]);cursor+=1
                elif line.startswith('-'):cursor+=1
                elif line.startswith('+'):result.append(line[1:])
        result.extend(lines[cursor:])
        proposed=types.ModuleType('generator_proposal');proposed.__file__=str(ROOT/'server/office-package.py')
        exec(compile(''.join(result),proposed.__file__,'exec'),proposed.__dict__)
        data=proposed.generate_workbook({'parameters':[{'name':'甲','value':4},{'name':'乙','value':5},{'name':'编号','value':'0012'},{'name':'文字','value':'=原文'}]})
        data=excel.edit(data,{'op':'cell.set','sheet':'项目参数','address':'F3','expectedText':'','text':'=SUM(B3:B4)'})
        stored=load_workbook(io.BytesIO(data)).active;values=load_workbook(io.BytesIO(data),data_only=True).active
        self.assertEqual(values['F3'].value,9);self.assertEqual(stored['B5'].value,'0012');self.assertEqual(stored['B6'].data_type,'s');self.assertEqual(stored['B6'].value,'=原文')

if __name__=='__main__':unittest.main()
