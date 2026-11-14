import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {modelBatch} from '../../expansion-core.js';
import {createBrowserBridge} from '../../server/mcp-browser-bridge.mjs';
const source=await readFile(new URL('../../expansion-workbench.js',import.meta.url),'utf8');
test('MCP partial OUT import fails before replacing the previous model or sources',async()=>{
 const previous={model:{files:['old-wmass.out','old-wzq.out','old-wdisp.out'],metrics:{T1:'old'}},sources:[{source_id:'old'}]};
 const scope={id:'project',busy:false,state:structuredClone(previous),ensureEdit:()=>true,updateMeta:()=>{},notice:()=>{},modelBatch,H:{decode:b=>new TextDecoder().decode(b)},hashBytes:async()=> 'hash',TextEncoder};
 vm.runInNewContext(source.slice(source.indexOf('async function importFiles('),source.indexOf('\nfunction renderUnits()')),scope);
 await assert.rejects(scope.importFiles('yjk',[{name:'wmass.out',size:12,arrayBuffer:async()=>new TextEncoder().encode('model text').buffer}],{requireCompleteModel:true}),e=>e.code==='MODEL_BATCH_INCOMPLETE');
 assert.deepEqual(scope.state,previous);assert.equal(scope.busy,false);
});
test('embedded engine disconnect requires its token and never drops an active task',async()=>{
 const b=createBrowserBridge(),projectId='a'.repeat(32),c=b.register({projectId,host:'blackbox'}),body={clientId:c.id,token:c.token};
 assert.throws(()=>b.disconnect({...body,token:'wrong'}),e=>e.code==='CLIENT_EXPIRED');
 const pending=b.execute({projectId,operation:'project.context',args:{}});assert.throws(()=>b.disconnect(body),e=>e.code==='BROWSER_BUSY');
 const task=b.poll({...body,projectId}).task;b.start({...body,taskId:task.id});b.complete({...body,taskId:task.id,result:{}});await pending;
 assert.equal(b.disconnect(body).closed,true);assert.equal(b.status().clients.length,0);b.close();
});
