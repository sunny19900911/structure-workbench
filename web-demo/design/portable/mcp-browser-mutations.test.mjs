import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {irregularityCategories,setIrregularityAnswer,chooseMeasure,setMeasureDraft} from '../../irregularity-library.js';
import {validateBridgeRequest,bridgeError} from '../../mcp-browser-core.js';
const source=await readFile(new URL('../../expansion-workbench.js',import.meta.url),'utf8');
const start=source.indexOf('window.ExpansionWorkbench.mcp={'),end=source.indexOf('\n};',start)+3;
const clone=value=>JSON.parse(JSON.stringify(value));
test('invalid irregularity choice leaves the existing answer and draft untouched',async()=>{
 const id=irregularityCategories[0].id,state={regularity:{items:{[id]:{answer:'no',drafts:{common:'保留原稿'}}}}},before=clone(state);
 const scope={window:{ExpansionWorkbench:{}},state,clone,ensureEdit:()=>true,setIrregularityAnswer,chooseMeasure,setMeasureDraft,changed:()=>{throw Error('must not reach changed');},save:async()=>{throw Error('must not save');}};
 vm.runInNewContext(source.slice(start,end),scope);
 await assert.rejects(scope.window.ExpansionWorkbench.mcp.regularity({category:id,answer:'yes',choice:'not-a-case'}));
 assert.deepEqual(state,before);
});
const calcSource=await readFile(new URL('../../calculation-book.js',import.meta.url),'utf8');
const calcStart=calcSource.indexOf('window.CalculationBook.mcp={');
function calculation(){
 const state={workbooks:[{key:'jump-column',sheets:[{name:'新表'}]}],workbookKey:'original',sheetName:'原表',edits:{'original::原表':{B2:'98'}},linkedExcel:{workbook:'original',sheet:'原表',edits:{B2:'98'}},sheetData:{old:true}};
 let changed=0;
 const scope={window:{WORKBENCH_PORTABLE:true,WorkbenchProjects:{id:'a'.repeat(32),mode:'blank'},CalculationBook:{}},calcbookState:state,calcbookApiUrl:()=>'/test',calcbookProject:()=>({project_name:'隔离测试'}),fetch:async()=>({ok:true,json:async()=>({formula_count:0,rows:[{cells:[{coordinate:'B2',editable:true},{coordinate:'B6',editable:false}]}]})}),calcbookChanged:()=>changed++,document:{getElementById:()=>{throw Error('must not alter the page on invalid input');}}};
 vm.runInNewContext(calcSource.slice(calcStart),scope);
 return {state,scope,changed:()=>changed};
}
test('invalid Excel cell preserves selected workbook, all edits and linked export',async()=>{const c=calculation(),before=clone(c.state);await assert.rejects(c.scope.window.CalculationBook.mcp.excel({workbook:'jump-column',sheet:'新表',edits:{B6:'1'}}),/不可编辑/);assert.deepEqual(c.state,before);assert.equal(c.changed(),0);});
test('incomplete linked Excel inputs reject before mutating a valid prior link',async()=>{const c=calculation(),before=clone(c.state);await assert.rejects(c.scope.window.CalculationBook.mcp.excel({workbook:'jump-column',sheet:'新表',edits:{B2:'1'},link:true}),/有效正数/);assert.deepEqual(c.state,before);assert.equal(c.changed(),0);});

const bridgeSource=await readFile(new URL('../../mcp-browser-bridge.js',import.meta.url),'utf8');
const execution=bridgeSource.slice(bridgeSource.indexOf('async function executeTask(task){'),bridgeSource.indexOf('\nasync function tick(){'));
test('readonly project context does not flush or save browser drafts',async()=>{
 let flushed=0;const scope={validateBridgeRequest,bridgeError,W:{id:'a'.repeat(32),mcp:{run:async run=>run()},flush:async()=>flushed++},E:{unit:'项目整体'},invoke:async()=>({read:true}),context:async()=>({hasUnsavedChanges:true})};
 vm.runInNewContext(execution,scope);
 const result=await scope.executeTask({projectId:'a'.repeat(32),operation:'project.context',args:{}});
 assert.equal(result.result.read,true);assert.equal(result.context.hasUnsavedChanges,true);assert.equal(flushed,0);
});
test('different explicit unit rejects before invoking a business operation',async()=>{let called=0;const scope={validateBridgeRequest,bridgeError,W:{id:'a'.repeat(32),mcp:{run:async run=>run()}},E:{unit:'A'},invoke:async()=>called++};vm.runInNewContext(execution,scope);await assert.rejects(scope.executeTask({projectId:'a'.repeat(32),operation:'expansion.read',unit:'B',args:{}}),e=>e.code==='UNIT_MISMATCH');assert.equal(called,0);});
