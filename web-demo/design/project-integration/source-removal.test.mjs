import test from 'node:test';
import assert from 'node:assert/strict';
import {freshIntake,sourceRemoval,removeSource,restoreSource,mergeCandidates,PROJECT} from '../../intake-core.js';
const make=()=>{const s=freshIntake();s.sources=[{source_id:'A',name:'旧建筑.doc',slot:'bldg',fragments:[]},{source_id:'B',name:'地勘.doc',slot:'geo',fragments:[]}];s.facts=[{id:'a',source_id:'A',unit:PROJECT,key:'project_code',value:'OLD',status:'confirmed'},{id:'b',source_id:'B',unit:PROJECT,key:'site_class',value:'II类',status:'confirmed'}];return s;};
test('移除来源及候选，清空仍由该资料支持的采用值；其他文件不受影响，可恢复并重新导入',()=>{
  const s=make(),p=sourceRemoval(s,'A',{project_code:'OLD',site_class:'II类'});assert.deepEqual(p.clear,{project_code:''});
  const record=removeSource(s,p);assert.deepEqual(s.facts.map(f=>f.id),['b']);assert.equal(s.sources.length,1);
  restoreSource(s,record.id);assert.equal(s.facts.find(f=>f.id==='a').status,'candidate');assert.equal(s.removedSources.length,0);
  removeSource(s,sourceRemoval(s,'A',{}));mergeCandidates(s,{source_id:'A',name:'旧建筑.doc',fragments:[]},[{id:'a',source_id:'A',status:'candidate'}]);assert.equal(s.sources.filter(x=>x.source_id==='A').length,1);
});
test('保留手改参数和其他来源支持的同值参数',()=>{
  const s=make();assert.deepEqual(sourceRemoval(s,'A',{project_code:'MANUAL'}).retained,['project_code']);assert.deepEqual(sourceRemoval(s,'A',{project_code:'MANUAL'}).clear,{});
  s.facts.push({...s.facts[0],id:'shared',source_id:'B'});assert.deepEqual(sourceRemoval(s,'A',{project_code:'OLD'}).clear,{});
});
test('移除独占地点查表结果，保留其他资料共用查表；相关方案重新待确认',()=>{
  const s=make();s.sources.push({source_id:'LOOKUP-X',slot:'lookup',fragments:[{locator:'地点X'}]});s.facts.push({id:'wind',source_id:'LOOKUP-X',slot:'lookup',unit:PROJECT,key:'wind',value:'0.4',status:'confirmed'},{id:'decision',source_id:'DECISION-X',unit:'A楼',key:'struct_sys',value:'框架',status:'confirmed'});
  s.locationQueries=[{source_id:'A',matches:[{label:'地点X'}]}];s.suggestions={a:{}};
  const p=sourceRemoval(s,'A',{wind:'0.4'});assert.equal(p.clear.wind,'');removeSource(s,p);assert.ok(!s.facts.some(f=>f.id==='wind'));assert.equal(s.facts.find(f=>f.id==='decision').status,'candidate');assert.deepEqual(s.suggestions,{});
  const shared=make();shared.sources.push({source_id:'LOOKUP-X',slot:'lookup',fragments:[{locator:'地点X'}]});shared.locationQueries=[{source_id:'A',matches:[{label:'地点X'}]},{source_id:'B',matches:[{label:'地点X'}]}];assert.deepEqual(sourceRemoval(shared,'A').sources.map(x=>x.source_id),['A']);
});
