"""Run with the document Python runtime (python-docx and openpyxl)."""
import importlib.util
import tempfile
import unittest
from pathlib import Path
from docx import Document

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
            self.assertFalse(document._element.xpath(".//*[local-name()='imagedata'] | .//*[local-name()='drawing']"))
            self.assertIn('计算书回归测试',''.join(document._element.itertext()))

if __name__=='__main__':unittest.main()
