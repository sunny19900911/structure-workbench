// Source: USER-20261002-WORKFLOW. Automatic drafts never overwrite edited text.
export function reconcileSection(old, draft, rendered) {
  rendered=rendered.replace(/<img\b[^>]*>/gi,'<p>（图片沿用来源附件）</p>');
  let hash=2166136261;for(const c of JSON.stringify({text:draft.text,rendered}))hash=Math.imul(hash^c.charCodeAt(0),16777619);const signature=(hash>>>0).toString(16);
  if(old?.autoSignature===signature)return old;
  const automatic={...draft,hidden:old?.hidden||false,autoSignature:signature,autoDraft:draft,autoRendered:rendered};
  if(!old?.text||(!old.manual&&['template','scaffold'].includes(old.kind)))return {...automatic,stale:false};
  // First migration establishes a baseline. Existing manual text remains authoritative.
  const changed=old.autoSignature ? old.autoSignature!==signature : old.text!==draft.text;
  return {...old,autoSignature:signature,autoDraft:draft,autoRendered:rendered,
    ...(changed?{stale:true,pendingAuto:{draft,rendered,previous:old.autoRendered||'',signature}}:{})};
}
export function resolveAutomatic(old, useNew) {
  const pending=old.pendingAuto;if(!pending)return old;
  const next=useNew?{...pending.draft,hidden:old.hidden,autoSignature:old.autoSignature,autoDraft:old.autoDraft,autoRendered:old.autoRendered,previous:{...old,pendingAuto:undefined,previous:undefined}}:{...old};
  delete next.pendingAuto;next.stale=false;return next;
}
export function autoParameterUpdates(next,current,previous={}) {
  const updates={},conflicts=[];
  const same=(key,a,b)=>key==='site_class'?String(a||'').replace(/Ⅲ/g,'III').replace(/Ⅱ/g,'II').replace(/Ⅳ/g,'IV').replace(/Ⅰ/g,'I').replace(/\s/g,'')===String(b||'').replace(/Ⅲ/g,'III').replace(/Ⅱ/g,'II').replace(/Ⅳ/g,'IV').replace(/Ⅰ/g,'I').replace(/\s/g,''):String(a||'')===String(b||'');
  for(const key of new Set([...Object.keys(next),...Object.keys(previous)])) {
    const value=next[key]||'',before=current[key]||'';
    if(!before||before==='未命名项目'||same(key,before,previous[key])){if(!same(key,before,value))updates[key]=value;}
    else if(value&&!same(key,before,value))conflicts.push({key,current:before,proposed:value});
  }
  return {updates,conflicts};
}
