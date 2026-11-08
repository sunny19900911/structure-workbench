import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createProjectStore,projectStoreApi} from '../../../server/project-store.mjs';
import {projectPart} from '../../../project-store-client.js';

const base=fileURLToPath(new URL('../../../qa/parallel-hardening/storage/faults/',import.meta.url));
await fs.mkdir(base,{recursive:true});
const root=await fs.mkdtemp(join(base,'run-'));
const store=createProjectStore();
const id=()=>randomUUID().replaceAll('-','');
const dir=(project,part='main')=>join(root,project,part);
const versions=async(project,part='main')=>(await fs.readdir(dir(project,part))).filter(n=>n.endsWith('.json')).sort();
const latest=async(project,part='main')=>join(dir(project,part),(await versions(project,part)).at(-1));
async function seed(part='main'){
 const project=id();
 await store.writePart(root,project,part,{text:'人工完整稿',signed:{text:'签发快照'}},0);
 await store.writePart(root,project,part,{text:'第二稿'},1);
 return project;
}
const fail=code=>Object.assign(Error('模拟 '+code),{code});

test('截断最新JSON：恢复只读、重启稳定、跳过损坏及恢复修订，连续保存不重号',async()=>{
 const project=await seed(),broken=await latest(project);
 await fs.writeFile(broken,'{"schema":1,');
 const before=await fs.readdir(dir(project));
 const recovered=await store.readPart(root,project,'main');
 assert.equal(recovered.revision,3);
 assert.deepEqual(recovered.data,{text:'人工完整稿',signed:{text:'签发快照'}});
 assert.equal(recovered.recovery.sourceRevision,1);
 assert.equal(recovered.recovery.highestRevision,2);
 assert.deepEqual(await fs.readdir(dir(project)),before);
 assert.deepEqual(await createProjectStore().readPart(root,project,'main'),recovered);
 for(const revision of [0,1,2])await assert.rejects(store.writePart(root,project,'main',{text:'旧窗口'},revision),{status:409});
 const saved=await store.writePart(root,project,'main',{...recovered.data,text:'恢复后编辑'},3);
 assert.equal(saved.revision,4);
 assert.equal((await store.writePart(root,project,'main',{text:'再次编辑'},4)).revision,5);
 assert.equal(await fs.readFile(broken,'utf8'),'{"schema":1,');
 assert.deepEqual((await versions(project)).map(n=>Number(n.slice(0,10))),[1,2,4,5]);
});

test('读回退后历史再次损坏，下一次保存拒绝旧恢复修订',async()=>{
 const project=await seed();
 await store.writePart(root,project,'main',{text:'三'},2);
 await fs.writeFile(await latest(project),'truncated');
 const read=await store.readPart(root,project,'main');
 assert.equal(read.revision,4);
 // A different complete fallback at the same high-water must not share a token.
 await fs.writeFile(join(dir(project),(await versions(project))[1]),'truncated');
 await assert.rejects(store.writePart(root,project,'main',{text:'基于旧恢复稿'},read.revision),{status:409});
});

test('残留临时文件完全忽略，包括完整JSON、高修订名及仅有临时文件的分区',async()=>{
 const project=await seed();
 await fs.writeFile(join(dir(project),'9999999999-'+randomUUID()+'.json.tmp'),'{');
 await fs.writeFile(join(dir(project),'9999999998-'+randomUUID()+'.json.tmp'),await fs.readFile(await latest(project)));
 assert.equal((await store.readPart(root,project,'main')).revision,2);
 const empty=id();await fs.mkdir(dir(empty),{recursive:true});
 await fs.writeFile(join(dir(empty),'0000000001-'+randomUUID()+'.json.tmp'),'{');
 assert.equal(await store.readPart(root,empty,'main'),null);
 assert.equal((await store.writePart(root,empty,'main',{text:'首次正式保存'},0)).revision,1);
});

test('独立写入进程在刷盘后、发布前退出，重启仍读旧稿并保留临时证据',async()=>{
 const project=await seed(),moduleUrl=new URL('../../../server/project-store.mjs',import.meta.url).href;
 const script=`import fs from 'node:fs/promises';import {createProjectStore} from ${JSON.stringify(moduleUrl)};const store=createProjectStore({io:{...fs,rename(){process.exit(79)}}});await store.writePart(${JSON.stringify(root)},${JSON.stringify(project)},'main',{text:'未发布'},2);`;
 await assert.rejects(promisify(execFile)(process.execPath,['--input-type=module','-e',script],{windowsHide:true}),error=>error.code===79);
 assert.equal((await createProjectStore().readPart(root,project,'main')).revision,2);
 const names=await fs.readdir(dir(project)),temporary=names.find(n=>n.endsWith('.tmp'));
 assert.ok(temporary);assert.equal(JSON.parse(await fs.readFile(join(dir(project),temporary))).data.text,'未发布');
 assert.equal((await store.writePart(root,project,'main',{text:'重启后保存'},2)).revision,3);
 assert.ok((await fs.readdir(dir(project))).includes(temporary));
});

