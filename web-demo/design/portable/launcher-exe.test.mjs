import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,copyFile,writeFile,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';

const root=resolve('qa/portable-release/launcher-20261116',randomUUID(),'中文 空格'),source=resolve('deploy/portable');
const binary=resolve('outputs/launcher-20261116/build/结构工作台.exe');
const node=resolve('outputs/package-20261115/结构工作台-20261115-R1/runtime/node/node.exe');
const app=join(root,'app'),code=join(app,'deploy/portable'),data=join(root,'isolated-data');
const run=(exe,args,env={})=>new Promise((resolve,reject)=>{
 const p=spawn(exe,args,{windowsHide:true,stdio:'ignore',env:{...process.env,...env}});
 p.on('error',reject);p.on('close',code=>resolve({code}));
});
await mkdir(code,{recursive:true});await mkdir(join(root,'runtime/node'),{recursive:true});
await copyFile(binary,join(root,'结构工作台.exe'));
await copyFile(binary+'.config',join(root,'结构工作台.exe.config'));
await copyFile(node,join(root,'runtime/node/node.exe'));
for(const file of ['launcher-host.mjs','runtime.mjs','portable-service-lock.mjs'])await copyFile(join(source,file),join(code,file));
await writeFile(join(code,'start.mjs'),`
import {createServer} from 'node:http';
import {acquireService} from './portable-service-lock.mjs';
import {RELEASE} from './runtime.mjs';
const lease=await acquireService(process.env.WORKBENCH_PORTABLE_DATA,RELEASE);
if(lease.owner){
 const server=createServer((req,res)=>{
  if(req.url==='/stop-fixture'){res.end('stopped');clearInterval(tick);server.close(()=>lease.close());return;}
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({app:'structure-workbench-portable',version:RELEASE,pid:process.pid,instanceId:lease.info.instanceId,dataRoot:lease.info.dataRoot}));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));lease.ready('http://127.0.0.1:'+server.address().port);
 const tick=setInterval(()=>console.log('fixture still alive'),100);
}
`);
const env={WORKBENCH_PORTABLE_DATA:data};let service;
test('EXE missing components is an actionable result, not silent exit',async()=>{
 const dir=join(root,'missing');await mkdir(dir);await copyFile(binary,join(dir,'结构工作台.exe'));
 const file=join(dir,'result.json');const p=await run(join(dir,'结构工作台.exe'),['--diagnose',file],env);
 assert.equal(p.code,1);const result=JSON.parse(await readFile(file,'utf8'));assert.equal(result.ok,false);assert.match(result.error,/完整解压/);
});
test('real EXE calls bundled Node; host exits and detached backend survives; repeated launch reuses it',async()=>{
 try{
  const exe=join(root,'结构工作台.exe'),file=join(root,'first.json');
  const p=await run(exe,['--diagnose',file],env);const first=JSON.parse(await readFile(file,'utf8'));
  assert.equal(p.code,0,JSON.stringify(first));assert.equal(first.ok,true);service=first.url.split('/workbuddy')[0];
  const before=await (await fetch(service+'/api/portable/health')).json();
  await new Promise(r=>setTimeout(r,500));
  const repeats=await Promise.all([1,2].map(async i=>{
   const f=join(root,`repeat${i}.json`);assert.equal((await run(exe,['--diagnose',f],env)).code,0);return JSON.parse(await readFile(f,'utf8'));
  }));
  for(const result of repeats)assert.equal(result.url,first.url);
  const after=await (await fetch(service+'/api/portable/health')).json();assert.equal(before.instanceId,after.instanceId);assert.equal(before.pid,after.pid);
  assert.match(await readFile(first.logs.stdout,'utf8'),/fixture still alive/);
 }finally{if(service)await fetch(service+'/stop-fixture');}
});
test('backend crash is reported with original error and a log path',async()=>{
 await writeFile(join(code,'start.mjs'),"console.error('fixture: required runtime missing');process.exitCode=7;");
 const file=join(root,'failure.json');assert.equal((await run(join(root,'结构工作台.exe'),['--diagnose',file],env)).code,1);
 const result=JSON.parse(await readFile(file,'utf8'));assert.equal(result.ok,false);assert.match(result.detail,/required runtime missing/);assert.match(result.error,/7/);assert.ok(result.logs.stderr);
});
