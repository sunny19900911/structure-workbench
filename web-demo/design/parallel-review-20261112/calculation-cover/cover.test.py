import importlib.util
import hashlib
import json
import unittest
import zipfile
from pathlib import Path
from lxml import etree
from docx import Document
from docx.oxml.ns import qn

ROOT=Path(__file__).resolve().parents[3]
QA=ROOT/'qa/portable-release/calculation-cover-20261112'
ASSET=ROOT/'assets/calculation-book/cover-reference.docx'
spec=importlib.util.spec_from_file_location('builder',ROOT/'scripts/build-calculation-book.py')
builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
PAYLOAD={'project_name':'科创园研发中心','project_code':'QA-2026-324','stage':'扩初','unit':'1号研发楼','discipline':'结构','company':'同济大学建筑设计研究院(集团)有限公司','software':'QA结构分析软件','software_version':'QA-9.9','sections':[{'title':'人工目录','items':['基础及上部结构','模型输出原文']}], 'out_files':[{'name':'WMASS.OUT','content_base64':'UUFfT1VUX1JFVEFJTkVE'}]}

def geometry(doc):
    result=[]
    for table in doc.tables[:5]:
        result.append([etree.tostring(e,method='c14n') for e in table._tbl.iter() if e.tag in [qn('w:tblPr'),qn('w:tblGrid'),qn('w:trPr'),qn('w:tcPr'),qn('w:pPr')]])
    return result

class CoverTests(unittest.TestCase):
    def test_current_slots_and_empty_private_or_historical_values(self):
        doc=Document(ASSET);builder.clean_cover_identity(doc);builder.apply_current_cover(doc,PAYLOAD)
        self.assertEqual(doc.tables[0].cell(0,1).text,PAYLOAD['project_code'])
        for row,key in [(0,'project_name'),(2,'stage'),(6,'unit'),(8,'discipline')]:self.assertEqual(doc.tables[1].cell(row,1).text,PAYLOAD[key])
        for row in (4,12,14,16,18,20,22,23):self.assertFalse(doc.tables[1].cell(row,1).text.strip())
        self.assertFalse(doc.tables[2].cell(0,1).text.strip())
        self.assertEqual([p.text for p in doc.tables[3].cell(0,1).paragraphs],['QA结构分析软件','QA-9.9'])
        text=''.join(doc.element.itertext());self.assertNotIn('7.1.0',text);self.assertNotIn('{{',text)
    def test_missing_values_remain_empty_and_placeholder_is_rejected(self):
        doc=Document(ASSET);builder.apply_current_cover(doc,{})
        self.assertEqual(doc.tables[1].cell(0,1).text,'');self.assertEqual(doc.tables[0].cell(0,1).text,'')
        self.assertFalse(doc.tables[3].cell(0,1).text.strip())
        self.assertEqual(doc.tables[4].cell(0,1).text,Document(ASSET).tables[4].cell(0,1).text)
        with self.assertRaises(SystemExit):builder.apply_current_cover(Document(ASSET),{'project_name':'{{project_name}}'})
    def test_explicit_other_company_replaces_name_and_preserves_logo(self):
        doc=Document(ASSET);builder.apply_current_cover(doc,{'company':'QA设计单位'})
        self.assertEqual(doc.tables[4].cell(0,1).paragraphs[0].text,'QA设计单位')
        self.assertFalse(doc.tables[4].cell(0,1).paragraphs[1].text)
        self.assertEqual(len(doc.element.xpath(".//*[local-name()='imagedata']")),1)
    def test_native_geometry_styles_logo_and_section_are_retained(self):
        reference=Document(ASSET);doc=Document(ASSET);builder.clean_cover_identity(doc);builder.apply_current_cover(doc,PAYLOAD)
        self.assertEqual(geometry(reference),geometry(doc));self.assertEqual(reference.sections[0]._sectPr.xml,doc.sections[0]._sectPr.xml)
        self.assertEqual(len(reference.element.xpath(".//*[local-name()='imagedata']")),len(doc.element.xpath(".//*[local-name()='imagedata']")))
        p=doc.tables[1].cell(0,1).paragraphs[0]
        self.assertEqual(etree.tostring(p._p.find('w:pPr/w:rPr',p._p.nsmap)),etree.tostring(p._p.find('w:r/w:rPr',p._p.nsmap)))
    def test_actual_builder_keeps_cover_section_and_out(self):
        result=builder.build(QA/'absent',QA/'builder',PAYLOAD);doc=Document(result['path']);reference=Document(ASSET)
        self.assertEqual(geometry(reference),geometry(doc))
        # python-docx relocates the cover sectPr into the new section boundary;
        # revision IDs can change, but all page/column/margin children must match.
        self.assertEqual([etree.tostring(e,method='c14n') for e in doc.sections[0]._sectPr],[etree.tostring(e,method='c14n') for e in reference.sections[0]._sectPr])
        self.assertIn('QA_OUT_RETAINED','\n'.join(p.text for p in doc.paragraphs));self.assertEqual(len(doc.sections),3)
        for section in doc.sections:
            columns=section._sectPr.find(qn('w:cols'))
            self.assertEqual(columns.get(qn('w:num'),'1'),'1')
            self.assertEqual(len(columns),0)
        self.assertFalse(doc.element.xpath('.//w:br[@w:type="column"]'))
        original=Document(QA/'reference/reference.docx')
        self.assertEqual(geometry(original),geometry(doc))
        self.assertEqual(doc.sections[0].gutter,original.sections[0].gutter)
        self.assertEqual([etree.tostring(p._p.pPr,method='c14n') if p._p.pPr is not None else b'' for p in original.paragraphs],[etree.tostring(p._p.pPr,method='c14n') if p._p.pPr is not None else b'' for p in doc.paragraphs[:len(original.paragraphs)]])
        (QA/'builder-result.json').write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')
    def test_template_source_selection_ignores_old_external_cover(self):
        self.assertEqual(builder.sources(QA/'absent')['cover'],ASSET)
        self.assertIsNone(builder.status_payload(QA/'absent')['templates']['cover'])
    def test_reference_preserve_only_package_parts_and_original_hash(self):
        with zipfile.ZipFile(QA/'reference/reference.docx') as ref,zipfile.ZipFile(ASSET) as asset:
            for name in ref.namelist():
                if name not in ('word/document.xml','docProps/core.xml'):self.assertEqual(ref.read(name),asset.read(name),name)
        self.assertEqual(hashlib.sha256(Path('E:/!!!!!!!!TO HOME/QS-324 计算书封面（行政审定不用签字）.DOC').read_bytes()).hexdigest(),'fac7d691fcd6d7bd5447b4dcf46b710199d1e5893011d1296ca3e26ee98ff401')

if __name__=='__main__':unittest.main()
