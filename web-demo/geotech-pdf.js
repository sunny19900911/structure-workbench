// PDF.js is supplied by the existing local/browser loader. No OCR or network
// service is invoked here. Coordinates and page locations stay with the source.
const clean=s=>String(s??'').replace(/\s+/g,' ').trim();
export function pdfLines(items){
 const lines=[];
 for(const item of items.filter(i=>clean(i.str)&&i.transform).sort((a,b)=>b.transform[5]-a.transform[5]||a.transform[4]-b.transform[4])){
  const x=item.transform[4],y=item.transform[5],height=Math.abs(item.height||item.transform[3]||10);
  let line=lines.find(l=>Math.abs(l.y-y)<=Math.max(1.5,Math.min(l.height,height)*0.22));
  if(!line){line={y,height,items:[]};lines.push(line);}
  line.items.push({...item,x});
 }
 return lines.sort((a,b)=>b.y-a.y).map(line=>{
  const cells=[];let end=null;
  for(const it of line.items.sort((a,b)=>a.x-b.x)){
   const gap=end===null?0:it.x-end;
   if(end===null||gap>Math.max(8,line.height*1.2))cells.push(clean(it.str));
   else cells[cells.length-1]+=(gap>line.height*.25?' ':'')+it.str;
   end=Math.max(end??0,it.x+(it.width||0));
  }
  return {y:line.y,cells:cells.map(clean),text:cells.map(clean).join(' | ')};
 });
}

export function geotechPdfBlocks(pages){
 const out={paras:[],paragraphMeta:[],tables:[],tableMeta:[],ordered:[],images:[],warnings:[]};
 const empty=[];let restored=0;
 for(const page of pages){
  const lines=pdfLines(page.items);
  if(!lines.length){empty.push(page.page);continue;}
  for(let i=0;i<lines.length;i++){
   const line=lines[i];
   if(/^(?:第\s*)?\d+\s*(?:页)?$/.test(line.text)&&(i===0||i===lines.length-1))continue;
   const heads=line.cells;
   const header=heads.length>=3&&heads.some(c=>/层号|层序|土层名称/.test(c))&&heads.filter(c=>/层|名称|模量|重度|承载力|阻力|深度/.test(c)).length>=2;
   if(header){
    let end=i+1;
    while(end<lines.length&&lines[end].cells.length===heads.length&&lines[end].cells.some(c=>/\d|[①-⑳]/.test(c)))end++;
    // Reject multi-line/unequal-width layouts instead of sliding values into
    // plausible-looking columns. Their original lines remain available below.
    if(end>i+1&&lines.slice(i+1,end).every(l=>l.cells.some(c=>/^[①-⑳\d]/.test(c)))){
     const rows=lines.slice(i,end).map(l=>l.cells),index=out.tables.length;
     out.tables.push(rows);out.tableMeta.push({page:page.page,layout:'coordinate-columns'});out.ordered.push({type:'table',index});restored++;i=end-1;continue;
    }
   }
   const index=out.paras.length;out.paras.push(line.text);out.paragraphMeta.push({page:page.page,y:line.y});out.ordered.push({type:'p',index,text:line.text});
  }
 }
 if(empty.length)out.warnings.push('第 '+empty.join('、')+' 页没有可提取文本，可能为扫描、图纸或空白页；未执行OCR。');
 out.pdfReadReport={pageCount:pages.length,pagesWithoutText:empty,textPages:pages.length-empty.length,restoredTables:restored,ocrApplied:false,warnings:out.warnings};
 return out;
}

export async function readGeotechPdf(lib,file,options={}){
 const doc=await lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),useSystemFonts:true,isEvalSupported:false,...options}).promise;
 try{
  const pages=[];
  for(let page=1;page<=doc.numPages;page++)pages.push({page,items:(await (await doc.getPage(page)).getTextContent()).items});
  return geotechPdfBlocks(pages);
 }finally{await doc.destroy();}
}
