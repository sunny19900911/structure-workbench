from pathlib import Path
import zipfile,hashlib,json,posixpath
from xml.etree import ElementTree as E
qa=Path('qa/parallel-review-20261114/ppt-semantic-images')
manifest=json.loads((qa/'source-images.json').read_text(encoding='utf-8'));expected={i['page']:i for i in manifest if i['page']}
ns={'p':'http://schemas.openxmlformats.org/presentationml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
results=[]
for filename in ['semantic17-ui.pptx','semantic17-mcp.pptx']:
 with zipfile.ZipFile(qa/filename) as z:
  assert len(E.fromstring(z.read('ppt/presentation.xml')).findall('p:sldIdLst/p:sldId',ns))==27
  placed=[]
  for page in range(12,28):
   slide=E.fromstring(z.read(f'ppt/slides/slide{page}.xml'));pics=slide.findall('.//p:pic',ns)
   assert len(pics)==(1 if page in expected else 0),(page,len(pics))
   if page not in expected:continue
   rels={r.attrib['Id']:r.attrib['Target']for r in E.fromstring(z.read(f'ppt/slides/_rels/slide{page}.xml.rels'))}
   rid=pics[0].find('.//a:blip',ns).attrib['{'+ns['r']+'}embed'];part=posixpath.normpath(posixpath.join('ppt/slides',rels[rid]));sha=hashlib.sha256(z.read(part)).hexdigest()
   assert sha==expected[page]['sha256'],(page,expected[page]['name']);placed.append({'page':page,'name':expected[page]['name'],'sha256':sha})
  all_hashes={hashlib.sha256(z.read(name)).hexdigest()for name in z.namelist()if name.startswith('ppt/media/')}
  assert {i['sha256']for i in manifest}<=all_hashes
  leftovers=E.fromstring(z.read('customXml/workbench-ppt-images.xml'));assert len(leftovers)==9
  results.append({'filename':filename,'slides':27,'placed':placed,'unplaced':9,'sourceHashesPreserved':17,'bytes':(qa/filename).stat().st_size})
(qa/'package-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8');print('PASS both PPTX: 27 slides, 8 exact page/image SHA-256 matches, 9 unplaced, all 17 source hashes preserved')
