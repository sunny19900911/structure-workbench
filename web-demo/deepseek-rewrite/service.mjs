import {bounded} from './timeout.js';
import {DEFAULT_INSTRUCTION,validateReplacement} from './core.js';
import {searchRewrite} from './search.mjs';
import {WRITING_SYSTEM,chatMessages,writingRequest} from './writing.js';
import {readAnswerStream} from './stream.mjs';

export function createRewriteService(env={},deps={}){
  const fetchImpl=deps.fetch||fetch;
  async function request(url,body,headers,signal){
    const target=new URL(url);
    if(target.username||target.password||target.search)throw Error('接口地址不能包含凭据');
    return bounded(async requestSignal=>{
      const r=await fetchImpl(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),signal:requestSignal});
      if(!r.ok)throw Error('DeepSeek 服务返回 HTTP '+r.status+'，原文未改动');
      return await r.json();
    },{signal,timeoutMs:deps.requestTimeoutMs??120000,message:'DeepSeek 响应超时，原文未改动，请重试'});

  }
  return async function rewrite(body,signal,onProgress=()=>{},onDelta=()=>{}){
    if(body.consent!==true)throw Error('请从正文主动启动改写');
    if(!env.DEEPSEEK_API_KEY)throw Error('DeepSeek 尚未配置，原文未改动');
    if(typeof body.original!=='string'||!body.original.trim()||body.original.length>8000)throw Error('请选择8000字以内的正文段落');
    if(typeof body.instruction!=='string'||body.instruction.length>2000)throw Error('改写要求请控制在2000字以内');
    if(!body.context||typeof body.context!=='object'||JSON.stringify(body.context).length>40000)throw Error('上下文过长，请缩小选段范围');
    const history=Array.isArray(body.history)?body.history:[];
    if(history.length>16||history.some(m=>!['user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>14000))throw Error('对话过长，请重新选段开始');
    if(body.currentDraft!==undefined&&(typeof body.currentDraft!=='string'||body.currentDraft.length>12000))throw Error('当前改写稿格式无效或过长');
    const currentDraft=body.currentDraft?.trim();
    // Older clients may only send conversation history. Keep original immutable.
    let previousDraft='';
    if(!currentDraft){try{const last=history.findLast(m=>m.role==='assistant');previousDraft=last?JSON.parse(last.content).text:'';}catch{}}
    const workingText=currentDraft||(typeof previousDraft==='string'&&previousDraft.length<=12000?previousDraft:'')||body.original;
    let sources=[],searchStatus='off',warning='';
    if(body.online===true){
      onProgress('正在等待联网搜索返回（最多120秒）…');
      const searchRequest=(url,body,headers,searchSignal)=>bounded(requestSignal=>request(url,body,headers,requestSignal),{signal:searchSignal,timeoutMs:deps.searchTimeoutMs??120000,message:'搜索接口在120秒内未返回结果'});
      try{sources=await bounded(searchSignal=>(deps.search||searchRewrite)(body,env,{request:searchRequest,signal:searchSignal,readPage:deps.readPage,onProgress}),{signal,timeoutMs:deps.searchTimeoutMs??290000,message:'联网检索超时（搜索与网页读取未完成）'});searchStatus=sources.length?'ok':'empty';if(!sources.length)warning='联网未取得可用原文或摘要，本次仅按项目资料改写。';}
      catch(e){searchStatus='failed';const reason=/120秒|联网检索超时/.test(e.message)?e.message:/HTTP \d{3}/.exec(e.message)?.[0]||(/实际联网|官方网页候选/.test(e.message)?'搜索接口未返回可用的官方来源':/自定义AI网关/.test(e.message)?'当前网关尚未配置联网搜索接口':'搜索连接失败');warning=reason+'；本次仅按项目资料改写。';}
    }
    if(signal?.aborted)throw Error('已停止改写');
    const plain=body.format==='text',thinking=plain?body.thinking===true:true;
    onProgress((warning?warning+' ':'')+(thinking?'DeepSeek 正在深入思考，随后显示正文…':'正在直接改写，收到文字即显示…'));
    const base=(env.DEEPSEEK_BASE_URL||'https://api.deepseek.com').replace(/\/$/,'');
    if(plain){
      const target=new URL(base);if(target.username||target.password||target.search)throw Error('接口地址不能包含凭据');
      const turns=history.map(m=>{if(m.role!=='assistant')return m;try{const value=JSON.parse(m.content);return {...m,content:typeof value.text==='string'?value.text:m.content};}catch{return m;}});
      const answer=await bounded(async requestSignal=>{
        const model=env.DEEPSEEK_REWRITE_MODEL||env.DEEPSEEK_MODEL||'deepseek-v4-pro';
        const r=await fetchImpl(base+'/chat/completions',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.DEEPSEEK_API_KEY},signal:requestSignal,body:JSON.stringify({model,thinking:{type:thinking?'enabled':'disabled'},stream:true,max_tokens:10000,messages:chatMessages({original:body.original,workingText,instruction:body.instruction||DEFAULT_INSTRUCTION,context:body.context,sources,history:turns,thinking})})});
        if(!r.ok)throw Error('DeepSeek 服务返回 HTTP '+r.status+'，原文未改动');
        onProgress('已提交 DeepSeek，等待'+(thinking?'思考后的正文':'改写正文')+'…');
        return readAnswerStream(r,onDelta);
      },{signal,timeoutMs:deps.requestTimeoutMs??120000,message:'DeepSeek 响应超时，原文未改动，请重试'});
      let adoptionError='';try{validateReplacement(body.original,answer.text);}catch(e){adoptionError=e.message;}
      return {...answer,note:'',sources:sources.map(({text,...s})=>({...s,used:null})),searchStatus,warning,adoptionError,thinking};
    }
    const result=await request(base+'/chat/completions',{model:env.DEEPSEEK_REWRITE_MODEL||env.DEEPSEEK_MODEL||'deepseek-v4-pro',thinking:{type:'enabled'},response_format:{type:'json_object'},max_tokens:10000,stream:false,
      messages:[{role:'system',content:WRITING_SYSTEM},{role:'user',content:JSON.stringify({original:body.original,context:body.context,sources})},...history,{role:'user',content:JSON.stringify(writingRequest(body.instruction||DEFAULT_INSTRUCTION,workingText))}]},{Authorization:'Bearer '+env.DEEPSEEK_API_KEY},signal);
    if(result.choices?.[0]?.finish_reason!=='stop')throw Error('改写结果未完整返回，原文未改动，请重试');
    let draft;try{draft=JSON.parse(result.choices[0].message.content);}catch{throw Error('改写结果格式不完整，请重试');}
    if(typeof draft.text!=='string'||!draft.text.trim()||draft.text.length>12000)throw Error('未收到有效改写正文');
    let adoptionError='';try{validateReplacement(body.original,draft.text);}catch(e){adoptionError=e.message;}
    const used=Array.isArray(draft.source_ids)?draft.source_ids:[];
    if(used.some(id=>!sources.some(s=>s.id===id)))throw Error('改写稿引用了检索结果之外的来源，请重试');
    return {text:draft.text,note:String(draft.note||'').slice(0,1600),sources:sources.map(({text,...s})=>({...s,used:used.includes(s.id)})),searchStatus,warning,adoptionError,model:result.model||'',thinking:true};
  };
}

