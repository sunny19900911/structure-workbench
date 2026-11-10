// Deduplicate only complete, verbatim prose runs. PDF line wrapping may differ
// between the report body and its attachment. Conditions and punctuation stay
// part of the identity; table text is never merged into this prose operation.
export const proseIdentity=text=>String(text??'').replace(/\s/g,'');
export function uniqueGeotechProse(parts){
 const seen=new Set(),kept=[];
 let run=[];
 const flush=complete=>{
  if(!run.length)return;
  const key=proseIdentity(run.join(''));
  if(!complete||!seen.has(key)){kept.push(...run);if(complete)seen.add(key);}
  run=[];
 };
 for(const part of parts){
  run.push(part);
  if(/[。！？]\s*$/.test(part))flush(true);
 }
 flush(false);
 return kept;
}
