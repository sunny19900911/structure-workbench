from pathlib import Path
from lxml import etree
import zipfile,json
from hashlib import sha256
p=Path('qa/portable-release/mcp/office/commands/edited.docx')
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main'}
with zipfile.ZipFile(p) as z:
 root=etree.fromstring(z.read('word/document.xml'))
 runs=root.xpath('//w:r[w:t="网页已经修改并保存。"]',namespaces=ns)
 assert len(runs)==1
 run=runs[0]
 for mark in ['b','i','u']:assert run.find('w:rPr/w:'+mark,ns) is not None,mark
 assert run.find('w:rPr/w:sz',ns).get('{'+ns['w']+'}val')=='28'
 assert '仿宋' in str(run.find('w:rPr/w:rFonts',ns).attrib)
 assert len(root.xpath('//w:tbl',namespaces=ns))==2
 assert len(root.xpath('//w:drawing',namespaces=ns))==2
 assert '测试连廊' not in ''.join(root.xpath('//w:t/text()',namespaces=ns))
 assert len(root.xpath('//w:tbl[2]/w:tr',namespaces=ns))==2
 actualImages={sha256(z.read(n)).hexdigest() for n in z.namelist() if n.startswith('word/media/') and not n.endswith('/')}
 with zipfile.ZipFile(p.parent/'source.docx') as source:
  assert all(sha256(source.read(n)).hexdigest() in actualImages for n in source.namelist() if n.startswith('word/media/') and not n.endswith('/'))
 report={'saved':True,'marks':['bold','italic','underline'],'font':'仿宋','fontSize':14,'tables':2,'pictures':2,'deletedRowAbsent':True}
(p.parent/'command-file-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(report,ensure_ascii=False))
