"""Extract local DOCX body/table order and embedded images with nearby captions."""
import sys,json,zipfile,base64,io,posixpath
from pathlib import Path
from lxml import etree as E
from PIL import Image
W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';N={'w':W,'a':'http://schemas.openxmlformats.org/drawingml/2006/main','v':'urn:schemas-microsoft-com:vml','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
def extract(path):
 z=zipfile.ZipFile(path);doc=E.fromstring(z.read('word/document.xml'));body=doc.find('w:body',N)
 rel={x.get('Id'):posixpath.normpath('word/'+x.get('Target','')) for x in E.fromstring(z.read('word/_rels/document.xml.rels')) if x.get('TargetMode')!='External'}
 text=lambda el:''.join(el.xpath('.//w:t[not(ancestor::w:del)]/text()',namespaces=N))
 blocks=list(body);out={'paras':[],'tables':[],'images':[],'ordered':[]}
 for i,b in enumerate(blocks):
  t=text(b)
  if b.tag=='{'+W+'}p' and t.strip():out['paras'].append(t);out['ordered'].append({'type':'p','index':len(out['paras'])-1,'text':t})
  if b.tag=='{'+W+'}tbl':
   rows=[[text(c) for c in r.findall('w:tc',N)] for r in b.findall('w:tr',N)];out['tables'].append(rows);out['ordered'].append({'type':'table','index':len(out['tables'])-1})
  ids=b.xpath('.//a:blip/@r:embed | .//v:imagedata/@r:id',namespaces=N)
  for rid in ids:
   part=rel.get(rid)
   if not part or part not in z.namelist():continue
   try:
    im=Image.open(io.BytesIO(z.read(part)));im.thumbnail((1600,1600));im=im.convert('RGB');buf=io.BytesIO();im.save(buf,format='JPEG',quality=86)
   except Exception:continue
   nearby=[text(p) for p in blocks[i+1:i+5] if p.tag=='{'+W+'}p']
   caption=next((p.strip() for p in nearby if p.strip().startswith(('图','照片')) or ('图' in p and len(p)<70)), '')
   out['images'].append({'id':'image-'+str(i)+'-'+rid,'caption':caption,'afterParagraph':len(out['paras']),'data':'data:image/jpeg;base64,'+base64.b64encode(buf.getvalue()).decode(),'sourcePart':part})
 return out
if __name__=='__main__':Path(sys.argv[2]).write_text(json.dumps(extract(sys.argv[1]),ensure_ascii=False),encoding='utf-8')
