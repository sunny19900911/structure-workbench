from pathlib import Path
from lxml import etree
from hashlib import sha256
import sys,zipfile,json

folder=Path(sys.argv[1]);ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
def facts(name):
 with zipfile.ZipFile(folder/name) as z:
  assert z.testzip() is None
  xml=etree.fromstring(z.read('word/document.xml'))
  for n in z.namelist():
   if n.endswith('.xml'):etree.fromstring(z.read(n))
  hidden=xml.xpath('//w:tc[w:tcPr/w:vMerge[not(@w:val) or @w:val="continue"]]//w:t',namespaces=ns)
  rawText=''.join(xml.xpath('//w:t/text()',namespaces=ns))
  for node in hidden:node.text=''
  return {'rawText':rawText,'text':''.join(xml.xpath('//w:t/text()',namespaces=ns)),
    'sections':[{'size':dict(s.find('w:pgSz',ns).attrib),'columns':dict(s.find('w:cols',ns).attrib)} for s in xml.xpath('//w:sectPr',namespaces=ns)],
    'tables':len(xml.xpath('//w:tbl',namespaces=ns)),
    'span':xml.xpath('//w:gridSpan/@w:val',namespaces=ns),
    'vmerge':[v.get('{'+ns['w']+'}val','continue') for v in xml.xpath('//w:vMerge',namespaces=ns)],
    'images':sorted(sha256(z.read(n)).hexdigest() for n in z.namelist() if n.startswith('word/media/') and not n.endswith('/')),
    'headers':sorted(''.join(etree.fromstring(z.read(n)).xpath('//w:t/text()',namespaces=ns)) for n in z.namelist() if (n.startswith('word/header') or n.startswith('word/footer')) and n.endswith('.xml'))}
results={name:facts(name+'.docx') for name in ['source','untouched','edited']}
differences=[]
for key in results['source']:
 if key=='rawText':continue
 if results['source'][key]!=results['untouched'][key]:differences.append('untouched:'+key)
 expected=results['source'][key]
 if key=='text':expected=expected.replace('本段为MCP人工改稿保留验收。','网页已经修改并保存。').replace('此处为人工修改测试段落。','网页已经修改并保存。')
 if expected!=results['edited'][key]:differences.append('edited:'+key)
rawTextChanged=results['source']['rawText']!=results['untouched']['rawText']
(folder/'roundtrip-verification.json').write_text(json.dumps({'differences':differences,'hiddenMergedCellTextNormalized':rawTextChanged,'facts':results},ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'differences':differences,'tables':results['source']['tables'],'imageCount':len(results['source']['images']),'textCharacters':len(results['source']['text']),'sections':results['source']['sections']},ensure_ascii=False))
assert not differences,differences
