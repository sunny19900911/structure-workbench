// The MCP process speaks only to this user's local portable service.
import {spawn} from 'node:child_process';
import {mkdir,open,realpath,stat,readFile,writeFile} from 'node:fs/promises';
import {basename,extname,isAbsolute,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {readService,verifyService} from '../deploy/portable/portable-service-lock.mjs';
import {portablePaths,RELEASE} from '../deploy/portable/runtime.mjs';

export const appRoot=fileURLToPath(new URL('../',import.meta.url));
export function localURL(value){
 const u=new URL(value);
 if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||!u.port||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('MCP 只连接本机 127.0.0.1 工作台');
 return u.origin;
}
const samePath=(a,b)=>resolve(a).toLowerCase()===resolve(b).toLowerCase();
export function createLocalClient({env=process.env,fetchImpl=fetch,root=appRoot}={}){
 const paths=portablePaths(root,env);let starting;
 async function health(url){try{const r=await fetchImpl(url+'/api/portable/health',{signal:AbortSignal.timeout(500),redirect:'error'});return r.ok?await r.json():null;}catch{return null;}}
 function compatible(h){return h?.app==='structure-workbench-portable'&&samePath(h.dataRoot||'',paths.data)&&h.version===RELEASE;}
 async function discover(){
  const info=await readService(paths.data);
  if(info){if(env.WORKBENCH_MCP_URL&&info.url&&localURL(env.WORKBENCH_MCP_URL)!==info.url)throw Object.assign(Error('指定端口与同数据目录服务不一致'),{code:'SERVICE_MISMATCH'});const verified=await verifyService(info,paths.data,RELEASE,fetchImpl);return verified||{state:'starting'};}
  // Compatibility discovery for packages predating the service lock.
  const urls=env.WORKBENCH_MCP_URL?[localURL(env.WORKBENCH_MCP_URL)]:Array.from({length:20},(_,i)=>'http://127.0.0.1:'+(58720+i));
  const found=await Promise.all(urls.map(async url=>({url,health:await health(url)})));
  const match=found.find(x=>compatible(x.health));if(match){if(!match.health.instanceId||!Number.isInteger(match.health.pid))throw Object.assign(Error('已有服务缺少进程实例身份，请保存并关闭旧服务后启动新版'),{code:'SERVICE_MISMATCH'});return match;}
  if(env.WORKBENCH_MCP_URL||found.some(x=>x.health?.app==='structure-workbench-portable'&&samePath(x.health.dataRoot||'',paths.data)))throw Object.assign(Error('指定工作台的版本或数据目录不匹配'),{code:env.WORKBENCH_MCP_URL?'SERVICE_MISMATCH':'OLDER_SERVICE_RUNNING'});
  return null;
 }
 async function status(){
  const found=await discover();if(!found?.url)return {state:found?.state||'stopped',health:null,browser:null};
  const response=await fetchImpl(found.url+'/api/mcp-browser/status',{signal:AbortSignal.timeout(2000),redirect:'error'});
  if(!response.ok)throw Object.assign(Error('网页连接状态暂不可读'),{code:'SERVICE_UNRESPONSIVE'});
  return {state:'running',health:found.health,browser:await response.json()};
 }
 async function connect(){
  const found=await discover();if(found?.url)return found.url;
  let child,failed=false;
  if(!found){
   await mkdir(paths.data,{recursive:true});const log=await open(join(paths.data,'MCP启动.log'),'a');
   try{child=spawn(process.execPath,[join(root,'deploy/portable/start.mjs')],{cwd:root,env:{...env,WORKBENCH_PORTABLE_DATA:paths.data},detached:true,windowsHide:true,stdio:['ignore',log.fd,log.fd]});child.on('error',()=>{failed=true;});child.on('exit',code=>{if(code!==0)failed=true;});child.unref();}finally{await log.close();}
  }
  for(let i=0;i<150;i++){const active=await discover();if(active?.url)return active.url;if(failed)throw Object.assign(Error('本机工作台启动失败，请查看 MCP启动.log'),{code:'START_FAILED'});await new Promise(r=>setTimeout(r,200));}
  throw Object.assign(Error('本机工作台启动超时，请查看 MCP启动.log'),{code:'START_TIMEOUT'});
 }
 async function base(){if(!starting)starting=connect().finally(()=>{starting=null;});return starting;}
 async function request(path,{method='GET',body,header,headers={},binary=false,timeout=180000,maxBytes=512*1024*1024}={}){
  if(!path.startsWith('/api/')||path.includes('://'))throw Error('接口路径无效');
  // All ordinary reads and writes require an explicitly started service.
  const found=await discover();if(!found?.url)throw Object.assign(Error('请先调用 workbench_open 启动本机工作台'),{code:'SERVICE_NOT_RUNNING'});
  const url=found.url,raw=Buffer.isBuffer(body)||body instanceof Uint8Array;
  const response=await fetchImpl(url+path,{method,headers:{...(body&&!raw?{'Content-Type':'application/json'}:{}),...(header?{'x-workbench-request':header}:{}),...headers},body:body===undefined?undefined:raw?body:JSON.stringify(body),signal:AbortSignal.timeout(timeout),redirect:'error'});
  if(!response.ok){const value=await response.json().catch(()=>({}));throw Object.assign(Error(value.error||'本机接口返回 HTTP '+response.status),{code:value.code||(response.status===409?'REVISION_CONFLICT':'HTTP_ERROR'),status:response.status,details:value});}
  if(!binary)return response.json();
  const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>maxBytes)throw Error('输出超过大小限制');chunks.push(Buffer.from(chunk));}
  return {bytes:Buffer.concat(chunks),mime:response.headers.get('content-type')||'application/octet-stream',warnings:response.headers.get('x-workbench-warnings')||''};
 }
 async function artifact(bytes,filename,mime){
  if(!Buffer.isBuffer(bytes))bytes=Buffer.from(bytes);
  const safe=basename(String(filename||'成果')).replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,140);
  const directory=join(paths.data,'exports','MCP',new Date().toISOString().slice(0,10));await mkdir(directory,{recursive:true});
  const file=join(directory,randomUUID().slice(0,8)+'-'+safe);await writeFile(file,bytes,{flag:'wx'});
  return {path:file,filename:safe,mime,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 }
 async function openBrowser(projectId=''){
  const url=await base(),page=url+'/workbuddy-integrated-studio.html'+(projectId?'?project='+encodeURIComponent(projectId):'');
  if(process.platform==='win32')await new Promise((done,reject)=>{const p=spawn('explorer.exe',[page],{windowsHide:true,stdio:'ignore'});p.once('error',reject);p.once('spawn',()=>{p.unref();done();});});
  return {url:page,opened:process.platform==='win32',note:'网页需要保持打开，扩初与 PPT 使用同一页面的编排逻辑。'};
 }
 return {base,status,request,artifact,openBrowser,paths};
}

