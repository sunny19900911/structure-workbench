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
 globalThis.fetch=async(path,options)=>{const [id,part]=path.split('/').slice(-2);try{const record=options.method==='POST'?await writePart(root,id,part,JSON.parse(options.body).data,JSON.parse(options.body).expectedRevision):await readPart(root,id,part);return {ok:true,json:async()=>({record})};}catch(e){return {ok:false,status:e.status||400,json:async()=>({error:e.message})}};};
 const first=projectPart(b,'ppt'),second=projectPart(b,'ppt');await first.load();await second.load();
 await Promise.all([first.save({text:'一'}),first.save({text:'二'})]);
 assert.equal((await readPart(root,b,'ppt')).data.text,'二');
 await assert.rejects(second.save({text:'其他窗口'}));
 const restored=projectPart(b,'ppt');assert.equal((await restored.load()).text,'其他窗口');assert.equal(restored.blocked,true);
 await assert.rejects(restored.save({text:'不能覆盖'}));assert.equal((await readPart(root,b,'ppt')).data.text,'二');
 assert.equal((await restored.load({remoteOnly:true})).text,'二');await restored.save({text:'合并后'});
});
