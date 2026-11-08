import net from 'node:net';
import {createHash,randomUUID} from 'node:crypto';
import {realpath} from 'node:fs/promises';
import {resolve} from 'node:path';

const fault=(message,code)=>Object.assign(Error(message),{code});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
export async function serviceAddress(dataRoot){
 // Resolve junctions and existing ancestors even before the data folder exists.
 let path=resolve(dataRoot),tail=[];
 for(;;){try{path=resolve(await realpath(path),...tail);break;}catch(e){if(e.code!=='ENOENT')throw e;const parent=resolve(path,'..');if(parent===path)throw e;tail.unshift(path.slice(parent.length).replace(/^[\\/]/,''));path=parent;}}
 if(process.platform==='win32')path=path.toLowerCase();
 const hash=createHash('sha256').update(path).digest('hex');
 if(process.platform!=='win32'&&process.platform!=='linux')throw fault('单服务锁仅支持 Windows/Linux','LOCK_UNSUPPORTED');
 return {dataRoot:path,address:process.platform==='win32'?'\\\\.\\pipe\\structure-workbench-'+hash:'\0structure-workbench-'+hash};
}
export async function readService(dataRoot,{timeout=1000}={}){
 const {address}=await serviceAddress(dataRoot);
 return new Promise((resolve,reject)=>{
  const socket=net.connect(address);let text='',done=false;
  const finish=(err,value)=>{if(done)return;done=true;socket.destroy();err?reject(err):resolve(value);};
  socket.setTimeout(timeout,()=>finish(fault('服务正在启动或暂未响应','SERVICE_UNRESPONSIVE')));
  socket.on('error',e=>['ENOENT','ECONNREFUSED'].includes(e.code)?finish(null,null):finish(e));
  socket.on('data',chunk=>{text+=chunk;if(text.length>8192)return finish(fault('服务身份无效','SERVICE_MISMATCH'));if(text.includes('\n')){try{finish(null,JSON.parse(text.split('\n')[0]));}catch{finish(fault('服务身份无效','SERVICE_MISMATCH'));}}});
  socket.on('end',()=>{if(!done)finish(fault('服务连接中断','SERVICE_UNRESPONSIVE'));});
 });
}
export async function verifyService(info,dataRoot,version,fetchImpl=fetch){
 const canonical=await serviceAddress(dataRoot);
 if(info?.dataRoot!==canonical.dataRoot||info?.version!==version||!info?.instanceId||!Number.isInteger(info.pid))throw fault('同一数据目录已有其他版本或身份不匹配的服务，请保存并关闭旧服务','SERVICE_MISMATCH');
 if(!info.url)return null;
 const u=new URL(info.url);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||!u.port||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw fault('服务地址无效','SERVICE_MISMATCH');
 const response=await fetchImpl(u.origin+'/api/portable/health',{signal:AbortSignal.timeout(1000),redirect:'error'});
 const health=await response.json();
 if(!response.ok||health.app!=='structure-workbench-portable'||health.version!==version||health.pid!==info.pid||health.instanceId!==info.instanceId||(await serviceAddress(health.dataRoot)).dataRoot!==canonical.dataRoot)throw fault('服务进程实例不匹配','SERVICE_MISMATCH');
 return {url:u.origin,health};
}
export async function acquireService(dataRoot,version,{timeout=30000}={}){
 const canonical=await serviceAddress(dataRoot),deadline=Date.now()+timeout;
 for(;;){
  const info={...canonical,address:undefined,version,pid:process.pid,instanceId:randomUUID(),url:null};
  const sockets=new Set(),server=net.createServer(socket=>{sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));socket.end(JSON.stringify(info)+'\n');});
  try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(canonical.address,()=>{server.removeListener('error',reject);resolve();});});
   let closed=false;return {owner:true,info,ready(url){info.url=url;},close(){if(closed)return;closed=true;for(const socket of sockets)socket.destroy();server.close();}};
  }catch(e){if(e.code!=='EADDRINUSE')throw e;}
  try{
   const existing=await readService(dataRoot);
   if(existing){const verified=await verifyService(existing,dataRoot,version);if(verified)return {owner:false,...verified,info:existing};}
  }catch(e){
   // A peer can exit between pipe discovery and HTTP verification. Retry binding;
   // only the OS may grant ownership, never a stale PID or a timed-out heartbeat.
   if(!['SERVICE_UNRESPONSIVE','ECONNRESET','EPIPE','ECONNREFUSED'].includes(e.code)&&!['TypeError','TimeoutError','AbortError'].includes(e.name))throw e;
  }
  if(Date.now()>=deadline)throw fault('已有服务启动超时，请检查启动日志；未启动第二份服务','START_TIMEOUT');
  await pause(100);
 }
}