const DOCUMENTS=new Set(['.doc','.docx','.docm','.dot','.dotx','.dotm','.xls','.xlsx','.xlsm','.xlsb','.xlt','.xltx','.xltm','.ppt','.pptx','.pptm','.pot','.potx','.potm','.pps','.ppsx','.ppsm','.pdf','.out','.txt','.csv','.png','.jpg','.jpeg','.webp','.zip']);
export async function sourceFile(filePath,{extensions=DOCUMENTS,maxBytes=64*1024*1024}={}){
 if(!isAbsolute(filePath))throw Error('请提供本机文件绝对路径');
 const actual=await realpath(filePath),ext=extname(actual).toLowerCase();
 if(!extensions.has(ext)||/(?:^|[\\/])(?:\.ssh|\.aws|\.config|00-key|03_盈建科参数导出样本)(?:[\\/]|$)/i.test(actual)||/(?:key|secret|token|password|密钥|密码)/i.test(basename(actual)))throw Error('此接口只读取明确选择的工程资料文件，不读取凭据或归档禁用目录');
 const info=await stat(actual);if(!info.isFile()||info.size>maxBytes)throw Error('文件不存在或超过本接口大小限制');
 const bytes=await readFile(actual);if(bytes.length>maxBytes)throw Error('读取期间文件大小超过限制');
 return {name:basename(actual),bytes,path:actual};
}
