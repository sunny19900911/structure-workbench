import {randomBytes,randomUUID} from 'node:crypto';
import {BROWSER_OPERATIONS,browserOperation} from '../mcp-browser-operations.js';
export {BROWSER_OPERATIONS};
const error=(message,code,status=400)=>Object.assign(Error(message),{code,status});
const validId=id=>/^[a-f0-9]{32}$/.test(id||'');
const MAX_BYTES=80*1024*1024;

// This queue is process-local. A browser must claim an unexpired task before it
// can run. Disconnect/timeout never leaves a queued mutation for the next tab.
export function createBrowserBridge({now=Date.now,clientTTL=12000}={}){
 const clients=new Map(),tasks=new Map();
 const status=()=>({clients:[...clients.values()].filter(c=>now()-c.seen<clientTTL).map(({id,projectId,unit,busy,revision})=>({id,projectId,unit,busy,revision})),operations:BROWSER_OPERATIONS});
 const register=metadata=>{const id=randomUUID(),token=randomBytes(24).toString('hex');clients.set(id,{id,token,seen:now(),projectId:metadata.projectId,unit:metadata.unit,revision:metadata.revision,busy:false});return {id,token};};
 const authenticate=body=>{const c=clients.get(body.clientId);if(!c||c.token!==body.token)throw error('工作台页面连接已失效，请重新载入页面','CLIENT_EXPIRED',401);c.seen=now();return c;};
 const settle=(task,err,result)=>{if(!tasks.has(task.id))return;tasks.delete(task.id);clearTimeout(task.timer);if(err)task.reject(err);else task.resolve(result);};
 const poll=body=>{const c=authenticate(body);Object.assign(c,{projectId:body.projectId,unit:body.unit,revision:body.revision,busy:!!body.busy});const task=[...tasks.values()].find(t=>t.clientId===c.id&&t.phase==='queued'&&now()<t.deadline);if(!task||c.busy)return {task:null};task.phase='claimed';return {task:{id:task.id,...task.request,deadline:task.deadline}};};
 const start=body=>{const c=authenticate(body),task=tasks.get(body.taskId);if(!task||task.clientId!==c.id||task.phase!=='claimed'||now()>=task.deadline)throw error('任务已过期或取消，未执行','TASK_EXPIRED',409);task.phase='running';c.busy=true;return {allowed:true};};
 const complete=body=>{const c=authenticate(body),task=tasks.get(body.taskId);c.busy=false;if(!task||task.clientId!==c.id||task.phase!=='running')return {accepted:false};if(body.error)settle(task,error(String(body.error.message||body.error),body.error.code||'BROWSER_OPERATION_FAILED',body.error.status||400));else{const context=body.result?.context;if(validId(context?.projectId))Object.assign(c,{projectId:context.projectId,unit:context.unit,revision:context.revisions?.main,seen:now()});settle(task,null,body.result);}return {accepted:true};};
 async function execute(request,{timeoutMs=180000,signal}={}){
  const spec=browserOperation(request.operation);if(!spec)throw error('未知工作台操作','UNKNOWN_OPERATION');
  if(!validId(request.projectId))throw error('需要明确当前项目ID','INVALID_PROJECT');
  if(!spec.readOnly&&(!request.expectedRevisions||!Number.isInteger(request.expectedRevisions.main)))throw error('写入前请读取 project.context，提交 expectedRevisions','REVISION_REQUIRED',409);
  const live=[...clients.values()].filter(c=>c.projectId===request.projectId&&now()-c.seen<clientTTL);
  const client=live.filter(c=>!c.busy).sort((a,b)=>(b.unit===request.unit)-(a.unit===request.unit)||b.seen-a.seen)[0];
  if(!client)throw error(live.length?'工作台正在处理其他任务，请稍后重试':'请先在本机工作台打开此项目：/workbuddy-integrated-studio.html?project='+request.projectId,live.length?'BROWSER_BUSY':'BROWSER_REQUIRED',409);
  if([...tasks.values()].some(t=>t.clientId===client.id))throw error('该项目已有MCP任务在等待执行','BROWSER_BUSY',409);
  timeoutMs=Math.max(100,Math.min(Number(timeoutMs)||180000,300000));
  return new Promise((resolve,reject)=>{
   const task={id:randomUUID(),clientId:client.id,request,deadline:now()+timeoutMs,phase:'queued',resolve,reject};
   task.timer=setTimeout(()=>settle(task,error(task.phase==='running'?'页面任务已开始但尚未返回结果；请读取当前状态后再决定是否重试':'页面没有及时执行，任务已作废；不会稍后自动写入',task.phase==='running'?'OUTCOME_UNKNOWN':'TASK_EXPIRED',504)),timeoutMs);
   tasks.set(task.id,task);
   if(signal){const cancel=()=>settle(task,error(task.phase==='running'?'请求已取消；任务已开始，请读取项目状态':'请求已取消，未开始的任务已作废',task.phase==='running'?'OUTCOME_UNKNOWN':'TASK_CANCELLED',499));if(signal.aborted)cancel();else signal.addEventListener('abort',cancel,{once:true});}
  });
 }
 const plugin={name:'workbench-mcp-browser',configureServer:mount,configurePreviewServer:mount};
 function mount(server){server.middlewares.use('/api/mcp-browser',async(req,res)=>{
  const reply=(code,payload)=>{if(res.destroyed||res.writableEnded)return;res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(payload));};
  try{
   if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))throw error('MCP浏览器桥仅允许本机访问','LOCAL_ONLY',403);
   if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)throw error('只允许同源页面','ORIGIN_REJECTED',403);
   const path=new URL(req.url,'http://localhost').pathname;
   if(req.method==='GET'&&path==='/status')return reply(200,status());
   if(req.method!=='POST'||req.headers['x-workbench-request']!=='mcp-browser')throw error('请求来源或方法无效','REQUEST_REJECTED',403);
   let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>MAX_BYTES)throw error('本次资料超过80MB，请分批','TOO_LARGE',413);chunks.push(chunk);}
   const body=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');
   if(path==='/register'){if(!validId(body.projectId))throw error('页面项目未就绪','INVALID_PROJECT');return reply(200,register(body));}
   if(path==='/poll')return reply(200,poll(body));
   if(path==='/start')return reply(200,start(body));
   if(path==='/complete')return reply(200,complete(body));
   if(path==='/execute'){const controller=new AbortController();res.once('close',()=>{if(!res.writableEnded)controller.abort();});return reply(200,{ok:true,result:await execute(body,{timeoutMs:body.timeoutMs,signal:controller.signal})});}
   throw error('接口不存在','NOT_FOUND',404);
  }catch(e){reply(e.status||400,{error:e.message,code:e.code||'BRIDGE_ERROR'});}
 });}
 return {plugin,execute,status,register,poll,start,complete,close(){for(const task of tasks.values())settle(task,error('服务已停止','SERVER_CLOSED',503));clients.clear();}};
}
