import importlib.util
import io
import unittest
import zipfile
from pathlib import Path
from openpyxl import Workbook, load_workbook
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import PatternFill

ROOT=Path(__file__).resolve().parents[3]
def load(name,file):
    spec=importlib.util.spec_from_file_location(name,ROOT/'server'/file)
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod
excel=load('excel','office-excel-package.py')
formatting=load('formatting','office-excel-formatting.py')

def fixture(protected=False,unsupported=False):
    w=Workbook();s=w.active;s.title='数据';s.append(['项目','数值','公式']);s.append(['甲',3.5,'=B2*2']);s.append(['乙',10,'=SUM(B2:B3)']);s['B2'].number_format='0.000'
    s.protection.sheet=protected
    if unsupported:s.conditional_formatting.add('B2:B3',FormulaRule(formula=['B2>2'],fill=PatternFill('solid',fgColor='FFFF0000'),stopIfTrue=True))
    out=io.BytesIO();w.save(out);return out.getvalue()
def edit(data,op,**kw):
    w=excel.Workbook(data);assert formatting.handle(w,dict(op=op,sheet='数据',**kw),excel.base)
    w.recalculate();return w.output()
def read(data,data_only=False):return load_workbook(io.BytesIO(data),data_only=data_only)
def view(data):
    result=excel.inspect(data);formatting.decorate(result,excel.Workbook(data),excel.base);return result
def cells(data):return {c['address']:c for c in view(data)['sheets'][0]['cells']}

