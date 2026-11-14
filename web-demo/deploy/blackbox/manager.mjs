import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID,createHash} from 'node:crypto';
import {readPart,writePart} from '../../server/project-store.mjs';
import {bindProjectFolder,projectFolder,scanProjectFolder,OUTPUT_FOLDER} from '../../server/project-folders.mjs';
import {SERVICE_TOOLS,browserToolDefinitions} from '../../server/mcp-tools.mjs';
import {engineeringToolDefinitions} from '../../server/mcp-engineering.mjs';
import {sourceIdentity} from './identity.mjs';

const root=dirname(fileURLToPath(import.meta.url)),settingsId='0'.repeat(32);
const fault=(message,code,status=409)=>Object.assign(Error(message),{code,status});
const execFileAsync=promisify(execFile);
export function toolManifest(){const tools=[...SERVICE_TOOLS,...browserToolDefinitions(),...engineeringToolDefinitions];return {count:tools.length,digest:createHash('sha256').update(JSON.stringify(tools)).digest('hex'),names:tools.map(t=>t.name)};}
export function createManager({paths,instanceId,version,bridge,identity,stop,activeRequests=()=>0,openExternal=systemOpen}){
 const clients=new Map(),manifest=toolManifest();let closing=false,picking=false;
 const settingsRoot=join(paths.data,'.launcher');
 const selection=async()=>{const id=(await readPart(settingsRoot,settingsId,'selection'))?.data.projectId;return id?{projectId:id,...await projectFolder(paths,id)}:null;};
 async function status(){
  const selected=await selection(),browser=bridge.status();
  const name=selected?(await readPart(paths.projects,selected.projectId,'main'))?.data.parameters?.project_name:null;
  return {instanceId,version,identity,updateAvailable:identity!==await sourceIdentity(paths.appRoot),manifest,selected:selected?{...selected,name:name||selected.name,outputPath:join(selected.inputPath,OUTPUT_FOLDER)}:null,browser:{clients:browser.clients,tasks:browser.tasks},clients:[...clients.values()].filter(c=>Date.now()-c.seen<25000),stopping:closing,dataRoot:paths.data};
 }
 const plugin={name:'workbench-blackbox',configurePreviewServer:mount,configureServer:mount};
 function mount(adapter){adapter.middlewares.use(async(req,res,next)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  const reply=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  if(closing&&path!=='/api/launcher/status')return reply(503,{error:'后台正在退出，请重新启动',code:'STOPPING'});
  if(path==='/blackbox'||path.startsWith('/blackbox/')){
   const file=({'/blackbox':'index.html','/blackbox/':'index.html','/blackbox/app.js':'app.js','/blackbox/style.css':'style.css'})[path];
   if(!file||req.method!=='GET')return reply(404,{error:'页面不存在'});
   res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8');
   return res.end(await readFile(join(root,'ui',file)));
  }
  if(!path.startsWith('/api/launcher/'))return next();
  try{
   if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)||!/^127\.0\.0\.1:\d+$/.test(req.headers.host||'')||req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)throw fault('仅允许本机工作台访问','LOCAL_ONLY',403);
   if(req.method==='GET'&&path==='/api/launcher/status')return reply(200,await status());
   if(req.method==='GET'&&path==='/api/launcher/files')return reply(200,await scanProjectFolder(paths,new URL(req.url,'http://localhost').searchParams.get('project')));
   if(req.method!=='POST'||req.headers['x-workbench-request']!=='launcher')throw fault('请从小黑箱操作','REQUEST_REJECTED',403);
   let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>8192)throw fault('请求过大','TOO_LARGE',413);chunks.push(c);}
   const body=JSON.parse(Buffer.concat(chunks).toString()||'{}');
   if(path==='/api/launcher/parameters'){
    const selected=await selection();if(!selected||body.projectId!==selected.projectId)throw fault('项目已切换，请重新读取','PROJECT_CHANGED');
    const allowed=['project.context','project.select_unit','parameters.read','measures.update','measures.table','intake.adopt'];
    if(!allowed.includes(body.operation))throw Error('参数操作无效');
    const controller=new AbortController();res.once('close',()=>{if(!res.writableEnded)controller.abort();});
    return reply(200,await bridge.execute({projectId:selected.projectId,unit:body.unit,operation:body.operation,args:body.args||{},expectedRevisions:body.expectedRevisions},{timeoutMs:12000,signal:controller.signal}));
   }
   if(path==='/api/launcher/client'){
    if(!/^[a-f0-9-]{36}$/.test(body.id||'')||typeof body.name!=='string'||body.name.length>100)throw Error('客户端状态无效');
    if(body.closed)clients.delete(body.id);else clients.set(body.id,{id:body.id,name:body.name,version:String(body.version||'').slice(0,80),digest:String(body.digest||'').slice(0,64),busy:body.busy===true,seen:Date.now()});
    return reply(200,{ok:true,digest:manifest.digest});
   }
   if(path==='/api/launcher/select'){
    const selected=await bindProjectFolder(paths,body.path),old=await readPart(settingsRoot,settingsId,'selection');
    await writePart(settingsRoot,settingsId,'selection',{projectId:selected.projectId},old?.revision||0);
    return reply(200,selected);
   }
   if(path==='/api/launcher/pick-folder'){
    if(process.platform!=='win32')throw Error('当前平台请粘贴绝对路径');
    if(picking)throw Error('文件夹选择窗口已打开');picking=true;
    try{const {stdout}=await execFileAsync('powershell.exe',['-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',join(root,'pick-folder.ps1')],{windowsHide:true,timeout:180000,maxBuffer:10000});return reply(200,{path:stdout.trim()});}finally{picking=false;}
   }
   if(path==='/api/launcher/connect'){
    if(!['kimi','workbuddy'].includes(body.client))throw Error('此客户端尚未核实');
    const directory=await mkdtemp(join(await mkdir(join(paths.data,'mcp'),{recursive:true}).then(()=>join(paths.data,'mcp')),'连接配置-'));
    const env={WORKBENCH_PORTABLE_DATA:paths.data,...(process.env.WORKBENCH_SOURCE_MODE==='1'?{WORKBENCH_SOURCE_MODE:'1',WORKBENCH_SOURCE_RUNTIME:process.env.WORKBENCH_SOURCE_RUNTIME}:{})};
    const common={command:process.execPath,args:[join(paths.appRoot,'server/mcp-server.mjs')],env};
    const connection=body.client==='kimi'?{...common,startupTimeoutMs:30000,toolTimeoutMs:450000}:{type:'stdio',...common,timeout:450000};
    const text=JSON.stringify({mcpServers:{'structure-workbench':connection}},null,2),file=join(directory,body.client==='kimi'?'Kimi-MCP.json':'WorkBuddy-MCP.json');
    await writeFile(file,text,{flag:'wx'});
    return reply(200,{file,text,note:'在客户端 MCP 设置中添加或更新 structure-workbench，再重连刷新工具。工具等待配置为450秒，客户端是否支持该配置须重连后实际验证。配置已生成，不代表已连接；不要覆盖其他服务。'});
   }
   if(path==='/api/launcher/open'){
    const selected=await selection();
    if(body.target==='workbench'){await openExternal('http://'+req.headers.host+'/workbuddy-integrated-studio.html'+(selected?'?project='+selected.projectId:''));return reply(200,{ok:true});}
    if(!selected)throw Error('请先在设置中选择项目文件夹');
    const target=body.target==='results'?join(selected.inputPath,OUTPUT_FOLDER):body.target==='input'?selected.inputPath:null;
    if(!target)throw Error('入口无效');await openExternal(target);return reply(200,{ok:true});
   }
   if(path==='/api/launcher/stop'){
    if(body.instanceId!==instanceId)throw fault('服务实例已改变，请刷新状态','INSTANCE_CHANGED');
    const state=bridge.status();
    if(state.tasks.length||state.clients.some(c=>c.state==='connected'||c.state==='busy')||[...clients.values()].some(c=>c.busy&&Date.now()-c.seen<25000)||activeRequests()>1)throw fault('请先保存并关闭工作台页面，等待页面连接释放后再退出；执行中的任务不会被中断。','SERVICE_IN_USE');
    closing=true;reply(200,{ok:true});setImmediate(stop);return;
   }
   return reply(404,{error:'接口不存在'});
  }catch(e){return reply(e.status||400,{error:e.message,code:e.code||'LAUNCHER_ERROR'});}
 });}
 return {plugin,status};
}
export async function systemOpen(target){
 if(process.platform!=='win32')throw Error('自动打开仅支持 Windows');
 await new Promise((done,reject)=>{const child=spawn('explorer.exe',[target],{windowsHide:true,stdio:'ignore'});child.once('error',reject);child.once('spawn',()=>{child.unref();done();});});
}
