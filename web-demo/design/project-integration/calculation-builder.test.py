"""Run with the document Python runtime (python-docx and openpyxl)."""
import importlib.util
import tempfile
import base64
from unittest.mock import patch
import unittest
from pathlib import Path
from docx import Document
from docx.oxml.ns import qn

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('builder', ROOT/'scripts/build-calculation-book.py')
builder=importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

class DeploymentTests(unittest.TestCase):
    def test_missing_external_templates_does_not_block_cover_and_catalog(self):
        qa=ROOT/'qa/calculation-builder'
        qa.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=qa) as folder:
            root=Path(folder)
            status=builder.status_payload(root/'absent')
            self.assertTrue(status['ready'])
            self.assertEqual(status['workbooks'],[])
            payload={'project_name':'计算书回归测试','sections':[{'title':'人工目录','items':['人工调整条目']}], 'out_files':[]}
            result=builder.build(root/'absent',root,payload)
            document=Document(result['path'])
            self.assertIn('人工调整条目','\n'.join(p.text for p in document.paragraphs))
            self.assertEqual(len(document.sections),2)
            reference=Document(ROOT/'assets/calculation-book/cover-reference.docx')
            # The new native master has an institute logo, not a personal signature.
            self.assertEqual(len(document._element.xpath(".//*[local-name()='imagedata'] | .//*[local-name()='drawing']")),len(reference._element.xpath(".//*[local-name()='imagedata'] | .//*[local-name()='drawing']")))
            self.assertIn('计算书回归测试',''.join(document._element.itertext()))

    def test_out_sections_are_two_columns_without_changing_cover_or_catalog(self):
        qa=ROOT/'qa/calculation-builder';qa.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=qa) as folder:
            root=Path(folder)
            payload={'project_name':'分节回归', 'sections':[{'items':['模型原文']}],
                     'out_files':[]}
            no_out=Document(builder.build(root,root,payload)['path'])
            names=['WMASS.OUT','WDISP.OUT','WZQ.OUT']
            payload['out_files']=[{'name':name,'content_base64':base64.b64encode(('\n'.join(f'{name} LINE {i:04d} X Y' for i in range(400))).encode()).decode()} for name in names]
            doc=Document(builder.build(root,root,payload)['path'])
            counts=[sec._sectPr.find(qn('w:cols')).get(qn('w:num'),'1') for sec in doc.sections]
            self.assertEqual(counts,['1','1','2'])
            self.assertEqual(doc.sections[0]._sectPr.xml,no_out.sections[0]._sectPr.xml)
            self.assertEqual([t._tbl.xml for t in doc.tables[:5]],[t._tbl.xml for t in no_out.tables[:5]])
            headings=[p for p in doc.paragraphs if p.text in names]
            self.assertEqual([p.paragraph_format.page_break_before for p in headings],[False,True,True])
            text='\n'.join(p.text for p in doc.paragraphs)
            for name in names:
                self.assertIn(f'{name} LINE 0399 X Y',text)

    def test_excel_and_out_have_independent_column_settings(self):
        qa=ROOT/'qa/calculation-builder';qa.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=qa) as folder:
            root=Path(folder)
            payload={'sections':[{'items':['表及模型']}], 'excel_blocks':[{}],
                     'out_files':[{'name':'WMASS.OUT','content_base64':base64.b64encode(b'OUT text').decode()}]}
            with patch.object(builder,'add_excel_block',side_effect=lambda doc,source,block:doc.add_paragraph('Excel table')):
                doc=Document(builder.build(root,root,payload)['path'])
            self.assertEqual([sec._sectPr.find(qn('w:cols')).get(qn('w:num'),'1') for sec in doc.sections],['1','1','1','2'])

if __name__=='__main__':unittest.main()