class FormattingTests(unittest.TestCase):
    def test_native_style_preserves_numbers_formulas_caches_and_package(self):
        data=excel.edit(fixture(),{'op':'workbook.recalculate'})
        result=edit(data,'range.style',range='B2:C3',style={'font':'Arial','fontSize':14,'bold':True,'italic':True,'underline':True,'strike':True,'fontColor':'#123456','fillColor':'#ABCDEF','horizontal':'center','vertical':'top','wrapText':True,'rotation':-45,'border':'all'})
        w=read(result);c=w['数据']['B2']
        self.assertEqual(c.number_format,'0.000');self.assertEqual(c.value,3.5)
        self.assertEqual(c.font.name,'Arial');self.assertEqual(c.font.sz,14);self.assertTrue(c.font.b and c.font.i and c.font.strike);self.assertEqual(c.font.u,'single')
        self.assertEqual(c.font.color.rgb,'FF123456');self.assertEqual(c.fill.fgColor.rgb,'FFABCDEF')
        self.assertEqual(c.alignment.textRotation,135);self.assertEqual(c.alignment.vertical,'top');self.assertTrue(c.alignment.wrapText)
        self.assertEqual(c.border.left.style,'thin');self.assertEqual(w['数据']['C2'].value,'=B2*2');self.assertEqual(read(result,True)['数据']['C2'].value,7)
        decorated=view(result)['styles'][cells(result)['B2']['style']]
        self.assertTrue(decorated['italic']);self.assertEqual(decorated['rotation'],-45)
        with zipfile.ZipFile(io.BytesIO(data)) as before,zipfile.ZipFile(io.BytesIO(result)) as after:
            for path in ('xl/theme/theme1.xml','docProps/core.xml','docProps/app.xml'):self.assertEqual(before.read(path),after.read(path))
        native=excel.Workbook(data)
        formatting.handle(native,{'op':'range.style','sheet':'数据','range':'C2','style':{'italic':True}},excel.base)
        self.assertEqual(read(native.output(),True)['数据']['C2'].value,7)
        repeated=edit(result,'range.style',range='B2:C3',style={'bold':True,'fillColor':'#ABCDEF'})
        self.assertEqual(len(excel.Workbook(result).styles.find('s:cellXfs',excel.NS)),len(excel.Workbook(repeated).styles.find('s:cellXfs',excel.NS)))

    def test_copy_clear_and_outline(self):
        data=edit(fixture(),'range.style',range='B2',style={'bold':True,'border':'all'})
        data=edit(data,'range.copyStyle',source='B2',range='B3:C3')
        self.assertEqual(read(data)['数据']['C3'].value,'=SUM(B2:B3)');self.assertEqual(read(data)['数据']['C3'].number_format,'0.000')
        data=edit(data,'range.clearStyle',range='C3');self.assertEqual(read(data)['数据']['C3'].number_format,'General');self.assertFalse(read(data)['数据']['C3'].font.b)
        data=edit(data,'range.style',range='E1:G3',style={'border':'outside'});s=read(data)['数据']
        self.assertEqual(s['E1'].border.left.style,'thin');self.assertEqual(s['E1'].border.top.style,'thin');self.assertIsNone(s['F2'].border.left.style);self.assertIsNone(s['F1'].border.bottom.style)
        data=edit(data,'range.style',range='E1:G3',style={'border':'none'});self.assertIsNone(read(data)['数据']['E1'].border.top.style)

    def test_merge_refuses_data_loss_and_partial_operations(self):
        with self.assertRaises(excel.Error):edit(fixture(),'range.merge',range='A1:B1')
        data=edit(fixture(),'range.merge',range='A5:C5');self.assertIn('A5:C5',read(data)['数据'].merged_cells)
        with self.assertRaises(excel.Error):edit(data,'range.merge',range='B5:D5')
        with self.assertRaises(excel.Error):edit(data,'range.unmerge',range='A5:B5')
        with self.assertRaises(excel.Error):edit(data,'range.style',range='B5',style={'bold':True})
        data=edit(data,'range.style',range='A5:C5',style={'fillColor':'#AABBCC'})
        data=edit(data,'range.unmerge',range='A5:C5');self.assertEqual(len(read(data)['数据'].merged_cells.ranges),0)

    def test_protection_and_invalid_inputs(self):
        for op,kw in [('range.style',{'style':{'bold':True}}),('range.clearStyle',{}),('range.merge',{}),('range.conditional',{'operator':'equal','value':1,'color':'#FFFFFF'})]:
            with self.assertRaises(excel.Error):edit(fixture(protected=True),op,range='A5:B5',**kw)
        for style in ({'fontSize':float('nan')},{'fontColor':'red'},{'rotation':91},{'bold':'true'},{'unknown':1}):
            with self.assertRaises(excel.Error):edit(fixture(),'range.style',range='A1',style=style)
        with self.assertRaises(excel.Error):edit(fixture(),'range.style',range='A1:XFD10',style={'bold':True})

    def test_table_style_keeps_numeric_formats(self):
        data=edit(fixture(),'range.tableStyle',range='A1:C3',theme='green');s=read(data)['数据']
        self.assertTrue(s['A1'].font.b);self.assertEqual(s['A1'].fill.fgColor.rgb,'FF397865')
        self.assertNotEqual(s['A2'].fill.fgColor.rgb,s['A3'].fill.fgColor.rgb);self.assertEqual(s['B2'].number_format,'0.000')

    def test_conditional_native_display_and_clearing(self):
        data=edit(fixture(),'range.conditional',range='A2:C3',operator='greaterThan',value=8,color='#FFAABB')
        s=read(data)['数据'];rules=list(s.conditional_formatting)
        self.assertEqual(len(rules),1);rule=s.conditional_formatting[rules[0]][0];self.assertEqual(rule.type,'cellIs');self.assertEqual(rule.formula,['8'])
        c=cells(data);self.assertEqual(c['B3']['conditionalStyle']['fillColor'],'#FFAABB');self.assertEqual(c['C3']['conditionalStyle']['fillColor'],'#FFAABB');self.assertNotIn('conditionalStyle',c['A2']);self.assertNotIn('conditionalStyle',c['B2'])
        with self.assertRaises(excel.Error):edit(data,'range.clearConditional',range='B2:B3')
        data=edit(data,'range.clearConditional',range='A2:C3');self.assertEqual(len(read(data)['数据'].conditional_formatting),0)

    def test_imported_unsupported_rules_remain_untouched(self):
        data=fixture(unsupported=True);before=excel.Workbook(data).items[0][2].find('s:conditionalFormatting',excel.NS)
        result=edit(data,'range.conditional',range='B2:B3',operator='between',value=0,value2=20,color='#AABBCC')
        after=excel.Workbook(result).items[0][2].find('s:conditionalFormatting',excel.NS)
        self.assertEqual(excel.base.serial(before),excel.base.serial(after));self.assertNotIn('conditionalStyle',cells(result)['B2'])
        self.assertFalse(view(result)['sheets'][0]['conditionalFormats'][0]['supported'])

    def test_supported_comparisons_and_differential_style_deduplication(self):
        for operator,value,value2,match in [('lessThan',4,None,'B2'),('equal',10,None,'B3'),('between',3,4,'B2')]:
            data=edit(fixture(),'range.conditional',range='B2:B3',operator=operator,value=value,value2=value2,color='#AABBCC')
            self.assertIn('conditionalStyle',cells(data)[match])
            data=edit(data,'range.conditional',range='C2:C3',operator=operator,value=value,value2=value2,color='#AABBCC')
            self.assertEqual(len(excel.Workbook(data).styles.find('s:dxfs',excel.NS)),1)
        data=excel.edit(fixture(),{'op':'range.set','sheet':'数据','address':'E1','values':[['true',"'10",'=1/0']]})
        data=edit(data,'range.conditional',range='E1:G1',operator='greaterThan',value=0,color='#AABBCC')
        for address in ('E1','F1','G1'):self.assertNotIn('conditionalStyle',cells(data)[address])

if __name__=='__main__':unittest.main()
