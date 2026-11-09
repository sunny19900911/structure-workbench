import importlib.util
import io
import unittest
from pathlib import Path
from openpyxl import Workbook, load_workbook

ROOT=Path(__file__).resolve().parents[3]
spec=importlib.util.spec_from_file_location('excel',ROOT/'server/office-excel-package.py')
excel=importlib.util.module_from_spec(spec);spec.loader.exec_module(excel)

def fixture():
    book=Workbook();s=book.active;s.title='数据';s['A1']='项目标题';s.merge_cells('A1:C1')
    for row in [('名称','数量','保留'),('甲',4,'A'),('乙',5,'B'),('丙',4,'C')]:s.append(row)
    s.row_dimensions[5].hidden=True
    stream=io.BytesIO();book.save(stream);return stream.getvalue()

class Regression(unittest.TestCase):
    def test_merged_title_outside_selection_numeric_match_and_clear(self):
        data=excel.edit(fixture(),{'op':'cell.set','sheet':'数据','address':'B3','expectedText':'4','text':'4'})
        data=excel.edit(data,{'op':'sheet.filter','sheet':'数据','range':'A2:C5','column':2,'operator':'equal','value':'4'})
        s=load_workbook(io.BytesIO(data)).active
        self.assertFalse(s.row_dimensions[3].hidden);self.assertTrue(s.row_dimensions[4].hidden);self.assertTrue(s.row_dimensions[5].hidden)
        cleared=excel.edit(data,{'op':'sheet.clearFilter','sheet':'数据'})
        s=load_workbook(io.BytesIO(cleared)).active
        self.assertFalse(s.row_dimensions[3].hidden);self.assertFalse(s.row_dimensions[4].hidden);self.assertTrue(s.row_dimensions[5].hidden)
        self.assertEqual(str(s.merged_cells),'A1:C1');self.assertIsNone(s.auto_filter.ref)

    def test_intersecting_merge_and_no_data_refused(self):
        for region in ['A1:C5','A2:C2']:
            with self.assertRaises(excel.Error):excel.edit(fixture(),{'op':'sheet.filter','sheet':'数据','range':region,'column':2,'operator':'equal','value':'4'})

    def test_formula_results_and_native_error_caches(self):
        data=excel.edit(fixture(),{'op':'range.set','sheet':'数据','address':'E2','values':[['=SUM(B3:B5)','=AVERAGE(B3:B5)','=MIN(B3:B5)','=MAX(B3:B5)','=COUNT(B3:B5)','=IF(B3=4,"是","否")','=1/0','=UNKNOWN(B3)','=E2*2']]})
        s=load_workbook(io.BytesIO(data),data_only=True).active
        self.assertEqual([s.cell(2,c).value for c in range(5,14)],[13,13/3,4,5,3,'是','#DIV/0!',None,26])
        view=excel.inspect(data)['sheets'][0];cells={c['address']:c for c in view['cells']}
        self.assertEqual(cells['L2']['calculationStatus'],'unsupported');self.assertIn('UNKNOWN',cells['L2']['calculationMessage'])

if __name__=='__main__':unittest.main()
