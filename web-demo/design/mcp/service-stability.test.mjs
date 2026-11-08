import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {acquireService,readService,verifyService,serviceAddress} from '../../deploy/portable/portable-service-lock.mjs';
import {createLocalClient} from '../../server/mcp-local-client.mjs';
import {callServiceTool} from '../../server/mcp-tools.mjs';
import {RELEASE} from '../../deploy/portable/runtime.mjs';

const root=fileURLToPath(new URL('../../qa/parallel-hardening/mcp/',import.meta.url));
async function folder(){await mkdir(root,{recursive:true});return mkdtemp(join(root,'服务 中文 '));}
const lockModule=new URL('../../deploy/portable/portable-service-lock.mjs',import.meta.url).href;
async function worker(data,version=RELEASE){
 const code=`import {acquireService} from ${JSON.stringify(lockModule)};import {createServer} from 'node:http';
 const lease=await acquireService(process.argv[1],process.argv[2]);
 if(!lease.owner){process.send({owner:false,...lease.info});process.exit(0);}
 const server=createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({app:'structure-workbench-portable',...lease.info}));});
 server.listen(0,'127.0.0.1',()=>{lease.ready('http://127.0.0.1:'+server.address().port);process.send({owner:true,...lease.info});});`;
 const child=spawn(process.execPath,['--input-type=module','-e',code,data,version],{stdio:['ignore','ignore','pipe','ipc'],windowsHide:true});
 let stderr='';child.stderr.on('data',b=>stderr+=b);
 const message=new Promise((resolve,reject)=>{child.once('message',resolve);child.once('error',reject);child.once('exit',code=>{if(code)reject(Error(stderr));});});
 return {child,message};
}
async function stop(child){if(child.exitCode!==null||child.signalCode!==null)return;const done=once(child,'exit');child.kill();await done;}

test('8 simultaneous processes own exactly one service; other roots coexist; crash releases kernel lock',async t=>{
 const data=await folder(),workers=await Promise.all(Array.from({length:8},()=>worker(data)));
 t.after(()=>Promise.all(workers.map(w=>stop(w.child))));
 const replies=await Promise.all(workers.map(w=>w.message));
 assert.equal(replies.filter(r=>r.owner).length,1);
 assert.equal(new Set(replies.map(r=>r.instanceId)).size,1);
 const owner=workers[replies.findIndex(r=>r.owner)],info=await readService(data);
 assert.equal((await verifyService(info,data,RELEASE)).health.pid,owner.child.pid);
 const other=await worker(await folder());workers.push(other);assert.equal((await other.message).owner,true);
 const mismatch=await worker(data,'different-version');workers.push(mismatch);await assert.rejects(mismatch.message,/其他版本|不匹配/);
 await stop(owner.child);
 assert.equal(await readService(data),null);
 const replacement=await worker(data);workers.push(replacement);const next=await replacement.message;
 assert.equal(next.owner,true);assert.notEqual(next.instanceId,info.instanceId);
 await assert.rejects(verifyService({...next,instanceId:info.instanceId},data,RELEASE),e=>e.code==='SERVICE_MISMATCH');
});

test('canonical directory aliases share a lock; startup error release permits next owner',async()=>{
 const data=await folder();assert.deepEqual(await serviceAddress(data),await serviceAddress(join(data,'missing','..')));
 const first=await acquireService(data,RELEASE);assert.equal(first.owner,true);first.close();
 const second=await acquireService(data,RELEASE);assert.equal(second.owner,true);second.close();
 const starting=await acquireService(data,RELEASE),waiting=acquireService(data,RELEASE,{timeout:2000});
 setTimeout(()=>starting.close(),30);
 const recovered=await waiting;assert.equal(recovered.owner,true);assert.notEqual(recovered.info.instanceId,starting.info.instanceId);recovered.close();
});