test('POSIX发布目录刷盘失败不报成功；已可见版本使旧修订重试冲突',async()=>{
 const project=await seed(),faulty=createProjectStore({platform:'linux',io:{...fs,async open(path,flags){
  if(path===dir(project))return {async sync(){throw fail('EIO');},async close(){}};
  return fs.open(path,flags);
 }}});
 await assert.rejects(faulty.writePart(root,project,'main',{text:'发布后确认失败'},2),{code:'EIO',status:500});
 assert.equal((await store.readPart(root,project,'main')).revision,3);
 await assert.rejects(store.writePart(root,project,'main',{text:'禁止盲目重放'},2),{status:409});
});

test('发布前读者只看见旧完整版本；先写入、fsync、关闭再rename',async()=>{
 const project=await seed(),events=[];let entered,release;
 const atRename=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
 const fault=createProjectStore({io:{...fs,async open(path,flags){
  const handle=await fs.open(path,flags);
  return {async writeFile(...args){events.push('write');return handle.writeFile(...args);},async sync(){events.push('sync');return handle.sync();},async close(){events.push('close');return handle.close();}};
 },async rename(from,to){events.push('rename');entered();await gate;return fs.rename(from,to);}}});
 const saving=fault.writePart(root,project,'main',{text:'新完整稿'},2);
 await atRename;
 try{assert.equal((await store.readPart(root,project,'main')).revision,2);assert.deepEqual(events.slice(0,4),['write','sync','close','rename']);}finally{release();}
 assert.equal((await saving).revision,3);
 assert.equal((await store.readPart(root,project,'main')).data.text,'新完整稿');
});

for(const stage of ['open','write','sync','rename'])test(stage+'失败不发布半成品，旧稿可读且失败后可重试',async()=>{
 const project=await seed();let failed=false;
 const faulty=createProjectStore({io:{...fs,async open(path,flags){
  if(stage==='open'&&!failed){failed=true;throw fail('ENOSPC');}
  const handle=await fs.open(path,flags);
  return {async writeFile(...args){if(stage==='write'&&!failed){failed=true;await handle.writeFile('{');throw fail('ENOSPC');}return handle.writeFile(...args);},async sync(){if(stage==='sync'&&!failed){failed=true;throw fail('EIO');}return handle.sync();},close:()=>handle.close()};
 },async rename(...args){if(stage==='rename'&&!failed){failed=true;throw fail('EACCES');}return fs.rename(...args);}}});
 await assert.rejects(faulty.writePart(root,project,'main',{text:'失败内容'},2),{status:500});
 assert.equal((await store.readPart(root,project,'main')).revision,2);
 assert.equal((await versions(project)).length,2);
 if(stage!=='open')assert.equal((await fs.readdir(dir(project))).filter(n=>n.endsWith('.tmp')).length,1);
 assert.equal((await faulty.writePart(root,project,'main',{text:'重试成功'},2)).revision,3);
});

for(const code of ['EACCES','EIO','ENOENT'])test('读取文件 '+code+' 不作为损坏回退',async()=>{
 const project=await seed(),last=await latest(project);
 const faulty=createProjectStore({io:{...fs,async readFile(path,...args){if(path===last)throw fail(code);return fs.readFile(path,...args);}}});
 await assert.rejects(faulty.readPart(root,project,'main'),{code,status:500});
 await assert.rejects(faulty.writePart(root,project,'main',{text:'不能覆盖'},2),{code,status:500});
 assert.equal((await versions(project)).length,2);
});

test('枚举目录权限错误不能当空项目',async()=>{
 const faulty=createProjectStore({io:{...fs,async readdir(){throw fail('EACCES');}}});
 await assert.rejects(faulty.readPart(root,id(),'main'),{code:'EACCES',status:500});
});

for(const field of ['projectId','part','revision','schema','data','savedAt'])test('校验文件身份及字段：'+field,async()=>{
 const project=await seed(),path=await latest(project),record=JSON.parse(await fs.readFile(path));
 record[field]={projectId:id(),part:'ppt',revision:100,schema:2,data:null,savedAt:'not-a-date'}[field];
 await fs.writeFile(path,JSON.stringify(record));
 const recovered=await store.readPart(root,project,'main');
 assert.equal(recovered.recovery.sourceRevision,1);assert.equal(recovered.revision,3);
});

