import io
import importlib.util
import unittest
from pathlib import Path
from openpyxl import Workbook, load_workbook

ROOT=Path(__file__).resolve().parents[3]
def module(name,file):
    spec=importlib.util.spec_from_file_location(name,ROOT/'server'/file)
    result=importlib.util.module_from_spec(spec); spec.loader.exec_module(result); return result
excel=module('data_excel','office-excel-package.py')
ext=module('data_extension','office-excel-data.py')

def fixture(formula=False):
    book=Workbook(); sheet=book.active; sheet.title='数据'
    for row in [('名称','数值','保留'),('乙',3,'外部2'),('甲',1,'外部3'),('丙',2,'外部4')]: sheet.append(row)
    if formula: sheet['D1']='=SUM(B2:B4)'
    stream=io.BytesIO(); book.save(stream); return stream.getvalue()

def apply(data,op,**args):
    book=excel.Workbook(data)
    assert ext.handle(book,dict(op=op,sheet='数据',**args),excel.base)
    return book.output()

def read(data): return load_workbook(io.BytesIO(data))

class DataTests(unittest.TestCase):
    def test_integrated_literal_replace_and_metadata(self):
        data=excel.edit(fixture(True),{'op':'range.replace','sheet':'数据','range':'A1:D4','find':'甲','replacement':'=B2'})
        s=read(data).active
        self.assertEqual(s['A3'].value,'=B2'); self.assertEqual(s['A3'].data_type,'s');self.assertEqual(s['D1'].value,'=SUM(B2:B4)')
        data=excel.edit(data,{'op':'sheet.freeze','sheet':'数据','rows':1,'columns':1})
        self.assertEqual(excel.inspect(data)['sheets'][0]['freeze'],{'rows':1,'columns':1})
        with self.assertRaises(excel.base.OfficeError): excel.edit(data,{'op':'range.replace','sheet':'数据','range':'A1:D4','find':'','replacement':'x'})
        data=excel.edit(data,{'op':'sheet.protect','sheet':'数据','enabled':True})
        with self.assertRaises(excel.base.OfficeError): excel.edit(data,{'op':'range.replace','sheet':'数据','range':'A1:D4','find':'甲','replacement':'x'})
        self.assertFalse(read(excel.edit(data,{'op':'sheet.protect','sheet':'数据','enabled':False})).active.protection.sheet)
    def test_sort_and_preserve_outside(self):
        data=apply(fixture(),'range.sort',range='A1:B4',column=2,direction='asc')
        s=read(data).active
        self.assertEqual([s.cell(r,2).value for r in range(2,5)],[1,2,3])
        self.assertEqual([s.cell(r,3).value for r in range(2,5)],['外部2','外部3','外部4'])
    def test_formula_sort_refused(self):
        with self.assertRaises(excel.base.OfficeError): apply(fixture(True),'range.sort',range='A1:B4',column=2)
    def test_filter_clear_preserves_manual_hidden(self):
        book=read(fixture()); book.active.row_dimensions[3].hidden=True
        stream=io.BytesIO();book.save(stream)
        data=apply(stream.getvalue(),'sheet.filter',range='A1:B4',column=2,operator='greaterThan',value='1')
        s=read(data).active
        self.assertEqual(s.auto_filter.ref,'A1:B4'); self.assertTrue(s.row_dimensions[3].hidden)
        data=apply(data,'sheet.filter',range='A1:B4',column=1,operator='equal',value='甲')
        s=read(data).active
        self.assertTrue(s.row_dimensions[2].hidden); self.assertTrue(s.row_dimensions[3].hidden)
        s=read(apply(data,'sheet.clearFilter')).active
        self.assertIsNone(s.auto_filter.ref); self.assertFalse(s.row_dimensions[2].hidden); self.assertTrue(s.row_dimensions[3].hidden)
    def test_unmanaged_filter_refused(self):
        book=read(fixture());book.active.auto_filter.ref='A1:B4'
        stream=io.BytesIO();book.save(stream)
        with self.assertRaises(excel.base.OfficeError): apply(stream.getvalue(),'sheet.clearFilter')
    def test_filter_visibility_conflict(self):
        data=apply(fixture(),'sheet.filter',range='A1:B4',column=2,operator='greaterThan',value='1')
        w=excel.Workbook(data)
        w.items[0][2].find("s:sheetData/s:row[@r='3']",excel.base.NS).attrib.pop('hidden')
        with self.assertRaises(excel.base.OfficeError): ext.handle(w,{'op':'sheet.clearFilter','sheet':'数据'},excel.base)
    def test_hidden_sort_refused(self):
        book=read(fixture());book.active.column_dimensions['B'].hidden=True
        stream=io.BytesIO();book.save(stream)
        with self.assertRaises(excel.base.OfficeError): apply(stream.getvalue(),'range.sort',range='A1:B4',column=2)
    def test_views_and_dimensions(self):
        data=apply(fixture(),'sheet.freeze',rows=1,columns=2)
        data=apply(data,'row.height',index=2,count=2,height=32)
        data=apply(data,'column.width',index=2,count=2,width=25)
        s=read(data).active
        self.assertEqual(s.freeze_panes,'C2');self.assertEqual(s.row_dimensions[2].height,32);self.assertEqual(s.column_dimensions['B'].width,25)
        self.assertIsNone(read(apply(data,'sheet.freeze',rows=0,columns=0)).active.freeze_panes)
    def test_protection(self):
        data=apply(fixture(),'sheet.protect',enabled=True)
        self.assertTrue(read(data).active.protection.sheet)
        with self.assertRaises(excel.base.OfficeError): apply(data,'range.sort',range='A1:B4',column=2)
        self.assertFalse(read(apply(data,'sheet.protect',enabled=False)).active.protection.sheet)
        book=read(fixture());book.active.protection.set_password('test');book.active.protection.sheet=True
        stream=io.BytesIO();book.save(stream)
        with self.assertRaises(excel.base.OfficeError): apply(stream.getvalue(),'sheet.protect',enabled=False)
    def test_metadata(self):
        data=apply(fixture(),'sheet.freeze',rows=1,columns=0)
        w=excel.Workbook(data); view={'sheets':[{}]};ext.decorate(view,w,excel.base)
        self.assertEqual(view['sheets'][0]['freeze'],{'rows':1,'columns':0})

if __name__=='__main__': unittest.main()
