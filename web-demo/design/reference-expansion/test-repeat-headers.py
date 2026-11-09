import importlib.util,json,tempfile,unittest,zipfile
from pathlib import Path
from lxml import etree as E
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('reference_docx',ROOT/'server/reference-docx.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
N=module.N
class RepeatHeaders(unittest.TestCase):
 def test_metrics_are_not_repeating_headers_and_other_table_header_survives(self):
  blocks=[]
  for key in [18,19]:
   rows=E.fromstring(module.PAT['tables'][str(key)]).findall('w:tr',N)
   blocks.append({'kind':'table','template':key,'rows':[{'source':i,'values':['value-'+str(i)+'-'+str(j) for j,c in enumerate(r.findall('w:tc',N))]} for i,r in enumerate(rows)]})
  blocks += [{'kind':'h1','text':'10 结构规则性判断与应对措施'},{'kind':'h2','text':'10.1 多层建筑规则性判断'}]
  with tempfile.TemporaryDirectory() as temp:
   path=Path(temp)/'fixture.docx';module.build({'blocks':blocks},path)
   with zipfile.ZipFile(path) as z:
    self.assertIsNone(z.testzip());body=E.fromstring(z.read('word/document.xml')).find('w:body',N)
   tables=body.findall('w:tbl',N);self.assertEqual(len(tables),2)
   self.assertEqual(len(tables[0].findall('w:tr/w:trPr/w:tblHeader',N)),1)
   self.assertEqual(len(tables[1].findall('w:tr/w:trPr/w:tblHeader',N)),0)
   self.assertEqual(len(tables[1].findall('w:tr',N)),23)
   original=E.fromstring(module.PAT['tables']['19'])
   self.assertEqual([x.attrib for x in tables[1].findall('w:tblGrid/w:gridCol',N)],[x.attrib for x in original.findall('w:tblGrid/w:gridCol',N)])
   self.assertEqual([x.attrib for x in tables[1].findall('.//w:tcPr/w:gridSpan',N)],[x.attrib for x in original.findall('.//w:tcPr/w:gridSpan',N)])
   self.assertEqual([x.attrib for x in tables[1].findall('.//w:tcPr/w:vMerge',N)],[x.attrib for x in original.findall('.//w:tcPr/w:vMerge',N)])
   index=list(body).index(tables[1]);self.assertEqual(''.join(body[index+1].xpath('.//w:t/text()',namespaces=N)),'10 结构规则性判断与应对措施')
if __name__=='__main__':unittest.main()
