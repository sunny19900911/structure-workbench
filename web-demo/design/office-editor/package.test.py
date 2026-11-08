"""Native package operations: reopened contents, preserved parts, stale targets."""
import copy
import importlib.util
import io
import unittest
import zipfile
from pathlib import Path
from lxml import etree as E
from openpyxl import Workbook,load_workbook
from openpyxl.styles import Font

spec=importlib.util.spec_from_file_location('office_package',Path(__file__).parents[2]/'server/office-package.py')
office=importlib.util.module_from_spec(spec); spec.loader.exec_module(office)

def archive(data):
    with zipfile.ZipFile(io.BytesIO(data)) as z: return {n:z.read(n) for n in z.namelist()}

def decorate(data,extra=None):
    parts=archive(data); parts.update(extra or {'customXml/engineering-original.xml':b'<original data="preserved"/>','custom/opaque.bin':bytes(range(256))})
    buf=io.BytesIO()
    with zipfile.ZipFile(buf,'w',zipfile.ZIP_DEFLATED) as z:
        for name,value in parts.items():z.writestr(name,value)
    return buf.getvalue()

def workbook():
    wb=Workbook(); sheet=wb.active; sheet.title='技术措施'; sheet['A1']='工程名';sheet['B1']='测试单体';sheet['A2']=3.5;sheet['B2']='=A2*2';sheet['A2'].font=Font(name='宋体',bold=True,size=14,color='123456');sheet.merge_cells('C3:D3');sheet['C3']='合并'; sheet2=wb.create_sheet('参考');sheet2['A1']='=技术措施!A2'
    b=io.BytesIO();wb.save(b);return decorate(b.getvalue())

def presentation():
    # A real PresentationML package, independent of Office installation.
    P=office.P;A=office.A;R=office.R
    parts={
      '[Content_Types].xml':b'''<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>''',
      '_rels/.rels':b'''<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>''',
      'ppt/_rels/presentation.xml.rels':b'''<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>''',
      'ppt/presentation.xml':f'<p:presentation xmlns:p="{P}" xmlns:r="{R}"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>'.encode(),
      'ppt/slides/slide1.xml':f'''<p:sld xmlns:p="{P}" xmlns:a="{A}"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="结构说明"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="100" y="200"/><a:ext cx="2000000" cy="1000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr sz="2400" b="1"><a:solidFill><a:srgbClr val="123456"/></a:solidFill></a:rPr><a:t>框架</a:t></a:r><a:r><a:rPr sz="1800"/><a:t>结构说明</a:t></a:r><a:endParaRPr lang="zh-CN"/></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>'''.encode(),
      'custom/opaque.bin':bytes(range(255))
    }
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
        for name,value in parts.items():z.writestr(name,value)
    return out.getvalue()

