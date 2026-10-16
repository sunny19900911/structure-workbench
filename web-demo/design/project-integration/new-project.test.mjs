import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../../project-workspace.js',import.meta.url),'utf8');
const flush=source.slice(source.indexOf('async function flush('),source.indexOf('async function load('));
const create=source.slice(source.indexOf('async function create('),source.indexOf('async function removeCurrent('));
function harness(error,backupError){
 const events=[],input={value:'新工程'};
 const context=vm.createContext({loading:false,exporting:false,progress(){},modules:new Map([['ppt',{save:async()=>events.push('ppt-saved')}]]),window:{},save:async()=>{events.push('old-save');if(error)throw error;},download:async()=>{events.push('backup');if(backupError)throw backupError;},legacy:{blank:name=>({name})},q:()=>input,newProjectId:()=> 'new-id',load:async(id,{data})=>events.push(['load',id,data]),status:text=>events.push(text)});
 vm.runInContext(flush+'\n'+create,context);
 return {events,input,create:()=>vm.runInContext('create()',context),flush:()=>vm.runInContext('flush()',context)};
}
test('旧稿冲突仍保存其他分区，备份后才创建新项目',async()=>{
 const h=harness(Object.assign(Error('冲突'),{status:409}));await h.create();
 assert.deepEqual(h.events.slice(0,4),['old-save','ppt-saved','old-save','backup']);assert.equal(h.events[4][1],'new-id');assert.equal(h.events[4][2].name,'新工程');assert.equal(h.input.value,'');
});
test('普通保存和切换仍阻止冲突，不静默覆盖',async()=>{
 const h=harness(Object.assign(Error('冲突'),{status:409}));await assert.rejects(h.flush(),{status:409});assert.deepEqual(h.events,['old-save']);
});
test('断线或备份失败时不替换当前项目',async()=>{
 for(const h of [harness(Error('断线')),harness(Object.assign(Error('冲突'),{status:409}),Error('备份失败'))]){await assert.rejects(h.create());assert.equal(h.events.some(x=>Array.isArray(x)&&x[0]==='load'),false);assert.equal(h.input.value,'新工程');}
});
test('无冲突正常保存后新建，不额外下载',async()=>{const h=harness();await h.create();assert.deepEqual(h.events.slice(0,2),['old-save','ppt-saved']);assert.equal(h.events.includes('backup'),false);});
