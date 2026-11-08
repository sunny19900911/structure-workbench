import importlib.util
import io
import unittest
import zipfile
from pathlib import Path
from openpyxl import Workbook, load_workbook

ROOT=Path(__file__).resolve().parents[3]
spec=importlib.util.spec_from_file_location('extension',ROOT/'server/office-excel-package.py')
excel=importlib.util.module_from_spec(spec);spec.loader.exec_module(excel)


def fixture():
    w=Workbook();s=w.active;s.title='荷载'
    s.append(['类别','标准值','面积','合计']);s.append(['教室',3.5,100,'=B2*C2']);s.append(['走廊',2,50,'=B3*C3'])
    s['D4']='=SUM(D2:D3)';s['E2']='=AVERAGE(B2:B3)';s['E3']='=MIN(B2:B3)';s['E4']='=MAX(B2:B3)';s['E5']='=COUNT(B1:B3)'
    s['E6']='=IF(D4>400,"复核",1/0)';t=w.create_sheet('汇总');t['A1']="='荷载'!D4";t['A2']='=$A$1+10'
    out=io.BytesIO();w.save(out);return out.getvalue()


def read(data,data_only=False):return load_workbook(io.BytesIO(data),data_only=data_only)
def cell(data,sheet,addr):return next(c for s in excel.inspect(data)['sheets'] if s['name']==sheet for c in s['cells'] if c['address']==addr)


