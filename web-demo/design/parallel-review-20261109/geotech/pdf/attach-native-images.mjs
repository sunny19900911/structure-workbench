// Attach explicitly reviewed PDF crops; never infer a diagram from its filename.
import {createHash} from 'node:crypto';
export function attachNativeImages(blocks,report,supplement){
 if(supplement?.schemaVersion!==1||supplement.sourcePDFSha256!==report.sha256)throw Error('Image supplement belongs to another PDF');
 if(!Array.isArray(supplement.images))throw Error('Image inventory required');
 const staged=[],ids=new Set((blocks.images||[]).map(i=>i.id));
 for(const item of supplement.images){
  const page=report.pages.find(p=>p.page===item.page);
  if(!page||page.orientation||item.visuallyReviewed!==true||item.coordinateSpace!=='pdf-page-top-left-points')throw Error('Reviewed unrotated source geometry required');
  const b=item.bbox;
  if(!Array.isArray(b)||b.length!==4||!b.every(Number.isFinite)||b[0]<0||b[1]<0||b[2]>page.width||b[3]>page.height||b[0]>=b[2]||b[1]>=b[3])throw Error('Invalid source image bounds');
  if(typeof item.id!=='string'||!item.id||ids.has(item.id))throw Error('Duplicate or missing image id');
  if(typeof item.caption!=='string'||!item.caption.trim())throw Error('Source caption required');
  let afterParagraph,extra={};
  if(item.captionMethod==='reviewed-image-ocr'){
   const e=item.captionEvidence,a=item.anchor,c=e?.bbox;
   if(e?.sourcePDFSha256!==report.sha256||e?.imageSha256!==item.imageSha256||e?.text!==item.caption||e?.visuallyReviewed!==true||e?.page!==item.page||!Array.isArray(c)||c.length!==4||!c.every(Number.isFinite)||c[0]<b[0]||c[1]<b[1]||c[2]>b[2]||c[3]>b[3]||c[0]>=c[2]||c[1]>=c[3])throw Error('Reviewed embedded caption evidence required');
   const hits=blocks.paras.flatMap((text,index)=>text===a?.quote&&blocks.paragraphMeta[index]?.page===item.page&&JSON.stringify(blocks.paragraphMeta[index]?.bbox)===JSON.stringify(a?.bbox)?[index]:[]);
   if(hits.length!==1||a.bbox[3]>b[1]||(a.bbox[0]+a.bbox[2])/2<b[0]||(a.bbox[0]+a.bbox[2])/2>b[2])throw Error('Unique same-column preceding paragraph required');
   afterParagraph=hits[0]+1;extra={captionMethod:item.captionMethod,captionEvidence:structuredClone(e),anchorQuote:a.quote};
  }else{
   if(item.captionMethod!==undefined)throw Error('Unknown caption method');
   const matches=blocks.paras.flatMap((text,index)=>text===item.caption&&blocks.paragraphMeta[index]?.page===item.page?[index]:[]);
   if(matches.length!==1||matches[0]<1)throw Error('Unique anchored source caption required');
   afterParagraph=matches[0];
  }
  if(typeof item.data!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(item.data))throw Error('PNG image data required');
  const bytes=Buffer.from(item.data.split(',')[1],'base64');
  if(bytes.length<33||bytes.length>16*1024*1024||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.subarray(12,16).toString()!=='IHDR')throw Error('Invalid PNG payload');
  if(createHash('sha256').update(bytes).digest('hex')!==item.imageSha256)throw Error('Image bytes hash mismatch');
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
  if(!width||!height||width>20000||height>20000)throw Error('Invalid PNG dimensions');
  staged.push({id:item.id,caption:item.caption,data:item.data,width,height,afterParagraph,...extra,
   sourcePage:item.page,sourceBBox:[...b],coordinateSpace:item.coordinateSpace,
   sourcePDFSha256:report.sha256,imageSha256:item.imageSha256,representation:'reviewed-pdf-page-crop'});
  ids.add(item.id);
 }
 // Validate the whole batch before mutating; OCR review state remains untouched.
 blocks.images.push(...staged);
 return staged.length;
}
