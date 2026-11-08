import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {adoptFact,GLOBAL_KEYS,PROJECT,freshIntake} from '../../intake-core.js';
import {tokens,validateDraft} from '../../expansion-core.js';
import {regulationCategory} from '../../regulation-document.js';
import {validateProtectedRewrite} from '../../mcp-browser-core.js';

// Exercise the real browser business adapters with an isolated synthetic state.
// The VM only replaces DOM/persistence plumbing, never their mutation handlers.
async function adapter(file,name,context){
 const text=await readFile(new URL('../../'+file,import.meta.url),'utf8');
 const prefix='window.'+name+'.mcp={',start=text.indexOf(prefix),end=text.indexOf('\n};',start);
 assert.ok(start>=0&&end>start,'browser MCP adapter exists');
 const scope={window:{[name]:{}},...context};
 vm.runInNewContext(text.slice(start,end+3),scope,{filename:file});
 return scope.window[name].mcp;
}
async function intakeAdapter(){
 const state=freshIntake(),adoptedParameters=[],changes=[];
 state.facts=[{id:'A-height',source_id:'ARCH-A',unit:'A 楼',key:'height_m',value:'20',status:'candidate'},
  {id:'B-height',source_id:'ARCH-B',unit:'B 楼',key:'height_m',value:'30',status:'candidate'},
  {id:'project-region',source_id:'ARCH-PROJECT',unit:PROJECT,key:'region',value:'合成地点',status:'candidate'}];
 const api=await adapter('intake-workbench.js','WorkbenchIntake',{state,PROJECT,GLOBAL_KEYS,adoptFact,
  action:async fn=>fn(),L:{adoptParameters:p=>adoptedParameters.push(p)},updateLocations:()=>{},W:{contentChanged:reason=>changes.push(reason)}});
 return {api,state,adoptedParameters,changes};
}

test('MCP fact adoption rejects another unit before altering candidates or history',async()=>{
 const {api,state,adoptedParameters}=await intakeAdapter(),before=JSON.stringify(state);
 await assert.rejects(api.adopt({factId:'B-height'},'A 楼'),e=>e.code==='UNIT_MISMATCH'&&e.status===409);
 assert.equal(JSON.stringify(state),before);assert.deepEqual(adoptedParameters,[]);
});
test('MCP fact adoption requires an explicit scope even if the file belongs to one unit',async()=>{
 const {api,state}=await intakeAdapter(),before=JSON.stringify(state);
 await assert.rejects(api.adopt({factId:'A-height'}),e=>e.code==='UNIT_MISMATCH');
 assert.equal(JSON.stringify(state),before);
});
test('MCP adoption of a common fact requires the project-wide scope and preserves provenance',async()=>{
 const {api,state,adoptedParameters}=await intakeAdapter();
 await assert.rejects(api.adopt({factId:'project-region'},'A 楼'),e=>e.code==='UNIT_MISMATCH');
 await api.adopt({factId:'project-region'},PROJECT);
 assert.equal(state.facts[2].status,'confirmed');assert.equal(state.facts[2].source_id,'ARCH-PROJECT');
 assert.equal(adoptedParameters.length,1);assert.equal(adoptedParameters[0].region,'合成地点');
});
test('MCP adoption of the intended unit does not change another unit or common parameters',async()=>{
 const {api,state,adoptedParameters}=await intakeAdapter();
 await api.adopt({factId:'A-height'},'A 楼');
 assert.equal(state.facts[0].status,'confirmed');assert.equal(state.facts[1].status,'candidate');assert.equal(state.facts[2].status,'candidate');
 assert.deepEqual(adoptedParameters,[]);assert.equal(state.history.at(-1).source_id,'ARCH-A');
});

async function expansionAdapter({text='本项目地点 {{p:region}}。\n[[table:units]]\n[[image:site-plan]]\n[[measures:regularity]]',referenceNorms}={}){
 const state={identity:{unit:'A 楼'},parameters:{region:'合成地点'},facts:[],sections:{overview:{text,manual:true,evidence_ids:[]}},regulations:[],history:[],...(referenceNorms?{referenceNorms}:{} )};
 const api=await adapter('expansion-workbench.js','ExpansionWorkbench',{state,ensureEdit:()=>true,SECTIONS:[{id:'overview'}],tokens,validateDraft,validateProtectedRewrite,regulationCategory,
  recordSection:(key,value)=>{state.sections[key]=value;},save:async()=>{},clone:structuredClone,uuid:()=> 'reg-1',changed:()=>{}});
 return {api,state};
}
test('MCP chapter editing preserves every existing table, image and measure insertion marker',async()=>{
 for(const marker of ['[[table:units]]','[[image:site-plan]]','[[measures:regularity]]']){
  const {api,state}=await expansionAdapter(),before=JSON.stringify(state),old=state.sections.overview.text;
  await assert.rejects(api.edit({sectionId:'overview',expectedText:old,text:old.replace(marker,'')}));
  assert.equal(JSON.stringify(state),before,'failed edit must leave the chapter unchanged');
 }
});
test('MCP chapter rewriting with retained markers remains editable and preserves parameter links',async()=>{
 const {api,state}=await expansionAdapter(),old=state.sections.overview.text,next=old.replace('本项目地点','本工程建设地点');
 await api.edit({sectionId:'overview',expectedText:old,text:next});
 assert.equal(state.sections.overview.text,next);assert.equal(state.sections.overview.manual,true);assert.match(next,/\{\{p:region\}\}/);
});
test('MCP regulation update does not claim success while a custom national/local table hides the new row',async()=>{
 for(const category of ['local','national']){
  const {api,state}=await expansionAdapter({referenceNorms:{[category]:[['人工保留目录','DB-OLD']]}}),before=JSON.stringify(state);
  await assert.rejects(api.regulation({title:'新规范',code:'DB-NEW',source_id:'S-NEW',category}));
  assert.equal(JSON.stringify(state),before,'custom table and underlying records stay intact on refusal');
 }
});
