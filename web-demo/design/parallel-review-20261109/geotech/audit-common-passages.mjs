// Compare only text independently present in both supplied source versions.
// Shared text is not proof that the reports are the same revision.
import {detailedGeotech} from '../../../geotech-document.js';
const normalize=t=>String(t??'').replace(/\s/g,'');
export function sourcePassages(source){
 const blocks=source.blocks||{},paras=blocks.paras||[];
 const sequence=blocks.ordered?.length?blocks.ordered:paras.map((_,index)=>({type:'p',index}));
 const groups=[];let group=[];
 const flush=()=>{if(group.length)groups.push(group);group=[];};
 for(const block of sequence){
  if(block.type!=='p'){flush();continue;}
  const meta=blocks.paragraphMeta?.[block.index];
  if(meta?.sourceBoundary){flush();continue;}
  if(group.length&&block.index!==group.at(-1).paragraph)flush();
  const text=normalize(paras[block.index]);if(text)group.push({paragraph:block.index+1,text});
 }
 flush();return groups;
}
export function locatePassage(source,text){
 const wanted=normalize(text);if(!wanted)return null;
 for(const group of sourcePassages(source)){
  const joined=group.map(p=>p.text).join(''),at=joined.indexOf(wanted);if(at<0)continue;
  let offset=0;const paragraphs=[];
  for(const p of group){const end=offset+p.text.length;if(end>at&&offset<at+wanted.length)paragraphs.push(p.paragraph);offset=end;}
  return {source_id:source.source_id,paragraphs};
 }
 return null;
}
export function auditCommonPassages(primary,secondary){
 const output=source=>{const d=detailedGeotech(source);return normalize([d.text,d.foundationText,d.antifloatText].join('\n'));};
 const a=output(primary),b=output(secondary),checks=[];
 for(const [i,p] of (primary.blocks?.paras||[]).entries()){
  for(let text of p.split(/[。；]/)){
   text=text.replace(/^\s*\d+[.．、]\s*/,'').trim();
   if(text.length<20||!a.includes(normalize(text)))continue;
   const location=locatePassage(secondary,text);if(!location)continue;
   checks.push({text,primaryParagraph:i+1,secondaryLocation:location,retained:b.includes(normalize(text))});
  }
 }
 return {primarySource:primary.source_id,secondarySource:secondary.source_id,
  scope:'common literal clauses selected by primary output; no version equivalence or full coverage claim',checks,automaticAdoption:false};
}
