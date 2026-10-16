import test from 'node:test';
import assert from 'node:assert/strict';
import {openInitialProject} from '../../project-startup.js';
const old='a'.repeat(32),next='b'.repeat(32);
for(const status of [404,410])test(`启动遇到${status}时选择保留项目并解除旧引用`,async()=>{
 const calls=[];await openInitialProject(old,{load:async id=>{calls.push(id);if(id===old)throw Object.assign(Error('旧项目不可用'),{status});},list:async()=>({projects:[{id:next}]}),create:()=>assert.fail('不应创建')});assert.deepEqual(calls,[old,next]);
});
test('全部删除后创建空白项目',async()=>{let created=0;await openInitialProject(old,{load:async()=>{throw Object.assign(Error(),{status:410});},list:async()=>({projects:[]}),create:()=>created++});assert.equal(created,1);});
test('连接失败不创建替代项目，也不抛弃恢复稿',async()=>{await assert.rejects(openInitialProject(old,{load:async()=>{throw Error('断线');},list:()=>assert.fail(),create:()=>assert.fail()}),/断线/);});
test('有效项目仍原样载入',async()=>{assert.equal(await openInitialProject(old,{load:async id=>id,list:()=>assert.fail(),create:()=>assert.fail()}),old);});