export function rewriteApi(env={},deps={}){
  const run=createRewriteService(env,deps);let active=0;
  const register=server=>{server.middlewares.use('/api/deepseek-rewrite',async(req,res)=>{
    const send=(status,data)=>{if(!res.destroyed){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}};
    const streaming=req.headers.accept==='application/x-ndjson';
    const event=data=>{if(!res.destroyed)res.write(JSON.stringify(data)+'\n');};
    let acquired=false,heartbeat;const controller=new AbortController(),cancel=()=>{if(!res.writableEnded)controller.abort();};res.on?.('close',cancel);
    try{
      if(req.method!=='POST'||req.headers['x-workbench-request']!=='deepseek-rewrite'||req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return send(403,{error:'只允许工作台主动发起改写'});
      let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>180000)return send(413,{error:'改写内容过长'});chunks.push(c);}
      if(active>=2)return send(429,{error:'已有改写正在进行，请稍后重试'});
      const input=JSON.parse(Buffer.concat(chunks).toString());active++;acquired=true;
      if(streaming){res.writeHead(200,{'Content-Type':'application/x-ndjson','Cache-Control':'no-store','X-Accel-Buffering':'no'});res.flushHeaders?.();event({type:'progress',message:'已收到请求，开始处理…'});heartbeat=setInterval(()=>event({type:'heartbeat'}),deps.heartbeatMs??15000);heartbeat.unref?.();const result=await run(input,controller.signal,message=>event({type:'progress',message}),text=>event({type:'delta',text}));event({type:'result',data:result});res.end();}else send(200,await run(input,controller.signal));
    }catch(e){const error=e instanceof SyntaxError?'请求格式不完整':e.message;if(streaming&&res.headersSent){event({type:'error',error});res.end();}else send(400,{error});}
    finally{clearInterval(heartbeat);if(acquired)active--;res.off?.('close',cancel);}
  });};
  return {name:'deepseek-rewrite',configureServer:register,configurePreviewServer:register};
}
