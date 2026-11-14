import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createBrowserBridge} from '../../server/mcp-browser-bridge.mjs';
import {bridgeError,validateBridgeRequest} from '../../mcp-browser-core.js';
const projectId='a'.repeat(32);
const source=await readFile(new URL('../../mcp-browser-bridge.js',import.meta.url),'utf8');
const request={projectId,operation:'project.save',args:{},expectedRevisions:{main:1}};
const register=bridge=>{const c=bridge.register({projectId,unit:'项目整体'});return {...c,clientId:c.id};};

test('background throttling survives one minute, sleep becomes unresponsive, same session resumes',async()=>{
 let time=0;const bridge=createBrowserBridge({now:()=>time}),client=register(bridge);
 time=65000;assert.equal(bridge.status().clients[0].state,'connected');
 time=121000;assert.equal(bridge.status().clients[0].state,'unresponsive');
 await assert.rejects(bridge.execute(request),e=>e.code==='BROWSER_UNRESPONSIVE');
 bridge.poll({...client,projectId,busy:false});assert.equal(bridge.status().clients[0].state,'connected');
 const pending=bridge.execute(request),task=bridge.poll({...client,projectId}).task;
 bridge.start({...client,taskId:task.id});assert.equal(bridge.status().clients[0].state,'busy');
 bridge.complete({...client,taskId:task.id,result:{saved:true}});await pending;bridge.close();
});

test('running timeout retains unknown task and blocks writes even from a newly registered tab',async()=>{
 const bridge=createBrowserBridge(),client=register(bridge),pending=bridge.execute(request,{timeoutMs:100});
 const task=bridge.poll({...client,projectId}).task;bridge.start({...client,taskId:task.id});
 await assert.rejects(pending,e=>e.code==='OUTCOME_UNKNOWN');
 assert.equal(bridge.status().tasks[0].phase,'outcome_unknown');register(bridge);
 await assert.rejects(bridge.execute(request),e=>e.code==='OUTCOME_UNKNOWN');
 bridge.poll({...client,projectId,busy:false});assert.equal(bridge.status().clients.find(c=>c.id===client.id).busy,true);
 bridge.complete({...client,taskId:task.id,result:{saved:true}});assert.equal(bridge.status().tasks.length,0);
 const next=bridge.execute(request);bridge.close();await assert.rejects(next,e=>e.code==='SERVER_CLOSED');
});

test('wall-clock expiry beats a delayed timer; wrong completion does not clear busy',async()=>{
 let time=0;const bridge=createBrowserBridge({now:()=>time}),c=register(bridge),pending=bridge.execute(request);
 const task=bridge.poll({...c,projectId}).task;bridge.start({...c,taskId:task.id});
 assert.equal(bridge.complete({...c,taskId:'wrong',result:{}}).accepted,false);assert.equal(bridge.status().clients[0].busy,true);
 time=task.deadline+1;bridge.complete({...c,taskId:task.id,result:{saved:true}});
 await assert.rejects(pending,e=>e.code==='OUTCOME_UNKNOWN');bridge.close();
});

test('browser checks deadline after asynchronous revision read before any mutation',async()=>{
 let time=0,invoked=0;const execution=source.slice(source.indexOf('async function executeTask(task){'),source.indexOf('\nasync function tick(){'));
 const scope={Date:{now:()=>time},validateBridgeRequest,bridgeError,W:{id:projectId,mcp:{run:async f=>f()}},E:{unit:'项目整体',mcp:{part:'expansion-x'}},revisions:async()=>{time=101;return {};},localRevisions:()=>({}),validateRevisionSnapshot:()=>{},dirty:()=>false,invoke:async()=>invoked++};
 vm.runInNewContext(execution,scope);
 await assert.rejects(scope.executeTask({...request,deadline:100}),e=>e.code==='TASK_EXPIRED');assert.equal(invoked,0);
});

test('hidden page keeps session; foreground/pageshow/online wake immediately; failed completion only retries receipt',async()=>{
 const handlers={},docHandlers={},scheduled=[];let calls=[],failComplete=true,executions=0;
 const scope={window:{WORKBENCH_PORTABLE:true,addEventListener:(event,fn)=>handlers[event]=fn},document:{visibilityState:'visible',addEventListener:(event,fn)=>docHandlers[event]=fn},W:{id:projectId},E:{mcp:{}},M:{mcp:{}},metadata:()=>({projectId}),setTimeout:fn=>{scheduled.push(fn);return scheduled.length;},clearTimeout:()=>{},setInterval:()=>1,clearInterval:()=>{},executeTask:async()=>{executions++;return {saved:true};},request:async(path)=>{calls.push(path);if(path==='register')return {id:'client',token:'token'};if(path==='poll')return {task:executions?null:{id:'task'}};if(path==='complete'&&failComplete)throw Error('offline');return {};}};
 vm.runInNewContext('let session=null,running=false,stopped=false,polling=false,timer,pendingCompletion=null,released=false;\n'+source.slice(source.indexOf('async function tick(){')),scope);
 const drain=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};await drain();
 assert.equal(executions,1);
 await scope.tick();assert.equal(calls.filter(x=>x==='complete').length,1);assert.equal(executions,1);
 failComplete=false;await scope.tick();assert.equal(calls.filter(x=>x==='complete').length,2);assert.equal(executions,1);
 const before=calls.length;scope.document.visibilityState='hidden';docHandlers.visibilitychange();await drain();assert.equal(calls.length,before);
 scope.document.visibilityState='visible';docHandlers.visibilitychange();await drain();assert.equal(calls.at(-1),'poll');
 handlers.pagehide();const hidden=calls.length;await scope.tick();assert.equal(calls.length,hidden);
 handlers.pageshow();await drain();assert.equal(calls.length,hidden+1);
 handlers.online();await drain();assert.equal(calls.at(-1),'poll');assert.equal(calls.filter(x=>x==='register').length,1);
});

