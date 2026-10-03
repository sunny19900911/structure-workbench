import {DEFAULT_INSTRUCTION,validateReplacement} from './core.js';
import {searchRewrite} from './search.mjs';
import {WRITING_SYSTEM,writingRequest} from './writing.js';

export function createRewriteService(env={},deps={}){
  const fetchImpl=deps.fetch||fetch;
  async function request(url,body,headers,signal){
    const target=new URL(url);
    if(target.username||target.password||target.search)throw Error('接口地址不能包含凭据');
    let r;try{r=await fetchImpl(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(120000)]):AbortSignal.timeout(120000)});}
    catch{throw Error('DeepSeek 连接中断或超时，原文未改动');}
    if(!r.ok)throw Error('DeepSeek 服务返回 HTTP '+r.status+'，原文未改动');
    return r.json();
  }
  return async function rewrite(body,signal){
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
      try{sources=await (deps.search||searchRewrite)(body,env,{request,signal,readPage:deps.readPage});searchStatus=sources.length?'ok':'empty';if(!sources.length)warning='联网未取得可用原文，本次仅按项目资料改写。';}
      catch{searchStatus='failed';warning='联网检索未成功，本次仅按项目资料改写。';}
    }
    if(signal?.aborted)throw Error('已停止改写');
    const base=(env.DEEPSEEK_BASE_URL||'https://api.deepseek.com').replace(/\/$/,'');
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
    let acquired=false;const controller=new AbortController(),cancel=()=>{if(!res.writableEnded)controller.abort();};res.on?.('close',cancel);
    try{
      if(req.method!=='POST'||req.headers['x-workbench-request']!=='deepseek-rewrite'||req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return send(403,{error:'只允许工作台主动发起改写'});
      let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>180000)return send(413,{error:'改写内容过长'});chunks.push(c);}
      if(active>=2)return send(429,{error:'已有改写正在进行，请稍后重试'});
      const input=JSON.parse(Buffer.concat(chunks).toString());active++;acquired=true;
      send(200,await run(input,controller.signal));
    }catch(e){send(400,{error:e instanceof SyntaxError?'请求格式不完整':e.message});}
    finally{if(acquired)active--;res.off?.('close',cancel);}
  });};
  return {name:'deepseek-rewrite',configureServer:register,configurePreviewServer:register};
}
