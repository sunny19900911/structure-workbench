import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('重复导航不广播权限变化，签发、角色、项目及载入状态变化仍刷新',async()=>{
 const html=await readFile(new URL('../../workbuddy-integrated-studio.html',import.meta.url),'utf8');
 const start=html.indexOf('let lastLockSignature;'),end=html.indexOf('function cardInit()',start);
 let refreshes=0,events=0;
 const context={ROLE:'designer',PSTAGE:'初设',CST:{c2:1},CARDS:[],
  window:{WorkbenchProjects:{id:'A',loading:false},ExpansionWorkbench:{refresh(){refreshes++;}},dispatchEvent(){events++;}},Event:class{}};
 vm.createContext(context);vm.runInContext(html.slice(start,end),context);
 context.syncLock();for(let i=0;i<20;i++)context.syncLock();
 assert.equal(events,1);assert.equal(refreshes,1);
 context.CST.c2=3;context.syncLock();
 context.ROLE='lead';context.syncLock();
 context.window.WorkbenchProjects.id='B';context.syncLock();
 context.window.WorkbenchProjects.loading=true;context.syncLock();
 context.window.WorkbenchProjects.loading=false;context.syncLock();
 assert.equal(events,6);assert.equal(refreshes,6);
});

test('模型联动快照不访问大份正文、图片、来源与历史，返回值与原数据隔离',async()=>{
 const js=await readFile(new URL('../../expansion-workbench.js',import.meta.url),'utf8');
 const expression=js.match(/modelContext:(\(\)=>state\?clone\([\s\S]*?\):null),get unit/)[1];
 const state={identity:{unit:'A'},parameters:{intensity:'8'},model:{metrics:{ratio:1}},regulations:[]};
 for(const key of ['sources','document','sections','history','reportImages'])Object.defineProperty(state,key,{get(){throw Error('不应读取 '+key);}});
 const capture=vm.runInNewContext(expression,{state,clone:v=>JSON.parse(JSON.stringify(v))});
 const result=capture();result.model.metrics.ratio=9;
 assert.equal(state.model.metrics.ratio,1);assert.equal(result.identity.unit,'A');
});
