import {DEFAULT_INSTRUCTION,validateReplacement} from './core.js';
import './panel.css';

// UI consumes a tiny host contract; no expansion state or workbench persistence here.
export function createRewritePanel(){
  const panel=document.createElement('aside');panel.className='dsr-panel';panel.hidden=true;panel.setAttribute('aria-label','DeepSeek 段落改写');
  panel.innerHTML='<header><div><strong>DeepSeek 改写</strong><small>深入思考 · 当前段落</small></div><button data-dsr="close" aria-label="关闭改写面板">×</button></header><div class="dsr-body"><details open><summary>原段落</summary><pre data-dsr="original"></pre></details><div data-dsr="messages" class="dsr-messages" aria-live="polite"></div><label class="dsr-result" hidden>待采用正文<textarea data-dsr="result" aria-label="DeepSeek 改写稿"></textarea></label><button data-dsr="apply" hidden>替换原段落</button></div><form><label class="dsr-online"><input data-dsr="online" type="checkbox" checked>联网查依据</label><small>发送当前段落及相关项目文字到 DeepSeek</small><textarea data-dsr="instruction" aria-label="改写要求或继续追问" placeholder="例如：简洁一点，突出结构选型理由" maxlength="2000"></textarea><div class="dsr-actions"><button type="submit" data-dsr="send">发送</button><button type="button" data-dsr="stop" hidden>停止</button></div><p data-dsr="status" role="status"></p></form>';
  document.body.append(panel);
  const q=n=>panel.querySelector('[data-dsr="'+n+'"]');
  let session=null,controller=null,serial=0,history=[],pending=false;
  const status=s=>q('status').textContent=s;
  function controls(){q('send').disabled=pending;q('stop').hidden=!pending;q('apply').disabled=pending;}
  function stop(){serial++;controller?.abort();controller=null;pending=false;controls();}
  function message(role,text){const item=document.createElement('article');item.className='dsr-message '+role;const label=document.createElement('b');label.textContent=role==='user'?'你':'DeepSeek';const p=document.createElement('pre');p.textContent=text;item.append(label,p);q('messages').append(item);return item;}
  async function send(instruction){
    if(pending||!session)return;
    try{session.check();}catch(e){status(e.message);return;}
    if(history.length>=16){status('当前对话已满，请重新选段开始');return;}
    const request=++serial,active=session;controller=new AbortController();pending=true;controls();
    const entry=message('user',instruction);status(q('online').checked?'正在联网查依据并深入思考…':'正在结合项目资料深入思考…');
    try{
      const response=await fetch('/api/deepseek-rewrite',{method:'POST',headers:{'Content-Type':'application/json','X-Workbench-Request':'deepseek-rewrite'},signal:controller.signal,body:JSON.stringify({consent:true,original:active.original,currentDraft:q('result').value||undefined,context:active.context,online:q('online').checked,instruction,history})});
      let data;try{data=await response.json();}catch{throw Error('改写接口未就绪，请重启工作台服务后重试');}if(request!==serial)return;if(!response.ok)throw Error(data.error||'改写未完成');active.check();
      history.push({role:'user',content:instruction},{role:'assistant',content:JSON.stringify({text:data.text,note:data.note})});
      const item=message('assistant',data.text+(data.note?'\n\n'+data.note:''));
      if(data.sources?.length){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='联网来源（'+data.sources.length+'）';details.append(summary);for(const s of data.sources){const p=document.createElement('p'),a=document.createElement('a');a.textContent=s.title;a.href=s.url;a.target='_blank';a.rel='noopener noreferrer';p.append(a,document.createTextNode(' · '+s.kind+(s.used?' · 本稿引用':'')));details.append(p);}item.append(details);}
      q('result').value=data.text;panel.querySelector('.dsr-result').hidden=false;q('apply').hidden=false;q('instruction').value='';
      const usedSources=data.sources?.filter(s=>s.used).length||0;
      status(data.adoptionError||data.warning||(data.searchStatus==='ok'?(usedSources?'本稿采用了'+usedSources+'条联网来源，可继续追问或替换正文。':'已检索到资料，本稿未采用；可继续追问或替换正文。'):'改写完成，可继续追问或替换正文。'));
      item.scrollIntoView({block:'nearest'});
    }catch(e){if(request===serial){entry.dataset.failed='true';status(e.name==='AbortError'?'已停止，原文未改动':e.message);}}
    finally{if(request===serial){pending=false;controller=null;controls();}}
  }
  q('close').onclick=()=>{stop();panel.hidden=true;session?.focus?.();};
  q('stop').onclick=()=>{stop();status('已停止，原文未改动');};
  panel.querySelector('form').onsubmit=e=>{e.preventDefault();send(q('instruction').value.trim()||DEFAULT_INSTRUCTION);};
  q('apply').onclick=()=>{try{session.check();const text=validateReplacement(session.original,q('result').value);session.apply(text);stop();q('apply').hidden=true;status('已替换，可用正文的“恢复上一稿”撤回。');session=null;q('send').disabled=true;}catch(e){status(e.message);}};
  panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();q('close').click();}if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&e.target===q('instruction')){e.preventDefault();panel.querySelector('form').requestSubmit();}});
  return {open(target){stop();session=target;history=[];q('messages').replaceChildren();q('original').textContent=target.displayOriginal||target.original;q('result').value='';q('instruction').value='';panel.querySelector('.dsr-result').hidden=true;q('apply').hidden=true;panel.hidden=false;q('send').disabled=false;send(DEFAULT_INSTRUCTION);},destroy(){stop();panel.remove();}};
}
