// Host-independent contracts: no workbench globals, credentials or DOM.
export const DEFAULT_INSTRUCTION='把选中的文字改得简洁一些、条理清楚，保留原意和已有项目事实，直接给出改写正文。';
export function protectedTokens(text){return String(text).match(/\{\{[^{}]+\}\}|\[\[[^\]]+\]\]/g)||[];}
export function validateReplacement(original,text){
  if(typeof text!=='string'||!text.trim()||text.length>12000)throw Error('改写稿为空或过长，请继续调整');
  const sort=a=>JSON.stringify([...a].sort());
  if(sort(protectedTokens(original))!==sort(protectedTokens(text)))throw Error('改写稿改变了联动引用，请让 DeepSeek 保留原引用后重试');
  return text.trim();
}
export function replaceTarget(current,target,text){
  if(current!==target.fullText||current.slice(target.start,target.end)!==target.original)throw Error('原段落已变化，请重新选段改写');
  return current.slice(0,target.start)+validateReplacement(target.original,text)+current.slice(target.end);
}
export function paragraphAt(text,offset){
  offset=Math.max(0,Math.min(text.length,offset));
  let start=text.lastIndexOf('\n',Math.max(0,offset-1))+1,end=text.indexOf('\n',offset);if(end<0)end=text.length;
  while(start<end&&/\s/.test(text[start]))start++;
  while(end>start&&/\s/.test(text[end-1]))end--;
  return {start,end};
}
export function firstRewriteTarget(text){
 const fullText=String(text||'');let offset=0;
 for(const line of fullText.split('\n')){
  const trimmed=line.trim();
  if(trimmed&&!/^\d+(?:\.\d+)*\s/.test(trimmed)&&!/^\[\[(?:table|image|measures):/.test(trimmed)){
   const start=offset+line.indexOf(trimmed);return {fullText,start,end:start+trimmed.length,original:trimmed};
  }
  offset+=line.length+1;
 }
 return null;
}
export function rewriteContext(state,sid){
  // Only bounded text and values: never files, images, binary data or whole source documents.
  const short=(v,n=800)=>String(v??'').slice(0,n);
  const relevant={overview:/arch|bldg|area|height|floor|use|region/,ground:/geo|soil|water|site|foundation/,foundation:/geo|soil|water|foundation/,loads:/load|wind|snow|water/,selection:/arch|struct|height|floor/}[sid]||/arch|geo|struct|site/;
  return {unit:short(state.identity?.unit),section:sid,
    parameters:Object.fromEntries(Object.entries(state.parameters||{}).filter(([,v])=>['string','number','boolean'].includes(typeof v)).slice(0,180).map(([k,v])=>[k,short(v,250)])),
    surrounding:short(state.sections?.[sid]?.text,8000),
    facts:(state.facts||[]).filter(f=>relevant.test(f.key||'')).slice(0,12).map(f=>({label:short(f.label,100),value:short(f.value),source_id:short(f.source_id,160),status:f.status})),
    model:Object.fromEntries(Object.entries(state.model?.metrics||{}).filter(([,v])=>typeof v==='number'||typeof v==='string').slice(0,60).map(([k,v])=>[k,short(v,150)])),
    regulations:(state.regulations||[]).filter(r=>r.selected).slice(0,25).map(r=>({title:short(r.title,160),code:short(r.code,80),status:r.status}))};
}
