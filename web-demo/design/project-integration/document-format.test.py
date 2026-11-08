"""Format checks use synthetic fixtures, not production project documents."""
import importlib.util
import io
import struct
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('document_format', ROOT/'server/document-format.py')
formats = importlib.util.module_from_spec(spec)
spec.loader.exec_module(formats)
source_spec = importlib.util.spec_from_file_location('word_source', ROOT/'server/word-source.py')
source = importlib.util.module_from_spec(source_spec)
source_spec.loader.exec_module(source)


def package(fmt='docx', strict=False, macro=False, rels=True, metadata=True):
    ctype = next(k for k, v in formats.CONTENT_TYPES.items() if v[1] == fmt)
    family = formats.CONTENT_TYPES[ctype][0]
    part, tag = {'word': ('word/document.xml', 'document'), 'excel': ('xl/workbook.xml', 'workbook'), 'powerpoint': ('ppt/presentation.xml', 'presentation')}[family]
    ns = {'word': 'wordprocessingml', 'excel': 'spreadsheetml', 'powerpoint': 'presentationml'}[family]
    namespace = f'http://purl.oclc.org/ooxml/{ns}/main' if strict else f'http://schemas.openxmlformats.org/{ns}/2006/main'
    if fmt == 'xlsb':
        part = 'xl/workbook.bin'
    body = f'<w:{tag} xmlns:w="{namespace}"><w:body><w:p><w:r><w:t>单体 A：高度 23.70m，地上 5 层。</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>首层面积 1234.56㎡</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:{tag}>'
    target = io.BytesIO()
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', f'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/{part}" ContentType="{ctype}"/></Types>')
        z.writestr(part, body if fmt != 'xlsb' else b'\x83\x01\x00\x84\x01\x00')
        if rels:
            z.writestr('_rels/.rels', f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="{part}"/></Relationships>')
        if metadata:
            z.writestr('docProps/app.xml', '<Properties><Application>Test Office</Application><AppVersion>16.0123</AppVersion></Properties>')
        if macro:
            z.writestr(part.split('/')[0]+'/vbaProject.bin', b'QA macro marker only - never executable')
    return target.getvalue()


def compound(streams, mini=False):
    """Small valid CFB container; embedded bodies exercise signature fields only."""
    END, FREE = 0xFFFFFFFE, 0xFFFFFFFF
    sectors, chains, entries = [], [], []
    def allocate(raw):
        size = len(raw)
        raw += bytes((-size) % 512)
        start = len(sectors)
        for i in range(0, len(raw), 512):
            sectors.append(raw[i:i+512])
            chains.append(len(sectors) if i+512 < len(raw) else END)
        return start, size
    mini_fat, mini_data = [], b''
    for name, raw in streams.items():
        if mini:
            start = len(mini_fat)
            count = (len(raw)+63)//64
            for i in range(count):
                mini_fat.append(start+i+1 if i<count-1 else END)
            mini_data += raw + bytes((-len(raw)) % 64)
            entries.append((name, start, len(raw)))
        else:
            raw += bytes(max(0, 4096-len(raw)))
            start, size = allocate(raw)
            entries.append((name, start, size))
    root_start, root_size = allocate(mini_data) if mini else (END, 0)
    minifat_start, minifat_size = allocate(struct.pack('<'+'I'*len(mini_fat), *mini_fat)+struct.pack('<I',FREE)*((-len(mini_fat))%128)) if mini else (END, 0)
    def directory_entry(name, kind, start, size, right=FREE, child=FREE):
        b = bytearray(128)
        encoded = (name+'\0').encode('utf-16le')
        b[:len(encoded)] = encoded
        struct.pack_into('<H',b,64,len(encoded)); b[66]=kind; b[67]=1
        struct.pack_into('<III',b,68,FREE,right,child)
        struct.pack_into('<IQ',b,116,start,size)
        return bytes(b)
    directory = directory_entry('Root Entry',5,root_start,root_size,child=1)
    for i,(name,start,size) in enumerate(entries):
        directory += directory_entry(name,2,start,size,right=i+2 if i+1<len(entries) else FREE)
    directory_start,_ = allocate(directory)
    fat_index=len(sectors)
    chains.append(0xFFFFFFFD)
    fat=struct.pack('<'+'I'*len(chains),*chains)+struct.pack('<I',FREE)*(128-len(chains))
    sectors.append(fat)
    header=bytearray(512);header[:8]=formats.CFB_MAGIC
    struct.pack_into('<HHHHH',header,24,0x003E,3,0xFFFE,9,6)
    struct.pack_into('<I',header,44,1);struct.pack_into('<I',header,48,directory_start)
    struct.pack_into('<I',header,56,4096);struct.pack_into('<II',header,60,minifat_start,minifat_size//512)
    struct.pack_into('<II',header,68,END,0)
    struct.pack_into('<109I',header,76,fat_index,*([FREE]*108))
    return bytes(header)+b''.join(sectors)


def doc_body(encrypted=False):
    b=bytearray(64)
    struct.pack_into('<HH',b,0,0xA5EC,0x00C1)
    struct.pack_into('<H',b,10,0x100 if encrypted else 0)
    return bytes(b)


def xls_body(version=0x0600,encrypted=False):
    return struct.pack('<HHHH',0x0809,4,version,0x0005)+(struct.pack('<HHH',0x002F,2,0) if encrypted else b'')+struct.pack('<HH',0x000A,0)


def ppt_current(encrypted=False):
    b=bytearray(32)
    struct.pack_into('<HHI',b,0,0,0x0FF6,24)
    struct.pack_into('<II',b,8,20,0xF3D1C4DF if encrypted else 0xE391C05F)
    struct.pack_into('<HBB',b,22,0x03F4,3,0)
    return bytes(b)


class FormatTests(unittest.TestCase):
    def check_error(self, data, name, code):
        with self.assertRaises(formats.FormatError) as got:
            formats.inspect(data,name)
        self.assertEqual(got.exception.code,code)
        return got.exception

    def test_ooxml_all_variants_and_actual_types(self):
        for _,(_,ext) in formats.CONTENT_TYPES.items():
            with self.subTest(ext=ext):
                got=formats.inspect(package(ext), '测试.'+ext)
                self.assertEqual(got['format'],ext)
                self.assertTrue(got['extensionMatches'])
                self.assertEqual(got['creator']['version'],'16.0123')
                self.assertIn('不代表',got['creator']['meaning'])

    def test_modern_word_strict_and_transitional_preserve_numbers_and_tables(self):
        for strict in (False,True):
            data=package('docx',strict=strict)
            got=formats.inspect(data,'a.docx')
            self.assertIn('Strict' if strict else 'Transitional',got['formatVersion'])
            with tempfile.TemporaryDirectory() as folder:
                path=Path(folder)/'qa.docx';path.write_bytes(data)
                out=source.extract(path)
                self.assertEqual(out['paras'],['单体 A：高度 23.70m，地上 5 层。'])
                self.assertEqual(out['tables'],[[['首层面积 1234.56㎡']]])

    def test_signature_rejects_renamed_file(self):
        error=self.check_error(package('xlsx'),'a.docx','FORMAT_MISMATCH')
        self.assertEqual(error.detected['family'],'excel')
        self.assertFalse(error.detected['extensionMatches'])

    def test_macro_is_reported_never_executed(self):
        got=formats.inspect(package('docm',macro=True),'a.docm')
        self.assertTrue(got['macros'])
        self.assertTrue(got['warnings'])

    def test_package_missing_relationship_is_not_silently_accepted(self):
        self.check_error(package(rels=False),'a.docx','INVALID_FILE')

    def test_truncated_zip_is_rejected(self):
        self.check_error(package()[:-35],'a.docx','INVALID_FILE')

    def test_unknown_or_empty_file_is_rejected(self):
        self.check_error(b'','a.docx','EMPTY_FILE')
        self.check_error(b'<html>not excel</html>','a.xls','UNSUPPORTED_FORMAT')
        self.check_error(b'{\\rtf1 hello}','a.doc','UNSUPPORTED_FORMAT')

    def test_legacy_word_with_normal_and_mini_streams(self):
        for mini in (False,True):
            got=formats.inspect(compound({'WordDocument':doc_body(),'0Table':b'qa'},mini),'a.doc')
            self.assertEqual(got['format'],'doc')
            self.assertIn('nFib=0x00C1',got['formatVersion'])

    def test_word_and_ooxml_encryption_rejected(self):
        self.check_error(compound({'WordDocument':doc_body(True),'0Table':b'qa'}),'a.doc','ENCRYPTED_FILE')
        error=self.check_error(compound({'EncryptionInfo':b'qa','EncryptedPackage':b'qa'},True),'a.xlsx','ENCRYPTED_FILE')
        self.assertEqual(error.detected['format'],'encrypted-ooxml')

    def test_word_saved_format_extension_is_not_an_installed_version(self):
        body=bytearray(doc_body());struct.pack_into('<HH',body,38,1,0x0112)
        got=formats.inspect(compound({'WordDocument':body,'0Table':b'qa'}),'a.doc')
        self.assertEqual(got['nFibNew'],0x0112)
        self.assertIn('nFibNew=0x0112',got['formatVersion'])
        self.assertNotIn('installedVersion',got)

    def test_legacy_excel_versions_and_filepass(self):
        for version,expected in [(0x0500,'BIFF5'),(0x0600,'BIFF8')]:
            for mini in (False,True):
                got=formats.inspect(compound({'Workbook':xls_body(version)},mini),'a.xls')
                self.assertIn(expected,got['formatVersion'])
        self.check_error(compound({'Workbook':xls_body(encrypted=True)}),'a.xls','ENCRYPTED_FILE')

    def test_legacy_ppt_and_encryption(self):
        for mini in (False,True):
            got=formats.inspect(compound({'PowerPoint Document':b'qa','Current User':ppt_current()},mini),'a.ppt')
            self.assertEqual(got['family'],'powerpoint')
            self.assertIn('1012',got['formatVersion'])
        self.check_error(compound({'PowerPoint Document':b'qa','Current User':ppt_current(True)},True),'a.ppt','ENCRYPTED_FILE')

    def test_cfb_truncation_and_mixed_root_streams(self):
        data=compound({'WordDocument':doc_body(),'0Table':b'qa'})
        self.check_error(data[:-512],'a.doc','INVALID_FILE')
        self.check_error(compound({'WordDocument':doc_body(),'Workbook':xls_body()}),'a.doc','UNSUPPORTED_FORMAT')

    def test_zip_resource_limit(self):
        with unittest.mock.patch.object(formats,'MAX_EXPANDED',10):
            self.check_error(package(),'a.docx','RESOURCE_LIMIT')

    def test_pdf_versions_pages_and_catalog_override(self):
        from pypdf import PdfWriter
        from pypdf.generic import NameObject
        for version in ['1.0','1.4','1.7','2.0']:
            writer=PdfWriter();writer.add_blank_page(width=595,height=842);writer.pdf_header='%PDF-'+version
            target=io.BytesIO();writer.write(target)
            got=formats.inspect(target.getvalue(),'a.pdf')
            self.assertEqual(got['formatVersion'],'PDF '+version)
            self.assertEqual(got['pageCount'],1)
        writer.pdf_header='%PDF-1.4';writer._root_object[NameObject('/Version')]=NameObject('/2.0')
        target=io.BytesIO();writer.write(target)
        self.assertEqual(formats.inspect(target.getvalue(),'a.pdf')['formatVersion'],'PDF 2.0')

    def test_encrypted_and_truncated_pdf(self):
        from pypdf import PdfWriter
        writer=PdfWriter();writer.add_blank_page(width=595,height=842);writer.encrypt('synthetic-test-only')
        target=io.BytesIO();writer.write(target)
        self.check_error(target.getvalue(),'a.pdf','ENCRYPTED_FILE')
        self.check_error(target.getvalue()[:-50],'a.pdf','INVALID_FILE')

    def test_actual_docx_xlsx_pptx_library_outputs(self):
        from docx import Document
        from openpyxl import Workbook
        from pptx import Presentation
        doc=Document();doc.add_paragraph('高度23.70m');sheet=Workbook();sheet.active['A1']=23.70
        slides=Presentation();slides.slides.add_slide(slides.slide_layouts[6])
        for ext,obj in [('docx',doc),('xlsx',sheet),('pptx',slides)]:
            target=io.BytesIO();obj.save(target)
            self.assertEqual(formats.inspect(target.getvalue(),'a.'+ext)['format'],ext)


if __name__=='__main__':
    import unittest.mock
    unittest.main()
