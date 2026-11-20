import {spawn} from 'node:child_process';
import {openSync,closeSync} from 'node:fs';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {portablePaths,RELEASE} from './runtime.mjs';
import {readService,verifyService} from './portable-service-lock.mjs';

// The short-lived host owns no service pipes. The detached service writes directly
// to files, so closing the launcher cannot break stdout or stop the workbench.
export async function launch({appRoot=fileURLToPath(new URL('../../',import.meta.url)),timeout=120000}={}){
 const paths=portablePaths(appRoot),id=randomUUID();
 await mkdir(paths.data,{recursive:true});
 const stdout=join(paths.data,`启动-${id}.log`),stderr=join(paths.data,`启动错误-${id}.log`);
 const logs={stdout,stderr};
 let child,exitCode=null,spawnError=null;
 const out=openSync(stdout,'a');let err;
 try{
  err=openSync(stderr,'a');
  child=spawn(process.execPath,[join(appRoot,'deploy/portable/start.mjs')],{
   cwd:appRoot,env:{...process.env,WORKBENCH_PORTABLE_DATA:paths.data},
   detached:true,windowsHide:true,stdio:['ignore',out,err]
  });
 }finally{closeSync(out);if(err!==undefined)closeSync(err);}
 child.once('error',e=>{spawnError=e;});
 child.once('exit',code=>{exitCode=code??-1;});
 child.unref();
 const deadline=Date.now()+timeout;
 try{
  while(Date.now()<deadline){
   if(spawnError)throw spawnError;
   if(exitCode!==null&&exitCode!==0)throw Error(`后台启动失败（退出码 ${exitCode}）。`);
   try{
    const info=await readService(paths.data);
    if(info){const verified=await verifyService(info,paths.data,RELEASE);if(verified)return {ok:true,url:verified.url+'/workbuddy-integrated-studio.html',pid:info.pid,dataDir:paths.data,logs};}
   }catch(e){
    if(e.code==='SERVICE_MISMATCH')throw e;
    if(!['SERVICE_UNRESPONSIVE','ECONNRESET','EPIPE','ECONNREFUSED'].includes(e.code)&&!['TypeError','TimeoutError','AbortError'].includes(e.name))throw e;
   }
   await new Promise(r=>setTimeout(r,250));
  }
  throw Error('工作台尚未就绪。可以稍后重试；不会重复启动同一项目库。');
 }catch(e){
  let detail='';try{detail=(await readFile(stderr,'utf8')).slice(-6000);}catch{}
  return {ok:false,error:e.message,detail,dataDir:paths.data,logs};
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let result;
 try{result=await launch();}catch(e){result={ok:false,error:e.message};}
 if(process.argv[2]==='--result'&&process.argv[3]){
  const target=resolve(process.argv[3]),temp=target+'.tmp';
  await writeFile(temp,JSON.stringify(result),{encoding:'utf8',flag:'wx'});await rename(temp,target);
 }else console.log(JSON.stringify(result));
 process.exitCode=result.ok?0:1;
}
