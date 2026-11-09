"""Extract local DOCX body/table order and embedded images with nearby captions."""
import sys,json,zipfile,base64,io,posixpath
from pathlib import Path
from lxml import etree as E
from PIL import Image
W='http://schemas.openxmlformats.org/wordprocessingml/2006/main'

def parse(data):
 return E.fromstring(data,E.XMLParser(resolve_entities=False,no_network=True,load_dtd=False,huge_tree=False))
def extract(path):
 z=zipfile.ZipFile(path)
 roots=parse(z.read('_rels/.rels'))
 part=next(x.get('Target','').lstrip('/') for x in roots if x.get('Type','').endswith('/officeDocument') and x.get('TargetMode')!='External')
 doc=parse(z.read(part));w=E.QName(doc).namespace
 if w not in (W,'http://purl.oclc.org/ooxml/wordprocessingml/main'):raise ValueError('Word XML namespace is unsupported')
 strict=w!=W
 N={'w':w,'a':'http://purl.oclc.org/ooxml/drawingml/main' if strict else 'http://schemas.openxmlformats.org/drawingml/2006/main','v':'urn:schemas-microsoft-com:vml','r':'http://purl.oclc.org/ooxml/officeDocument/relationships' if strict else 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
 body=doc.find('w:body',N)
 if body is None:raise ValueError('Word body is missing')
 relpath=posixpath.join(posixpath.dirname(part),'_rels',posixpath.basename(part)+'.rels')
 rel={x.get('Id'):posixpath.normpath(posixpath.join(posixpath.dirname(part),x.get('Target',''))) for x in parse(z.read(relpath)) if x.get('TargetMode')!='External'} if relpath in z.namelist() else {}
 text=lambda el:''.join(el.xpath('.//w:t[not(ancestor::w:del)]/text()',namespaces=N))
 styles={}
 stylepart=posixpath.join(posixpath.dirname(part),'styles.xml')
 if stylepart in z.namelist():
  styles={x.get('{'+w+'}styleId'):x for x in parse(z.read(stylepart)).findall('w:style',N)}
 def paragraph_meta(p):
  pr=p.find('w:pPr',N);chain=[pr] if pr is not None else []
  sid=pr.find('w:pStyle',N) if pr is not None else None
  key=sid.get('{'+w+'}val') if sid is not None else None;seen=set()
  while key and key not in seen and key in styles:
   seen.add(key);style=styles[key];spr=style.find('w:pPr',N)
   if spr is not None:chain.append(spr)
   base=style.find('w:basedOn',N);key=base.get('{'+w+'}val') if base is not None else None
  meta={}
  for props in chain:
   level=props.find('w:outlineLvl',N)
   if level is not None and 'headingLevel' not in meta:
    value=int(level.get('{'+w+'}val','9'))
    if value<9:meta['headingLevel']=value
   numbering=props.find('w:numPr',N)
   if numbering is not None and 'numbering' not in meta:
    meta['numbering']={E.QName(c).localname:c.get('{'+w+'}val') for c in numbering}
  return meta
 blocks=list(body);out={'paras':[],'paragraphMeta':[],'tables':[],'tableMeta':[],'images':[],'ordered':[],'warnings':[]}
 for i,b in enumerate(blocks):
  t=text(b)
  if b.tag=='{'+w+'}p' and t.strip():
   out['paras'].append(t);out['paragraphMeta'].append(paragraph_meta(b));out['ordered'].append({'type':'p','index':len(out['paras'])-1,'text':t})
  if b.tag=='{'+w+'}tbl':
   rows=[];details=[];previous={}
   for r in b.findall('w:tr',N):
    before=r.find('w:trPr/w:gridBefore',N);start=int(before.get('{'+w+'}val','0')) if before is not None else 0
    row=['']*start;cells=[];current={}
    for c in r.findall('w:tc',N):
     span=c.find('w:tcPr/w:gridSpan',N);width=int(span.get('{'+w+'}val','1')) if span is not None else 1
     merge=c.find('w:tcPr/w:vMerge',N);mode=merge.get('{'+w+'}val','continue') if merge is not None else ''
     column=len(row);raw=text(c);value=previous.get(column,'') if mode=='continue' else raw
     cells.append({'column':column,'span':width,'verticalMerge':mode,'text':raw})
     for j in range(width):
      row.append(value)
      if mode:current[column+j]=value
    previous=current;rows.append(row);details.append({'header':r.find('w:trPr/w:tblHeader',N) is not None,'cells':cells})
   out['tables'].append(rows);out['tableMeta'].append({'rows':details});out['ordered'].append({'type':'table','index':len(out['tables'])-1})
  ids=b.xpath('.//a:blip/@r:embed | .//v:imagedata/@r:id',namespaces=N)
  for rid in ids:
   part=rel.get(rid)
   if not part or part not in z.namelist():
    out['warnings'].append('有一幅内嵌图片缺少内容，未能提取。');continue
   try:
    im=Image.open(io.BytesIO(z.read(part)));im.thumbnail((1600,1600));im=im.convert('RGB');buf=io.BytesIO();im.save(buf,format='JPEG',quality=86)
   except Exception:
    out['warnings'].append('图片格式无法转换：'+part+'；请从原文件另存图片上传。');continue
   nearby=[text(p) for p in blocks[i+1:i+5] if p.tag=='{'+w+'}p']
   caption=next((p.strip() for p in nearby if p.strip().startswith(('图','照片')) or ('图' in p and len(p)<70)), '')
   out['images'].append({'id':'image-'+str(i)+'-'+rid,'caption':caption,'afterParagraph':len(out['paras']),'data':'data:image/jpeg;base64,'+base64.b64encode(buf.getvalue()).decode(),'sourcePart':part})
 if not out['paras'] and not any(any(any(str(c).strip() for c in row) for row in table) for table in out['tables']):out['warnings'].append('文档未提取到可编辑文字；可能主要由扫描图片组成。')
 out['warnings']=list(dict.fromkeys(out['warnings']))
 return out
if __name__=='__main__':Path(sys.argv[2]).write_text(json.dumps(extract(sys.argv[1]),ensure_ascii=False),encoding='utf-8')
