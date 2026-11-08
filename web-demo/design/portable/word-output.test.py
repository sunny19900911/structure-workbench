import importlib.util,tempfile,unittest
from pathlib import Path
from docx import Document
from docx.oxml.ns import qn
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('portable_html',ROOT/'server/portable-html-docx.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class ExportTest(unittest.TestCase):
 def test_text_numbers_merged_cells_and_a3_columns(self):
  with tempfile.TemporaryDirectory() as d:
   source=Path(d)/'test.html';dest=Path(d)/'test.docx'
   source.write_text('<html><body><h1>统一技术措施</h1><p>风荷载 0.35 kN/m<sup>2</sup>；地下水 -1.250 m；α<sub>max</sub>=0.16。</p><table><tr><th rowspan="2">构件</th><th colspan="2">强度等级</th></tr><tr><th>地上</th><th>地下</th></tr><tr><td>框架柱</td><td>C50</td><td>C35</td></tr></table></body></html>',encoding='utf-8')
   module.build(source,dest,'measures');doc=Document(dest)
   self.assertIn('风荷载 0.35 kN/m2；地下水 -1.250 m；αmax=0.16。',[p.text for p in doc.paragraphs])
   para=doc.paragraphs[1];self.assertTrue(next(r for r in para.runs if r.text=='2').font.superscript);self.assertTrue(next(r for r in para.runs if r.text=='max').font.subscript)
   table=doc.tables[0];self.assertEqual(table.cell(2,1).text,'C50');self.assertEqual(table.cell(2,2).text,'C35');self.assertEqual(table.cell(0,0)._tc,table.cell(1,0)._tc)
   self.assertGreater(doc.sections[0].page_width,doc.sections[0].page_height)
   self.assertEqual(doc.sections[0]._sectPr.find(qn('w:cols')).get(qn('w:num')),'2')
 def test_invalid_merged_table_fails_instead_of_losing_rows(self):
  with tempfile.TemporaryDirectory() as d:
   source=Path(d)/'bad.html';source.write_text('<html><body><table><tr><td rowspan="5">不完整</td></tr></table></body></html>',encoding='utf-8')
   with self.assertRaises(ValueError):module.build(source,Path(d)/'out.docx','measures')

if __name__=='__main__':unittest.main()