class ExcelTests(unittest.TestCase):
    def test_recalculate_and_dependency_roundtrip(self):
        initial=cell(fixture(),'荷载','D4');self.assertIsNone(initial['cachedValue']);self.assertEqual(initial['calculatedValue'],450)
        data=excel.edit(fixture(),{'op':'workbook.recalculate'})
        w=read(data,True);self.assertEqual(w['荷载']['D4'].value,450);self.assertEqual(w['汇总']['A2'].value,460)
        self.assertEqual(w['荷载']['E2'].value,2.75);self.assertEqual(w['荷载']['E3'].value,2);self.assertEqual(w['荷载']['E4'].value,3.5);self.assertEqual(w['荷载']['E5'].value,2);self.assertEqual(w['荷载']['E6'].value,'复核')
        data=excel.edit(data,{'op':'cell.set','sheet':'荷载','address':'B2','expectedText':'3.5','text':'4'})
        self.assertEqual(read(data,True)['汇总']['A2'].value,510)
        self.assertEqual(read(data)['荷载']['D4'].value,'=SUM(D2:D3)')

    def test_atomic_matrix_copy_and_formats(self):
        data=excel.edit(fixture(),{'op':'range.set','sheet':'荷载','address':'A8','values':[['新增','5','20','=B8*C8'],['其他','3','10','=B9*C9']]})
        data=excel.edit(data,{'op':'range.copy','sheet':'荷载','range':'B8:D9','address':'B10'})
        self.assertEqual(read(data)['荷载']['D10'].value,'=B10*C10');self.assertEqual(read(data,True)['荷载']['D11'].value,30)
        data=excel.edit(data,{'op':'range.format','sheet':'荷载','range':'B8:B11','format':'decimal'})
        self.assertEqual(read(data)['荷载']['B9'].number_format,'0.00')
        with self.assertRaises(excel.Error):excel.edit(data,{'op':'range.set','sheet':'荷载','address':'XFD1','values':[['1','2']]})
        self.assertEqual(read(data,True)['荷载']['D11'].value,30)

    def test_structure_updates_cross_sheet_and_absolute_references(self):
        data=excel.edit(fixture(),{'op':'row.insert','sheet':'荷载','index':3,'count':2})
        w=read(data);self.assertEqual(w['荷载']['D6'].value,'=SUM(D2:D5)');self.assertEqual(w['汇总']['A1'].value,"='荷载'!D6")
        self.assertEqual(read(data,True)['汇总']['A2'].value,460)
        data=excel.edit(data,{'op':'row.delete','sheet':'荷载','index':2,'count':3})
        self.assertEqual(read(data)['荷载']['D3'].value,'=SUM(D2:D2)');self.assertEqual(read(data,True)['汇总']['A1'].value,100)
        data=excel.edit(data,{'op':'column.insert','sheet':'荷载','index':2})
        self.assertEqual(read(data)['荷载']['E2'].value,'=C2*D2');self.assertEqual(read(data,True)['汇总']['A1'].value,100)
        data=excel.edit(data,{'op':'column.delete','sheet':'荷载','index':2})
        self.assertEqual(read(data)['荷载']['D2'].value,'=B2*C2')

    def test_sheet_lifecycle_and_ref_error(self):
        data=excel.edit(fixture(),{'op':'sheet.add','name':'基础'})
        self.assertIn('基础',read(data).sheetnames)
        data=excel.edit(data,{'op':'sheet.rename','sheet':'荷载','name':"地上'荷载"})
        self.assertEqual(read(data)['汇总']['A1'].value,"='地上''荷载'!D4")
        data=excel.edit(data,{'op':'sheet.delete','sheet':"地上'荷载"})
        self.assertEqual(read(data,True)['汇总']['A1'].value,'#REF!')
        data=excel.edit(data,{'op':'sheet.delete','sheet':'基础'})
        with self.assertRaises(excel.Error):excel.edit(data,{'op':'sheet.delete','sheet':'汇总'})

    def test_unsupported_and_cycle_never_use_old_cache(self):
        data=excel.edit(fixture(),{'op':'range.set','sheet':'汇总','address':'B1','values':[['=VLOOKUP(A1,A1:A2,1,FALSE)','=B1+1'],['=B3','=1/0'],['=B2','=IF(TRUE,7,1/0)']]})
        self.assertIsNone(read(data,True)['汇总']['B1'].value);self.assertIsNone(read(data,True)['汇总']['C1'].value)
        self.assertIsNone(read(data,True)['汇总']['B2'].value);self.assertEqual(read(data,True)['汇总']['C2'].value,'#DIV/0!');self.assertEqual(read(data,True)['汇总']['C3'].value,7)
        self.assertIn('VLOOKUP',cell(data,'汇总','B1')['calculationMessage'])
        self.assertEqual(cell(data,'汇总','B2')['calculationStatus'],'unsupported')

    def test_batch_conflict_and_protection(self):
        data=fixture()
        with self.assertRaises(excel.Error) as ctx:excel.edit(data,{'op':'cells.set','sheet':'荷载','cells':[{'address':'B2','expectedText':'3.5','text':'5'},{'address':'B3','expectedText':'stale','text':'6'}]})
        self.assertEqual(ctx.exception.code,'CONFLICT');self.assertEqual(read(data)['荷载']['B2'].value,3.5)
        w=read(data);w['荷载'].protection.sheet=True;out=io.BytesIO();w.save(out)
        with self.assertRaises(excel.Error):excel.edit(out.getvalue(),{'op':'range.clear','sheet':'荷载','range':'B2:B3'})

    def test_unmodified_zip_parts_and_risky_structures(self):
        before=fixture();after=excel.edit(before,{'op':'range.clear','sheet':'荷载','range':'A2'})
        a,b=zipfile.ZipFile(io.BytesIO(before)),zipfile.ZipFile(io.BytesIO(after))
        for path in ['xl/theme/theme1.xml','docProps/core.xml','docProps/app.xml','_rels/.rels']:
            self.assertEqual(a.read(path),b.read(path))
        w=read(before);w['荷载'].merge_cells('A10:B10');out=io.BytesIO();w.save(out)
        with self.assertRaises(excel.Error) as ctx:excel.edit(out.getvalue(),{'op':'row.insert','sheet':'荷载','index':2})
        self.assertEqual(ctx.exception.code,'UNSUPPORTED_STRUCTURE')

    def test_formula_semantics_and_limits(self):
        data=excel.edit(fixture(),{'op':'range.set','sheet':'汇总','address':'B1','values':[['文字','=SUM(B1:B2)','=COUNT(B1:B2)','=IF(FALSE,1/0,9)'],['TRUE','=SUM(TRUE,"3")','=2^3^2','=50%*2'],['=1+2*3','=IF(1=1,"甲"&"乙",0)','=SUM(A1:A10001)','=IF(TRUE,1,NOPE())']]})
        w=read(data,True)['汇总'];self.assertEqual(w['C1'].value,0);self.assertEqual(w['D1'].value,0);self.assertEqual(w['E1'].value,9);self.assertEqual(w['C2'].value,4);self.assertEqual(w['D2'].value,64);self.assertEqual(w['E2'].value,1);self.assertEqual(w['B3'].value,7);self.assertEqual(w['C3'].value,'甲乙');self.assertIsNone(w['D3'].value);self.assertIsNone(w['E3'].value)

    def test_count_known_error_and_unsupported_dependency(self):
        data=excel.edit(fixture(),{'op':'range.set','sheet':'汇总','address':'B1','values':[['1','=COUNT(B1:B3)'],['=1/0','=SUM(B1:B3)'],['文字','=COUNT(B1:B4)'],['=NOPE()','=IF(TRUE,1,B4)']]})
        w=read(data,True)['汇总'];self.assertEqual(w['C1'].value,1);self.assertEqual(w['C2'].value,'#DIV/0!');self.assertIsNone(w['C3'].value);self.assertEqual(w['C4'].value,1)

    def test_blank_if_and_absolute_copy(self):
        data=excel.edit(fixture(),{'op':'range.set','sheet':'汇总','address':'D1','values':[['=IF(Z1="","待填写",Z1*2)','=IF(Z1=0,1,0)'],['=$A$1+A$1+$A1','=IF("a"="A",TRUE,FALSE)']]})
        data=excel.edit(data,{'op':'range.copy','sheet':'汇总','range':'D2','address':'E3'})
        self.assertEqual(read(data)['汇总']['E3'].value,'=$A$1+B$1+$A2')
        w=read(data,True)['汇总'];self.assertEqual(w['D1'].value,'待填写');self.assertEqual(w['E1'].value,1);self.assertEqual(w['E2'].value,True)

    def test_array_followers_cannot_supply_stale_results(self):
        data=fixture();z=zipfile.ZipFile(io.BytesIO(data));root=excel.base.xml(z.read('xl/worksheets/sheet2.xml'))
        row=root.find('s:sheetData/s:row',excel.NS)
        a=excel.E.SubElement(row,'{'+excel.S+'}c',r='B1');excel.E.SubElement(a,'{'+excel.S+'}f',t='array',ref='B1:C1').text='A1:A2';excel.E.SubElement(a,'{'+excel.S+'}v').text='999'
        c=excel.E.SubElement(row,'{'+excel.S+'}c',r='C1');excel.E.SubElement(c,'{'+excel.S+'}v').text='999'
        d=excel.E.SubElement(row,'{'+excel.S+'}c',r='D1');excel.E.SubElement(d,'{'+excel.S+'}f').text='C1+1';excel.E.SubElement(d,'{'+excel.S+'}v').text='1000'
        data=excel.base.write_package(z,{'xl/worksheets/sheet2.xml':excel.base.serial(root)})
        data=excel.edit(data,{'op':'workbook.recalculate'});w=read(data,True)['汇总']
        self.assertIsNone(w['B1'].value);self.assertIsNone(w['C1'].value);self.assertIsNone(w['D1'].value)
        self.assertEqual(cell(data,'汇总','C1')['calculationStatus'],'unsupported')

    def test_column_width_and_text_format_preserved(self):
        w=read(fixture());w['荷载'].column_dimensions['B'].width=22;out=io.BytesIO();w.save(out)
        data=excel.edit(out.getvalue(),{'op':'column.insert','sheet':'荷载','index':2})
        self.assertEqual(read(data)['荷载'].column_dimensions['C'].width,22)
        data=excel.edit(data,{'op':'range.format','sheet':'荷载','range':'A12','format':'text'})
        data=excel.edit(data,{'op':'cell.set','sheet':'荷载','address':'A12','expectedText':'','text':'00123'})
        self.assertEqual(read(data)['荷载']['A12'].value,'00123')

    def test_calculation_budget_clears_unvisited_formula_caches(self):
        w=Workbook();w.active.title='预算'
        for r in range(1,25):w.active.cell(r,2,'=SUM(A1:A10000)')
        out=io.BytesIO();w.save(out);z=zipfile.ZipFile(io.BytesIO(out.getvalue()))
        root=excel.base.xml(z.read('xl/worksheets/sheet1.xml'))
        for v in root.findall('s:sheetData/s:row/s:c/s:v',excel.NS):v.text='999'
        data=excel.base.write_package(z,{'xl/worksheets/sheet1.xml':excel.base.serial(root)})
        result=excel.edit(data,{'op':'workbook.recalculate'})
        self.assertEqual(read(result,True)['预算']['B1'].value,0)
        self.assertIsNone(read(result,True)['预算']['B24'].value)


if __name__=='__main__':unittest.main()
