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
  const pic=create(doc,P,'p:pic'),nv=create(doc,P,'p:nvPicPr');nv.append(create(doc,P,'p:cNvPr',{id,name:s.name,descr:'workbench:image-slot'}),create(doc,P,'p:cNvPicPr'),create(doc,P,'p:nvPr'));pic.append(nv);
  const fill=create(doc,P,'p:blipFill'),blip=create(doc,A,'a:blip');blip.setAttributeNS(R,'r:embed',rid);const stretch=create(doc,A,'a:stretch');stretch.append(create(doc,A,'a:fillRect'));fill.append(blip,stretch);pic.append(fill);
  const pr=create(doc,P,'p:spPr'),geom=create(doc,A,'a:prstGeom',{prst:'rect'});geom.append(create(doc,A,'a:avLst'));pr.append(transform(doc,s.box),geom);pic.append(pr);return pic;
}
function placeholder(doc,id,s){
  const sp=create(doc,P,'p:sp'),nv=create(doc,P,'p:nvSpPr');nv.append(create(doc,P,'p:cNvPr',{id,name:s.name,descr:'workbench:image-slot'}),create(doc,P,'p:cNvSpPr'),create(doc,P,'p:nvPr'));sp.append(nv);
  const pr=create(doc,P,'p:spPr'),geom=create(doc,A,'a:prstGeom',{prst:'rect'});geom.append(create(doc,A,'a:avLst'));const line=create(doc,A,'a:ln',{w:6350}),fill=create(doc,A,'a:solidFill');fill.append(create(doc,A,'a:srgbClr',{val:'D5D5D5'}));line.append(fill);pr.append(transform(doc,s.box),geom,create(doc,A,'a:noFill'),line);sp.append(pr);
  const body=create(doc,P,'p:txBody'),p=create(doc,A,'a:p'),r=create(doc,A,'a:r'),rp=create(doc,A,'a:rPr',{sz:1400}),t=create(doc,A,'a:t');t.textContent=s.name;rp.append(create(doc,A,'a:latin',{typeface:'宋体'}),create(doc,A,'a:ea',{typeface:'宋体'}));r.append(rp,t);p.append(create(doc,A,'a:pPr',{algn:'ctr'}),r);body.append(create(doc,A,'a:bodyPr',{anchor:'ctr'}),create(doc,A,'a:lstStyle'),p);sp.append(body);return sp;
}
export async function cafeteriaBlob(slides,images=new Map()){
  const response=await fetch(new URL('../../ppt-template/cafeteria-base.pptx',import.meta.url));if(!response.ok)throw Error('食堂模板读取失败');
  const zip=await window.JSZip.loadAsync(await response.arrayBuffer());
  const types=parse(await zip.file('[Content_Types].xml').async('string'));let imageNo=0;
  // Read all source parts before writing any destination (slide 19 is also a destination).
  const sources=new Map();
  for(const number of new Set(slides.map(page=>page.sourceSlideNumber||page.number))){
    sources.set(number,{slide:await zip.file(`ppt/slides/slide${number}.xml`).async('string'),rels:await zip.file(`ppt/slides/_rels/slide${number}.xml.rels`).async('string')});
  }
  for(const page of slides){
    const source=sources.get(page.sourceSlideNumber||page.number);
    const path=`ppt/slides/slide${page.number}.xml`,doc=parse(source.slide),tree=all(doc,P,'spTree')[0];
    const relPath=`ppt/slides/_rels/slide${page.number}.xml.rels`,rels=parse(source.rels);
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
      if(node)node.remove();
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
  const presentation=parse(await zip.file('ppt/presentation.xml').async('string'));
  const presentationRels=parse(await zip.file('ppt/_rels/presentation.xml.rels').async('string'));
  const list=all(presentation,P,'sldIdLst')[0],oldIds=[...list.children].map(node=>node.getAttribute('id'));
  list.replaceChildren();
  for(const node of [...presentationRels.documentElement.children])if(node.getAttribute('Type')===R+'/slide')node.remove();
  for(const node of [...types.documentElement.children])if(node.getAttribute('ContentType')==='application/vnd.openxmlformats-officedocument.presentationml.slide+xml')node.remove();
  for(const [index,page] of slides.entries()){
    const rid='rIdWorkbenchSlide'+page.number,node=create(presentation,P,'p:sldId',{id:oldIds[index]||String(Math.max(255,...oldIds.map(Number))+index+1)});
    node.setAttributeNS(R,'r:id',rid);list.append(node);
    presentationRels.documentElement.append(create(presentationRels,presentationRels.documentElement.namespaceURI,'Relationship',{Id:rid,Type:R+'/slide',Target:`slides/slide${page.number}.xml`}));
    types.documentElement.append(create(types,types.documentElement.namespaceURI,'Override',{PartName:`/ppt/slides/slide${page.number}.xml`,ContentType:'application/vnd.openxmlformats-officedocument.presentationml.slide+xml'}));
  }
  zip.file('ppt/presentation.xml',xml(presentation));zip.file('ppt/_rels/presentation.xml.rels',xml(presentationRels));
  const app=parse(await zip.file('docProps/app.xml').async('string')),ep=app.documentElement.namespaceURI,vt='http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes';
  const slideCount=all(app,ep,'Slides')[0];if(slideCount)slideCount.textContent=String(slides.length);
  const headings=all(all(app,ep,'HeadingPairs')[0],vt,'i4'),oldCount=Number(headings.at(-1)?.textContent||oldIds.length);
  if(headings.length)headings.at(-1).textContent=String(slides.length);
  const titles=all(all(app,ep,'TitlesOfParts')[0],vt,'vector')[0];
  if(titles){const retained=[...titles.children].slice(0,Math.max(0,titles.children.length-oldCount));titles.replaceChildren(...retained);for(const page of slides){const title=create(app,vt,'vt:lpstr');title.textContent=page.title;titles.append(title);}titles.setAttribute('size',titles.children.length);}
  zip.file('docProps/app.xml',xml(app));
  const leftovers=[...images].filter(([key])=>key.startsWith('__unplaced__'));
  if(leftovers.length){
    const library=parse('<images/>'),relsNS='http://schemas.openxmlformats.org/package/2006/relationships',links=parse(`<Relationships xmlns="${relsNS}"/>`),rootLinks=parse(await zip.file('_rels/.rels').async('string'));
    const path='customXml/workbench-ppt-images.xml';
    rootLinks.documentElement.append(create(rootLinks,relsNS,'Relationship',{Id:'rIdWorkbenchImages',Type:R+'/customXml',Target:path}));
    types.documentElement.append(create(types,types.documentElement.namespaceURI,'Override',{PartName:'/'+path,ContentType:'application/xml'}));
    for(const [key,data] of leftovers){
      const id=key.slice(12,44),name=key.slice(46),mime=data.startsWith('data:image/jpeg')?'jpeg':'png',part=`ppt/media/workbench-${id}.${mime==='jpeg'?'jpg':'png'}`;
      const img=new Image();img.src=data;await img.decode();zip.file(part,data.split(',')[1],{base64:true});
      library.documentElement.append(create(library,null,'image',{id,name,part,width:img.naturalWidth,height:img.naturalHeight,status:'unplaced',reason:'未匹配唯一空图位'}));
      links.documentElement.append(create(links,relsNS,'Relationship',{Id:'rId'+id,Type:R+'/image',Target:'../'+part}));
      types.documentElement.append(create(types,types.documentElement.namespaceURI,'Override',{PartName:'/'+part,ContentType:'image/'+mime}));
    }
    zip.file(path,xml(library));zip.file('customXml/_rels/workbench-ppt-images.xml.rels',xml(links));zip.file('_rels/.rels',xml(rootLinks));
  }
  zip.file('[Content_Types].xml',xml(types));return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',compression:'DEFLATE'});
}
let currentDownload=null;
function releaseDownload(){if(!currentDownload)return;currentDownload.link.remove();currentDownload.urlAPI.revokeObjectURL(currentDownload.url);currentDownload=null;}
globalThis.window?.addEventListener('pagehide',releaseDownload);
function downloadOwner(){
  // A same-origin host owns the download so embedded WebViews can handle it
  // as a top-level download. Accessing a cross-origin parent safely falls back.
  try{if(window.parent&&window.parent!==window&&window.parent.document?.body)return {doc:window.parent.document,urlAPI:window.parent.URL,embedded:true};}catch{}
  return {doc:document,urlAPI:URL,embedded:false};
}
export function offerCafeteriaDownload(blob,project){
  releaseDownload();
  const {doc,urlAPI,embedded}=downloadOwner(),url=urlAPI.createObjectURL(blob),link=doc.createElement('a');
  link.href=url;link.download=(project||'结构设计').replace(/[\\/:*?"<>|]/g,'_')+'_扩初汇报.pptx';
  link.id='cafeteria-download-ready';link.className='cafeteria-download-ready';link.textContent='保存已生成的 PPT';
  link.setAttribute('aria-label','保存已生成的 PPT：'+link.download);
  if(embedded){
    link.style.cssText='display:inline-block;margin:8px 0 12px;padding:9px 14px;background:#edf7f1;color:#245b40;border:1px solid #b8d8c6;border-radius:7px;font:600 14px sans-serif;text-decoration:underline;text-underline-offset:3px';
    const host=doc.querySelector('#im-ppt-host');if(host)host.before(link);else doc.body.prepend(link);
  }else{
    const generate=doc.querySelector('#generate-btn');if(generate)generate.after(link);else doc.body.append(link);
  }
  // Keep one generated file available for an explicit user click. Embedded
  // browsers may block downloads after asynchronous work loses user activation.
  currentDownload={url,link,urlAPI};link.click();
  return {filename:link.download};
}
export async function downloadCafeteria(slides,images,project){
  return offerCafeteriaDownload(await cafeteriaBlob(slides,images),project);
}
