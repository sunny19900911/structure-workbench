import {numberedGeotechSections} from './geotech-numbered-sections.js';

const norm=value=>String(value??'').replace(/\s/g,'');

// Add only already-selected images. Resolve their original paragraph anchor;
// never assign a section from a filename or infer the content of a diagram.
export function geotechImageBlocks(source,document){
 if(source.source_id!==document.source_id||source.hash!==document.hash)throw Error('图片与章节来源版本不一致');
 const result=structuredClone(document),numbered=numberedGeotechSections(source,document.unit);
 const positions=new Map((source.blocks.ordered||[]).filter(b=>b.type==='p').map(b=>[b.index,(source.blocks.ordered||[]).indexOf(b)]));
 const pending=[],placed=[];
 for(const image of result.images||[]){
  if(image.source_id!==source.source_id)throw Error('图片来源不是当前报告');
  const anchor=image.afterParagraph;
  const reason=message=>pending.push({id:image.id,reason:message});
  if(!Number.isInteger(anchor)||anchor<1||anchor>source.blocks.paras.length){reason('图片缺少有效原段落位置');continue;}
  const captionIndices=source.blocks.paras.slice(anchor,anchor+4).flatMap((text,i)=>norm(text)===norm(image.caption)?[anchor+i]:[]);
  const embedded=image.captionMethod==='reviewed-image-ocr';
  if(embedded&&(image.sourcePDFSha256!==source.hash||image.captionEvidence?.imageSha256!==image.imageSha256||image.captionEvidence?.visuallyReviewed!==true||image.captionEvidence?.text!==image.caption||source.blocks.paras[anchor-1]!==image.anchorQuote)){reason('图片内图题证据或原文锚点不一致');continue;}
  if(!image.caption||(!embedded&&captionIndices.length!==1)){reason('图题无法在邻近原文中唯一定位');continue;}
  const captionIndex=embedded?null:captionIndices[0],bucket=numbered?.paragraphBuckets?.[embedded?anchor-1:captionIndex];
  const section=result.sections.find(s=>s.buckets?.includes(bucket));
  if(!section||!positions.has(anchor-1)){reason('原图所属章节或段落顺序未保留');continue;}
  if(section.blocks.some(b=>b.kind==='paragraph'&&b.sourceParagraphs?.some(p=>p<=anchor)&&b.sourceParagraphs.some(p=>p>anchor))){reason('原图位于已拼接段落内部，不能推测拆段');continue;}
  const captionInParagraph=!embedded&&section.blocks.some(b=>b.kind==='paragraph'&&norm(b.text)===norm(image.caption)&&b.sourceParagraphs?.includes(captionIndex+1));
  section.blocks.push({kind:'geotech-source-image',...image,sourceOrder:positions.get(anchor-1)+0.5,
   sourceCaptionParagraph:embedded?null:captionIndex+1,captionInParagraph});
  placed.push(image.id);
 }
 for(const section of result.sections){
  if(section.blocks.every(b=>Number.isFinite(b.sourceOrder)))section.blocks.sort((a,b)=>a.sourceOrder-b.sourceOrder);
 }
 result.imagePlacement={placed,pending};
 return result;
}
