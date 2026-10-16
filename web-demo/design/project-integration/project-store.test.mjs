import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readPart,writePart,validProjectId} from '../../server/project-store.mjs';
import {projectPart} from '../../project-store-client.js';
const base=new URL('../../qa/project-integration/',import.meta.url);
await mkdir(base,{recursive:true});
const root=await mkdtemp(join(fileURLToPath(base),'test-'));
const a=randomUUID().replaceAll('-',''),b=randomUUID().replaceAll('-','');
test('项目编号拒绝路径穿越',()=>{assert.equal(validProjectId('../bad'),false);assert.equal(validProjectId(a),true);});
test('重命名不换项目；分区和项目互不覆盖；保留历史',async()=>{
 await writePart(root,a,'main',{parameters:{project_name:'A'}},0);
 await writePart(root,a,'main',{parameters:{project_name:'A改名'}},1);
 await writePart(root,a,'ppt',{unit:'单体一'},0);
 await writePart(root,b,'main',{parameters:{project_name:'B'}},0);
 assert.equal((await readPart(root,a,'main')).revision,2);
 assert.equal((await readPart(root,a,'ppt')).data.unit,'单体一');
 assert.equal((await readPart(root,b,'main')).data.parameters.project_name,'B');
 assert.equal((await readdir(join(root,a,'main'))).length,2);
});
test('同一修订同时保存只允许一份成功，另一份409',async()=>{
 const results=await Promise.allSettled([writePart(root,a,'main',{n:1},2),writePart(root,a,'main',{n:2},2)]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(results.find(x=>x.status==='rejected').reason.status,409);
});
test('客户端队列采用新修订，冲突恢复稿不覆盖服务端',async()=>{
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
 globalThis.fetch=async(path,options)=>{const [id,part]=new URL(path,'http://localhost').pathname.split('/').slice(-2);try{const record=options.method==='POST'?await writePart(root,id,part,JSON.parse(options.body).data,JSON.parse(options.body).expectedRevision):await readPart(root,id,part);return {ok:true,json:async()=>({record})};}catch(e){return {ok:false,status:e.status||400,json:async()=>({error:e.message})}};};
 const first=projectPart(b,'ppt'),second=projectPart(b,'ppt');await first.load();await second.load();
 await Promise.all([first.save({text:'一'}),first.save({text:'二'})]);
 assert.equal((await readPart(root,b,'ppt')).data.text,'二');
 await assert.rejects(second.save({text:'其他窗口'}));
 const restored=projectPart(b,'ppt');assert.equal((await restored.load()).text,'其他窗口');assert.equal(restored.blocked,true);
 await assert.rejects(restored.save({text:'不能覆盖'}));assert.equal((await readPart(root,b,'ppt')).data.text,'二');
 assert.equal((await restored.load({remoteOnly:true})).text,'二');await restored.save({text:'合并后'});
});

test('无数据变化不写缓存或请求保存；失败可以只重试本分区',async()=>{
 let posts=0,writes=0,fail=false,record=null;const memory=new Map();
 globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>{writes++;memory.set(k,v);}};
 globalThis.fetch=async(path,options)=>{if(options.method==='POST'){posts++;if(fail){fail=false;throw Error('模拟断线');}const body=JSON.parse(options.body);record={data:body.data,revision:(record?.revision||0)+1};}return {ok:true,json:async()=>({record})};};
 const store=projectPart(newProjectIdForTest(),'main');await store.load();await store.save({text:'原稿'});const baseline=writes;
 await store.save({text:'原稿'});assert.equal(posts,1);assert.equal(writes,baseline);
 fail=true;await assert.rejects(store.save({text:'修改'}),/模拟断线/);assert.equal(store.recovery().dirty,true);
 await store.save({text:'修改'});assert.equal(record.data.text,'修改');assert.equal(store.recovery().dirty,false);assert.equal(record.revision,2);
});
function newProjectIdForTest(){return randomUUID().replaceAll('-','');}

test('删除仅作标记，拒绝旧窗口写入；恢复保留全部分区与历史',async()=>{
 const id=newProjectIdForTest();await writePart(root,id,'main',{parameters:{project_name:'可恢复项目'}},0);await writePart(root,id,'ppt',{text:'原汇报'},0);
 await writePart(root,id,'lifecycle',{deleted:true},0);
 await assert.rejects(writePart(root,id,'main',{text:'旧窗口'},1),{status:410});
 assert.equal((await readPart(root,id,'ppt')).data.text,'原汇报');
 await writePart(root,id,'lifecycle',{deleted:false},1);
 assert.equal((await readPart(root,id,'main')).data.parameters.project_name,'可恢复项目');
 await writePart(root,id,'main',{text:'恢复后修改'},1);assert.equal((await readPart(root,id,'main')).revision,2);
});
