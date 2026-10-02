from pathlib import Path
from lxml import etree as E
import zipfile,json,hashlib,re
root=Path('E:/600-工作台数据库/610-待处理/001-历史项目的设计说明');out=Path('qa/irregularity-library');out.mkdir(parents=True,exist_ok=True);docs=[]
for p in sorted(root.iterdir()):
 if not p.name[:1].isdigit() or p.suffix.lower() not in ['.doc','.docx','.pptx']:continue
 rows=[]
 if p.suffix=='.doc':
  tree=E.fromstring((out/(p.name+'.xml')).read_bytes());rows=[''.join(n.itertext()).strip() for n in tree.xpath('//para|//entry')]
 else:
  z=zipfile.ZipFile(p)
  if p.suffix=='.docx':
   tree=E.fromstring(z.read('word/document.xml'));ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
   rows=[''.join(n.xpath('.//w:t/text()',namespaces=ns)).strip() for n in tree.xpath('//w:body/w:p|//w:body/w:tbl/w:tr',namespaces=ns)]
  else:
   for file in sorted([f for f in z.namelist() if re.match(r'ppt/slides/slide\d+.xml',f)]):
    tree=E.fromstring(z.read(file));rows.append(file+': '+''.join(tree.xpath('//*[local-name()="t"]/text()')))
 rows=[r for r in rows if r]
 docs.append({'file':p.name,'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'rows':rows})
 (out/(p.stem+'.txt')).write_text('\n'.join(f'{i+1}: {r}' for i,r in enumerate(rows)),encoding='utf-8')
(out/'extracted.json').write_text(json.dumps(docs,ensure_ascii=False),encoding='utf-8')
for d in docs:
 print('\nFILE',d['file'])
 for i,r in enumerate(d['rows']):
  if re.search('不规则.*(措施|处理)|针对.*不规则|抗震加强措施|采取的.*措施',r):print(i+1,r[:200])
