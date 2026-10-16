import {DEFAULT_INSTRUCTION,validateReplacement} from './core.js';
import './panel.css';
import {readRewriteResponse} from './response.js';

// UI consumes a tiny host contract; no expansion state or workbench persistence here.
export function createRewritePanel(){
  const panel=document.createElement('aside');panel.className='dsr-panel';panel.hidden=true;panel.setAttribute('aria-label','DeepSeek 段落改写');
  panel.innerHTML='<header><div><strong>DeepSeek 改写</strong><small>当前段落 · 对话修改</small></div><button data-dsr="close" aria-label="关闭改写面板">×</button></header><div class="dsr-body"><details open><summary>原段落</summary><pre data-dsr="original"></pre></details><div data-dsr="messages" class="dsr-messages" aria-live="polite"></div><label class="dsr-result" hidden>待采用正文<textarea data-dsr="result" aria-label="DeepSeek 改写稿"></textarea></label><button data-dsr="apply" hidden>替换原段落</button></div><form><label class="dsr-online"><input data-dsr="online" type="checkbox">联网补查依据（需要时勾选）</label> <label class="dsr-online"><input data-dsr="thinking" type="checkbox">深度思考（较慢）</label><small>直接发送选中文字和修改要求到 DeepSeek</small><textarea data-dsr="instruction" aria-label="改写要求或继续追问" placeholder="例如：简洁一点，突出结构选型理由" maxlength="2000"></textarea><div class="dsr-actions"><button type="submit" data-dsr="send">发送</button><button type="button" data-dsr="stop" hidden>停止</button></div><p data-dsr="status" role="status"></p></form>';
  document.body.append(panel);
  const q=n=>panel.querySelector('[data-dsr="'+n+'"]');
  let session=null,controller=null,serial=0,history=[],pending=false,activeTurn=null;
  const status=s=>q('status').textContent=s;
  function controls(){q('send').disabled=pending;q('stop').hidden=!pending;q('apply').disabled=pending;q('online').disabled=pending;q('thinking').disabled=pending;}
  function failTurn(text){if(!activeTurn)return;activeTurn.entry.dataset.failed='true';const answer=activeTurn.answer||message('assistant','');answer.dataset.failed='true';answer.querySelector('b').textContent='DeepSeek · 未完成';if(!activeTurn.answer)answer.querySelector('pre').textContent=text;else answer.querySelector('pre').append(document.createTextNode('\n\n'+text));activeTurn=null;}
  function stop(){if(pending)failTurn('已停止，原文未改动');serial++;controller?.abort();controller=null;pending=false;controls();}
  function message(role,text){const item=document.createElement('article');item.className='dsr-message '+role;const label=document.createElement('b');label.textContent=role==='user'?'你':'DeepSeek';const p=document.createElement('pre');p.textContent=text;item.append(label,p);q('messages').append(item);return item;}
  async function send(instruction){
    if(pending||!session)return;
    try{session.check();}catch(e){status(e.message);return;}
    if(history.length>=16){status('当前对话已满，请重新选段开始');return;}
    const request=++serial,active=session;controller=new AbortController();pending=true;controls();
    let answerItem=null;const entry=message('user',instruction);activeTurn={entry,answer:null};let phase='正在连接改写服务…',timedOut=false;const started=Date.now(),requestController=controller;
    const tick=setInterval(()=>{if(request===serial)status(phase+' 已等待'+Math.floor((Date.now()-started)/1000)+'秒');},1000);
    const waitSeconds=q('online').checked?420:130;const deadline=setTimeout(()=>{timedOut=true;requestController.abort();},waitSeconds*1000);status(phase);
    try{
      const response=await fetch('/api/deepseek-rewrite',{method:'POST',headers:{'Content-Type':'application/json','X-Workbench-Request':'deepseek-rewrite','Accept':'application/x-ndjson'},signal:controller.signal,body:JSON.stringify({consent:true,format:'text',thinking:q('thinking').checked,original:active.original,currentDraft:q('result').value||undefined,context:active.context,online:q('online').checked,instruction,history})});
      const data=await readRewriteResponse(response,text=>{if(request===serial){phase=text;status(text);}},delta=>{if(request!==serial)return;if(!answerItem){answerItem=message('assistant','');activeTurn.answer=answerItem;phase='正在生成回复…';}answerItem.querySelector('pre').append(document.createTextNode(delta));});if(request!==serial)return;active.check();
      history.push({role:'user',content:instruction},{role:'assistant',content:JSON.stringify({text:data.text,note:data.note})});
      const item=answerItem||message('assistant','');item.querySelector('pre').textContent=data.text+(data.note?'\n\n'+data.note:'');
      if(data.sources?.length){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='联网来源（'+data.sources.length+'）';details.append(summary);for(const s of data.sources){const p=document.createElement('p'),a=document.createElement('a');a.textContent=s.title;a.href=s.url;a.target='_blank';a.rel='noopener noreferrer';p.append(a,document.createTextNode(' · '+s.kind+(s.used?' · 本稿引用':'')));details.append(p);}item.append(details);}
      q('result').value=data.text;panel.querySelector('.dsr-result').hidden=false;q('apply').hidden=false;q('instruction').value='';
      const usedSources=data.sources?.filter(s=>s.used).length||0;
      status(data.adoptionError||data.warning||(data.searchStatus==='ok'?(usedSources?'本稿采用了'+usedSources+'条联网来源，可继续追问或替换正文。':'已取得联网资料，可展开来源核对；可继续追问或替换正文。'):'改写完成，可继续追问或替换正文。'));
      activeTurn=null;status(q('status').textContent+' 用时'+Math.round((Date.now()-started)/1000)+'秒。');item.scrollIntoView({block:'nearest'});
    }catch(e){if(request===serial){const reason=timedOut?'等待超过'+waitSeconds+'秒，已停止。原文未改动，可以重新发送。':e.name==='AbortError'?'已停止，原文未改动':e.message;failTurn(reason);status(reason);}}
    finally{clearInterval(tick);clearTimeout(deadline);if(request===serial){pending=false;controller=null;controls();}}
  }
  q('close').onclick=()=>{stop();panel.hidden=true;session?.focus?.();};
  const otherPanel=e=>{if(e.detail!=='rewrite'){stop();panel.hidden=true;}};
  window.addEventListener('workbuddy:ai-panel-open',otherPanel);
  q('stop').onclick=()=>{stop();status('已停止，原文未改动');};
  panel.querySelector('form').onsubmit=e=>{e.preventDefault();send(q('instruction').value.trim()||DEFAULT_INSTRUCTION);};
  q('apply').onclick=()=>{try{session.check();const text=validateReplacement(session.original,q('result').value);session.apply(text);stop();q('apply').hidden=true;status('已替换，可用正文的“恢复上一稿”撤回。');session=null;q('send').disabled=true;}catch(e){status(e.message);}};
  panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();q('close').click();}if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&e.target===q('instruction')){e.preventDefault();panel.querySelector('form').requestSubmit();}});
  return {open(target){stop();window.dispatchEvent(new CustomEvent('workbuddy:ai-panel-open',{detail:'rewrite'}));session=target;history=[];q('online').checked=false;q('thinking').checked=false;q('messages').replaceChildren();q('original').textContent=target.displayOriginal||target.original;q('result').value='';q('instruction').value='';panel.querySelector('.dsr-result').hidden=true;q('apply').hidden=true;panel.hidden=false;q('send').disabled=false;status('输入修改要求后发送；默认不联网、不深度思考，直接改写。');q('instruction').focus();},destroy(){stop();window.removeEventListener('workbuddy:ai-panel-open',otherPanel);panel.remove();}};
}