test('status and ordinary reads never spawn or create data; explicit base starts only its QA stub',async()=>{
 const dir=await folder(),data=join(dir,'absent'),stubRoot=join(dir,'app');
 await mkdir(join(stubRoot,'deploy/portable'),{recursive:true});
 await writeFile(join(stubRoot,'deploy/portable/start.mjs'),`import {writeFile} from 'node:fs/promises';await writeFile(${JSON.stringify(join(dir,'spawned'))},'started');process.exit(1);`);
 const client=createLocalClient({env:{WORKBENCH_PORTABLE_DATA:data},root:stubRoot,fetchImpl:async()=>{throw Error('not running');}});
 assert.equal((await callServiceTool(client,'workbench_status')).state,'stopped');
 await assert.rejects(client.request('/api/workbench-projects'),e=>e.code==='SERVICE_NOT_RUNNING');
 assert.ok(!(await readdir(dir)).includes('absent'));assert.ok(!(await readdir(dir)).includes('spawned'));
 await assert.rejects(client.base(),e=>e.code==='START_FAILED');
 assert.equal(await readFile(join(dir,'spawned'),'utf8'),'started');
});

test('actual portable start entry arbitrates concurrent launches and releases failed startup',async t=>{
 const dir=await folder(),app=join(dir,'app'),entry=join(app,'deploy/portable/start.mjs'),data=join(dir,'data');
 await mkdir(join(app,'deploy/portable'),{recursive:true});
 // Exact entry logic in a QA package; imports resolve to this worktree's real modules.
 const original=new URL('../../deploy/portable/start.mjs',import.meta.url);
 const source=(await readFile(original,'utf8')).replace(/(from\s*|import\()'([.][^']+)'/g,(_,prefix,path)=>prefix+JSON.stringify(new URL(path,original).href)).replace(':58720;',':59840;');
 await writeFile(entry,source);
 const env={...process.env,WORKBENCH_PORTABLE_DATA:data};delete env.WORKBENCH_MCP_URL;
 const children=[];t.after(async()=>{
  const owned=await readService(data);
  if(owned?.url){await verifyService(owned,data,RELEASE);process.kill(owned.pid);}
  await Promise.all(children.map(stop));
 });
 const launch=()=>{const child=spawn(process.execPath,[entry,'--port','59840'],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});children.push(child);let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);return {child,output:()=>output};};
 const failed=launch();await once(failed.child,'exit');assert.equal(failed.child.exitCode,1);assert.equal(await readService(data),null);
 // Existence markers, not working converters: this only exercises HTTP/startup.
 for(const path of ['python/python.exe','poppler/bin/pdfinfo.exe','poppler/bin/pdftoppm.exe']){const target=join(dir,'runtime',path);await mkdir(join(target,'..'),{recursive:true});await writeFile(target,'QA existence marker');}
 const starts=Array.from({length:2},launch);
 // Two independent MCP clients race the two launcher entry processes.
 const localModule=new URL('../../server/mcp-local-client.mjs',import.meta.url).href;
 const toolsModule=new URL('../../server/mcp-tools.mjs',import.meta.url).href;
 const clients=Array.from({length:2},()=>{
  const code=`import {createLocalClient} from ${JSON.stringify(localModule)};import {callServiceTool} from ${JSON.stringify(toolsModule)};
  const result=await callServiceTool(createLocalClient({root:process.argv[1]}),'workbench_start');process.send(result);`;
  const child=spawn(process.execPath,['--input-type=module','-e',code,app],{env,stdio:['ignore','ignore','pipe','ipc'],windowsHide:true});children.push(child);
  let output='';child.stderr.on('data',b=>output+=b);
  return new Promise((resolve,reject)=>{child.once('message',resolve);child.once('exit',code=>{if(code)reject(Error(output));});});
 });
 let info;
 for(let i=0;i<150;i++){info=await readService(data);if(info?.url)break;await new Promise(r=>setTimeout(r,100));}
 assert.ok(info?.url,starts.map(s=>s.output()).join('\n'));
 const verified=await verifyService(info,data,RELEASE);assert.equal(verified.health.instanceId,info.instanceId);
 for(const s of starts.filter(s=>s.child.pid!==info.pid)){if(s.child.exitCode===null)await once(s.child,'exit');assert.equal(s.child.exitCode,0,s.output());assert.match(s.output(),/复用本地工作台/);}
 const results=await Promise.all(clients);assert.ok(results.every(r=>r.health.pid===info.pid&&r.health.instanceId===info.instanceId));
 assert.ok(starts.filter(s=>s.child.exitCode===null).length<=1);
});
