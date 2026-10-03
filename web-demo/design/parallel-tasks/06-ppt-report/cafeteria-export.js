const A='http://schemas.openxmlformats.org/drawingml/2006/main',P='http://schemas.openxmlformats.org/presentationml/2006/main',R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const parse=s=>new DOMParser().parseFromString(s,'application/xml');
const xml=d=>new XMLSerializer().serializeToString(d);
const all=(node,ns,name)=>[...node.getElementsByTagNameNS(ns,name)];
const create=(doc,ns,name,attrs={})=>{const node=doc.createElementNS(ns,name);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,String(v));return node;};
function fillText(node,text,size){
  const body=all(node,P,'txBody')[0]||all(node,A,'txBody')[0];if(!body)return;
  const proto=all(body,A,'p')[0]?.cloneNode(true);const runStyle=all(body,A,'rPr')[0]?.cloneNode(true)||create(node.ownerDocument,A,'a:rPr');
  if(size)runStyle.setAttribute('sz',Math.round(size*75));
  const pp=proto&&all(proto,A,'pPr')[0];
  if(pp){for(const child of [...pp.children])if(['lnSpc','spcBef','spcAft'].includes(child.localName))child.remove();for(const def of all(pp,A,'defRPr'))if(size)def.setAttribute('sz',Math.round(size*75));const spacing=create(node.ownerDocument,A,'a:lnSpc');spacing.append(create(node.ownerDocument,A,'a:spcPct',{val:110000}));pp.prepend(spacing);}
  const bp=all(body,A,'bodyPr')[0];if(bp){for(const child of [...bp.children])if(['normAutofit','spAutoFit','noAutofit'].includes(child.localName))child.remove();bp.append(create(node.ownerDocument,A,'a:noAutofit'));}
  for(const p of all(body,A,'p'))p.remove();
  for(const line of String(text??'').split('\n')){const p=proto?.cloneNode(true)||create(node.ownerDocument,A,'a:p');for(const c of [...p.children])if(c.localName!=='pPr')c.remove();const r=create(node.ownerDocument,A,'a:r');if(runStyle)r.append(runStyle.cloneNode(true));const t=create(node.ownerDocument,A,'a:t');t.textContent=line;r.append(t);p.append(r);body.append(p);}
}
const emu=n=>Math.round(n*9525);
function transform(doc,b){const x=create(doc,A,'a:xfrm');x.append(create(doc,A,'a:off',{x:emu(b[0]),y:emu(b[1])}),create(doc,A,'a:ext',{cx:emu(b[2]),cy:emu(b[3])}));return x;}
function picture(doc,id,s,rid){
  const pic=create(doc,P,'p:pic'),nv=create(doc,P,'p:nvPicPr');nv.append(create(doc,P,'p:cNvPr',{id,name:s.name}),create(doc,P,'p:cNvPicPr'),create(doc,P,'p:nvPr'));pic.append(nv);
  const fill=create(doc,P,'p:blipFill'),blip=create(doc,A,'a:blip');blip.setAttributeNS(R,'r:embed',rid);const stretch=create(doc,A,'a:stretch');stretch.append(create(doc,A,'a:fillRect'));fill.append(blip,stretch);pic.append(fill);
  const pr=create(doc,P,'p:spPr'),geom=create(doc,A,'a:prstGeom',{prst:'rect'});geom.append(create(doc,A,'a:avLst'));pr.append(transform(doc,s.box),geom);pic.append(pr);return pic;
}
function placeholder(doc,id,s){
  const sp=create(doc,P,'p:sp'),nv=create(doc,P,'p:nvSpPr');nv.append(create(doc,P,'p:cNvPr',{id,name:s.name}),create(doc,P,'p:cNvSpPr'),create(doc,P,'p:nvPr'));sp.append(nv);
  const pr=create(doc,P,'p:spPr'),geom=create(doc,A,'a:prstGeom',{prst:'rect'});geom.append(create(doc,A,'a:avLst'));const line=create(doc,A,'a:ln',{w:6350}),fill=create(doc,A,'a:solidFill');fill.append(create(doc,A,'a:srgbClr',{val:'D5D5D5'}));line.append(fill);pr.append(transform(doc,s.box),geom,create(doc,A,'a:noFill'),line);sp.append(pr);
  const body=create(doc,P,'p:txBody'),p=create(doc,A,'a:p'),r=create(doc,A,'a:r'),rp=create(doc,A,'a:rPr',{sz:1400}),t=create(doc,A,'a:t');t.textContent=s.name;rp.append(create(doc,A,'a:latin',{typeface:'宋体'}),create(doc,A,'a:ea',{typeface:'宋体'}));r.append(rp,t);p.append(create(doc,A,'a:pPr',{algn:'ctr'}),r);body.append(create(doc,A,'a:bodyPr',{anchor:'ctr'}),create(doc,A,'a:lstStyle'),p);sp.append(body);return sp;
}
export async function cafeteriaBlob(slides,images=new Map()){
  const response=await fetch(new URL('../../ppt-template/cafeteria-base.pptx',import.meta.url));if(!response.ok)throw Error('食堂模板读取失败');
  const zip=await window.JSZip.loadAsync(await response.arrayBuffer());
  const types=parse(await zip.file('[Content_Types].xml').async('string'));let imageNo=0;
  for(const page of slides){
    const path=`ppt/slides/slide${page.number}.xml`,doc=parse(await zip.file(path).async('string')),tree=all(doc,P,'spTree')[0];
    const relPath=`ppt/slides/_rels/slide${page.number}.xml.rels`,rels=parse(await zip.file(relPath).async('string'));
    for(const item of page.shapes){
      const node=[...tree.children].find(n=>all(n,P,'cNvPr')[0]?.getAttribute('id')===item.id);
      if(item.kind==='text'){if(node){fillText(node,item.text,item.style.size);const pr=all(node,P,'spPr')[0];const old=pr&&all(pr,A,'xfrm')[0];if(old)old.replaceWith(transform(doc,item.box));}continue;}
      if(item.kind==='table'&&node){
        const tbl=all(node,A,'tbl')[0],oldRows=all(tbl,A,'tr').map(r=>r.cloneNode(true));all(tbl,A,'tr').forEach(r=>r.remove());
        const headers=page.number===9?2:1;
        item.rows.forEach((row,i)=>{const proto=oldRows[page.number===7||page.number===9?(i<headers?i:headers):i]||oldRows.at(-1);const tr=proto.cloneNode(true);tr.setAttribute('h',emu(item.heights[i]));all(tr,A,'tc').forEach((c,j)=>{fillText(c,row[j]?.text||'',row[j]?.style.size);if(page.number===7||page.number===9){const pr=all(c,A,'tcPr')[0];if(pr){pr.setAttribute('marT',0);pr.setAttribute('marB',0);}}});tbl.append(tr);});
        const ext=all(node,P,'xfrm')[0]?.getElementsByTagNameNS(A,'ext')[0];if(ext)ext.setAttribute('cy',emu(item.heights.reduce((a,b)=>a+b,0)));continue;
      }
      if(item.kind!=='image')continue;
      const data=images.get(`${page.number-1}-${item.name}`);const id=1000+(++imageNo);
      if(!data){tree.append(placeholder(doc,id,item));continue;}
      const img=new Image();img.src=data;await img.decode();let output=data;
      if(data.startsWith('data:image/webp')){const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;canvas.getContext('2d').drawImage(img,0,0);output=canvas.toDataURL('image/png');}
      const ext=output.startsWith('data:image/jpeg')?'jpg':'png',rid='cafImage'+imageNo,media=`cafeteria-${imageNo}.${ext}`;
      zip.file('ppt/media/'+media,output.split(',')[1],{base64:true});
      if(![...types.documentElement.children].some(n=>n.getAttribute('Extension')===ext))types.documentElement.append(create(types,types.documentElement.namespaceURI,'Default',{Extension:ext,ContentType:ext==='jpg'?'image/jpeg':'image/png'}));
      rels.documentElement.append(create(rels,rels.documentElement.namespaceURI,'Relationship',{Id:rid,Type:R+'/image',Target:'../media/'+media}));
      const [x,y,w,h]=item.box,ratio=Math.min(w/img.naturalWidth,h/img.naturalHeight),iw=img.naturalWidth*ratio,ih=img.naturalHeight*ratio;
      tree.append(picture(doc,id,{...item,box:[x+(w-iw)/2,y+(h-ih)/2,iw,ih]},rid));
    }
    zip.file(path,xml(doc));zip.file(relPath,xml(rels));
  }
  zip.file('[Content_Types].xml',xml(types));return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',compression:'DEFLATE'});
}
export async function downloadCafeteria(slides,images,project){
  const blob=await cafeteriaBlob(slides,images),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(project||'结构设计').replace(/[\\/:*?"<>|]/g,'_')+'_扩初汇报.pptx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