test('保持原schema 1格式，合法历史记录与导入后重映射的项目编号兼容',async()=>{
 const project=await seed(),path=await latest(project),record=JSON.parse(await fs.readFile(path));
 assert.deepEqual(Object.keys(record).sort(),['schema','projectId','part','revision','savedAt','data'].sort());
 const destination=id();record.projectId=destination;record.data={text:'导入副本',project_id:destination};
 await fs.mkdir(dir(destination),{recursive:true});await fs.writeFile(join(dir(destination),'0000000002-'+randomUUID()+'.json'),JSON.stringify(record));
 assert.equal((await store.readPart(root,destination,'main')).revision,2);
 assert.equal((await store.writePart(root,destination,'main',{text:'导入后编辑'},2)).revision,3);
});

test('全部损坏不返回null、不新建、保留原文件和HTTP错误类别',async()=>{
 const project=await seed();
 for(const name of await versions(project))await fs.writeFile(join(dir(project),name),'{');
 await assert.rejects(store.readPart(root,project,'main'),{code:'PROJECT_STORE_CORRUPT',status:503});
 await assert.rejects(store.writePart(root,project,'main',{text:'不得新建'},0),{code:'PROJECT_STORE_CORRUPT',status:503});
 assert.equal((await versions(project)).length,2);
 let middleware;projectStoreApi({WORKBENCH_PROJECT_STORE:root}).configureServer({middlewares:{use(_path,handler){middleware=handler;}}});
 for(const url of ['/'+project+'/main','/'+project,'/']){
  const req=Readable.from([]);Object.assign(req,{url,method:'GET',headers:{}});let status,body;
  await middleware(req,{writeHead(code){status=code;},end(text){body=JSON.parse(text);}});
  assert.equal(status,503);assert.equal(body.code,'PROJECT_STORE_CORRUPT');
 }
});

test('同修订两个文件不按UUID任意选稿',async()=>{
 const project=await seed();
 await fs.copyFile(await latest(project),join(dir(project),'0000000002-'+randomUUID()+'.json'));
 await assert.rejects(store.readPart(root,project,'main'),{code:'PROJECT_STORE_CORRUPT'});
});

test('删除记录损坏不能回退成未删除并开放写入',async()=>{
 const project=await seed('lifecycle');
 await fs.writeFile(await latest(project,'lifecycle'),'{');
 await assert.rejects(store.writePart(root,project,'main',{text:'不能复活'},0),{code:'PROJECT_STORE_CORRUPT'});
 await assert.rejects(store.writePart(root,project,'lifecycle',{deleted:false},3),{code:'PROJECT_STORE_CORRUPT'});
});

test('客户端采用恢复修订连续保存；旧脏稿保持冲突；全部损坏不伪装离线缓存',async()=>{
 const originalFetch=globalThis.fetch,originalStorage=globalThis.localStorage;
 const memory=new Map(),messages=[];
 globalThis.localStorage={getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)};
 globalThis.fetch=async(path,options)=>{
  const [project,part]=new URL(path,'http://localhost').pathname.split('/').slice(-2);
  try{const body=options.method==='POST'?JSON.parse(options.body):null;const record=body?await store.writePart(root,project,part,body.data,body.expectedRevision):await store.readPart(root,project,part);return {ok:true,json:async()=>({record})};}
  catch(error){return {ok:false,status:error.status,json:async()=>({error:error.message,code:error.code})};}
 };
 try{
  const project=await seed();await fs.writeFile(await latest(project),'{');
  const client=projectPart(project,'main',message=>messages.push(message));
  assert.equal((await client.load()).text,'人工完整稿');assert.equal(client.revision,3);assert.equal(messages.length,1);
  await client.save({text:'客户端恢复编辑'});await client.save({text:'客户端连续编辑'});assert.equal(client.revision,5);
  const key=client.key;memory.set(key,JSON.stringify({revision:2,data:{text:'旧窗口人工脏稿'},dirty:true}));
  const stale=projectPart(project,'main');assert.equal((await stale.load()).text,'旧窗口人工脏稿');assert.equal(stale.blocked,true);
  await assert.rejects(stale.save({text:'不能覆盖'}),{status:409});
  for(const name of await versions(project))await fs.writeFile(join(dir(project),name),'{');
  await assert.rejects(projectPart(project,'main').load(),{code:'PROJECT_STORE_CORRUPT'});
  assert.equal(JSON.parse(memory.get(key)).dirty,true);
 }finally{globalThis.fetch=originalFetch;globalThis.localStorage=originalStorage;}
});
