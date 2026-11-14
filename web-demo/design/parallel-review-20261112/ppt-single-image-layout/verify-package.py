import json,zipfile,hashlib,posixpath,io
from pathlib import Path
from xml.etree import ElementTree as E
from PIL import Image
qa=Path('qa/parallel-review-20261112/ppt-single-image-layout')
expected=json.loads((qa/'verify-results.json').read_text(encoding='utf-8'))
ns={'p':'http://schemas.openxmlformats.org/presentationml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships','pr':'http://schemas.openxmlformats.org/package/2006/relationships'}
results=[]
for file in ['single27-ui.pptx','single27-mcp.pptx']:
 with zipfile.ZipFile(qa/file) as z:
  names=set(z.namelist());presentation=E.fromstring(z.read('ppt/presentation.xml'));ids=presentation.findall('p:sldIdLst/p:sldId',ns);assert len(ids)==27
  links={r.attrib['Id']:r.attrib['Target'] for r in E.fromstring(z.read('ppt/_rels/presentation.xml.rels'))};assert [links[n.attrib['{'+ns['r']+'}id']] for n in ids]==[f'slides/slide{i}.xml' for i in range(1,28)]
  assert E.fromstring(z.read('docProps/app.xml')).find('{*}Slides').text=='27'
  for name in names:
   if name.endswith('.rels'):
    folder=posixpath.dirname(name).replace('/_rels','');folder='' if folder=='_rels' else folder
    for rel in E.fromstring(z.read(name)):
     if rel.attrib.get('TargetMode')=='External':continue
     target=rel.attrib['Target'];resolved=target.lstrip('/') if target.startswith('/') else posixpath.normpath(posixpath.join(folder,target))
     assert resolved in names,(name,resolved)
  mediaHashes=[hashlib.sha256(z.read(n)).hexdigest() for n in names if n.startswith('ppt/media/')]
  assert set(expected['exportHashes'])<=set(mediaHashes)
  for i in range(12,28):
   slide=E.fromstring(z.read(f'ppt/slides/slide{i}.xml'));pics=slide.findall('.//p:pic',ns);assert len(pics)<=1
   texts=[n.text for n in slide.findall('.//a:t',ns)];assert expected['titles'][i-1] in texts,(i,texts)
   assert ('01  建筑设计' if i<=18 else '02  结构设计') in texts
   if pics:
    pic=pics[0];assert pic.find('.//a:srcRect',ns) is None
    xfrm=pic.find('p:spPr/a:xfrm',ns);off=xfrm.find('a:off',ns).attrib;ext=xfrm.find('a:ext',ns).attrib
    x,y,w,h=[int(v)/9525 for v in [off['x'],off['y'],ext['cx'],ext['cy']]]
    assert x>=131.025 and y>=68.417 and x+w<=894.974 and y+h<=631.898
    rId=pic.find('.//a:blip',ns).attrib['{'+ns['r']+'}embed'];rs={r.attrib['Id']:r.attrib['Target'] for r in E.fromstring(z.read(f'ppt/slides/_rels/slide{i}.xml.rels'))};part=posixpath.normpath(posixpath.join('ppt/slides',rs[rId]));im=Image.open(io.BytesIO(z.read(part)));assert abs(w/h-im.width/im.height)<.0001
   # One editable placeholder or image exists, never extra old multi-image shapes.
   slots=[n for n in slide.findall('.//p:cNvPr',ns) if n.attrib.get('descr')=='workbench:image-slot'];assert len(slots)==1
  results.append({'file':file,'slides':len(ids),'sourceHashesPreserved':len(set(expected['exportHashes'])),'bytes':(qa/file).stat().st_size,'relationshipTargets':'all valid','singleImageContain':'16 pages passed'})
(qa/'package-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(results))
