import {createRewritePanel} from './panel.js';
import {paragraphAt,replaceTarget,rewriteContext} from './core.js';

export function mountExpansionRewrite({root,read,serialize,resolve,commit,notify}){
  const panel=createRewritePanel();let bookmark=null;
  function selection(){
    const s=window.getSelection();if(!s?.rangeCount)return;
    const r=s.getRangeAt(0),element=n=>n.nodeType===1?n:n.parentElement;
    const editor=element(r.startContainer)?.closest('[data-editor]');
    if(!editor||!root.contains(editor))return;
    if(!editor.contains(r.endContainer)){bookmark=null;return;}
    // Nested tables, images and dynamic measures have their own editors and persistence.
    if(element(r.startContainer)?.closest('[data-token]')||element(r.endContainer)?.closest('[data-token]')){bookmark=null;return;}
    const raw=serialize(editor,false),fullText=raw.trim(),leading=raw.length-raw.trimStart().length;
    const prefix=r.cloneRange();prefix.selectNodeContents(editor);prefix.setEnd(r.startContainer,r.startOffset);
    const wrap=document.createElement('div');wrap.append(prefix.cloneContents());let start=serialize(wrap,false).length-leading;
    const suffix=r.cloneRange();suffix.selectNodeContents(editor);suffix.setEnd(r.endContainer,r.endOffset);
    wrap.replaceChildren(suffix.cloneContents());let end=serialize(wrap,false).length-leading;
    start=Math.max(0,start);end=Math.min(fullText.length,end);
    if(r.collapsed)({start,end}=paragraphAt(fullText,start));
    bookmark={sid:editor.dataset.editor,fullText,start,end,original:fullText.slice(start,end),identity:read().identity};
  }
  document.addEventListener('selectionchange',selection);
  function click(e){const button=e.target.closest('[data-action="rewrite-chat"]');if(!button)return;
    try{
      const host=read(),sid=button.dataset.section;if(!host.editable)throw Error('当前正文为只读或正在载入');
      if(!bookmark||bookmark.sid!==sid||bookmark.identity!==host.identity)throw Error('请先选中正文，或将光标放在要改写的段落内');
      const target={...bookmark},section=host.state.sections[sid];
      if(!target.original.trim()||/\[\[(?:table|image|measures):/.test(target.original))throw Error('请选择文字段落，不包含表格或图片');
      if(target.original.length>8000)throw Error('请将选段缩小到8000字以内');
      if(target.fullText!==section?.text)throw Error('正文已更新，请重新选择段落');
      const stamp=host.stamp;
      function check(){const current=read();if(!current.editable||current.identity!==host.identity||current.stamp!==stamp||current.state.sections[sid]?.text!==target.fullText)throw Error('项目、资料或原文已变化，请重新选段改写');}
      panel.open({original:target.original,displayOriginal:resolve(target.original),context:rewriteContext(host.state,sid),check,
        focus:()=>button.focus(),apply(text){check();const next=replaceTarget(read().state.sections[sid].text,target,text);commit(sid,next,target,text);}});
    }catch(error){notify(error.message);}
  }
  root.addEventListener('click',click);
  return {destroy(){document.removeEventListener('selectionchange',selection);root.removeEventListener('click',click);panel.destroy();}};
}