class PackageTests(unittest.TestCase):
    def edit(self,data,kind,command):
        with office.load_package(data,kind) as z: return office.edit_xlsx(z,command) if kind=='xlsx' else office.edit_pptx(z,command)

    def test_xlsx_real_read_edit_reopen_and_untouched_parts(self):
        before=workbook()
        with office.load_package(before,'xlsx') as z:
            view=office.inspect_xlsx(z);cell=next(c for c in view['sheets'][0]['cells'] if c['address']=='A2')
            self.assertTrue(view['styles'][cell['style']]['bold'])
        after=self.edit(before,'xlsx',{'op':'cell.set','sheet':'技术措施','address':'A2','expectedText':'3.5','text':'4.25'})
        wb=load_workbook(io.BytesIO(after));self.assertEqual(wb['技术措施']['A2'].value,4.25);self.assertEqual(wb['技术措施']['B2'].value,'=A2*2');self.assertTrue(wb['技术措施']['A2'].font.bold)
        old,new=archive(before),archive(after)
        for name in old:
            if name not in ('xl/workbook.xml','xl/worksheets/sheet1.xml','xl/worksheets/sheet2.xml'): self.assertEqual(old[name],new[name],name)
        for name in ('xl/worksheets/sheet1.xml','xl/worksheets/sheet2.xml'):
            root=E.fromstring(new[name]);self.assertEqual(root.xpath('count(//s:c[s:f]/s:v)',namespaces=office.NS),0)
        self.assertEqual(wb.calculation.fullCalcOnLoad,True)

    def test_xlsx_reject_stale_merge_macro_protection_and_bad_address(self):
        data=workbook();base={'op':'cell.set','sheet':'技术措施','address':'A2','expectedText':'3.5','text':'4'}
        with self.assertRaises(office.OfficeError) as error:self.edit(data,'xlsx',{**base,'expectedText':'wrong'})
        self.assertEqual(error.exception.code,'CONFLICT')
        for address in ['D3','XFE1','A0','a1','../A1']:
            with self.assertRaises(office.OfficeError):self.edit(data,'xlsx',{**base,'address':address,'expectedText':''})
        with self.assertRaises(office.OfficeError):office.load_package(decorate(data,{'xl/vbaProject.bin':b'no execution'}),'xlsx')
        wb=load_workbook(io.BytesIO(data));wb['技术措施'].protection.sheet=True;out=io.BytesIO();wb.save(out)
        with self.assertRaises(office.OfficeError):self.edit(out.getvalue(),'xlsx',base)

    def test_xlsx_literal_long_integer_formula_and_new_cell(self):
        data=workbook()
        for text in ['000123','1234567890123456789','=SUM(A2,1)','文字\n第二行']:
            after=self.edit(data,'xlsx',{'op':'cell.set','sheet':'技术措施','address':'E8','expectedText':'','text':text})
            self.assertEqual(load_workbook(io.BytesIO(after))['技术措施']['E8'].value,text)

    def test_generate_only_given_data_and_literal_tables(self):
        data=office.generate_workbook({'title':'当前项目','parameters':[{'name':'地区','value':'昆明'}],'units':[{'name':'教学楼','height':'23.7'}],'tables':[{'name':'编辑后单体','rows':[['名称','人工说明'],['单体甲','=外部数据()']]}]})
        wb=load_workbook(io.BytesIO(data));self.assertEqual(wb['项目参数']['B3'].value,'昆明');self.assertEqual(wb['结构单体']['C2'].value,'23.7');self.assertEqual(wb['编辑后单体']['B2'].value,'=外部数据()');self.assertEqual(wb['编辑后单体']['B2'].data_type,'s')

    def test_pptx_native_text_move_and_part_preservation(self):
        before=presentation()
        with office.load_package(before,'pptx') as z:
            view=office.inspect_pptx(z);self.assertEqual(view['slides'][0]['shapes'][0]['text'],'框架结构说明');self.assertEqual(view['slides'][0]['width'],12192000)
        edited=self.edit(before,'pptx',{'op':'shape.text','slide':1,'shapeId':'2','expectedText':'框架结构说明','text':'框架结构修改稿'})
        moved=self.edit(edited,'pptx',{'op':'shape.move','slide':1,'shapeId':'2','expectedX':100,'expectedY':200,'x':500,'y':600})
        with office.load_package(moved,'pptx') as z:
            shape=office.inspect_pptx(z)['slides'][0]['shapes'][0];self.assertEqual(shape['text'],'框架结构修改稿');self.assertEqual((shape['x'],shape['y']),(500,600));self.assertTrue(shape['bold'])
        old,new=archive(before),archive(moved)
        for name in old:
            if name!='ppt/slides/slide1.xml':self.assertEqual(old[name],new[name],name)
        root=E.fromstring(new['ppt/slides/slide1.xml']);self.assertEqual(root.xpath('//a:rPr/@sz',namespaces=office.NS),['2400','1800'])

    def test_pptx_stale_and_unsupported_do_not_write(self):
        before=presentation();base={'op':'shape.text','slide':1,'shapeId':'2','expectedText':'框架结构说明','text':'修改\n新段落'}
        with self.assertRaises(office.OfficeError):self.edit(before,'pptx',base)
        with self.assertRaises(office.OfficeError) as err:self.edit(before,'pptx',{**base,'expectedText':'old'})
        self.assertEqual(err.exception.code,'CONFLICT')
        with self.assertRaises(office.OfficeError):self.edit(before,'pptx',{'op':'shape.move','slide':1,'shapeId':'2','expectedX':1,'expectedY':2,'x':500,'y':600})

if __name__=='__main__':unittest.main()
