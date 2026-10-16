import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileSection,resolveAutomatic,autoParameterUpdates} from '../../workflow-core.js';
import {defaultExpansion} from '../../default-expansion.js';
import {createState,SECTIONS,resolveText} from '../../expansion-core.js';
import {sectionBlocks,blocksHTML} from '../../reference-report.js';
test('资料更新保留人工稿，保存局部建议；保留人工稿后相同输入不重复提示',()=>{
 const draft={text:'初稿',kind:'template',manual:false};const baseline=reconcileSection(null,draft,'初稿');
 const edited={...baseline,text:'人工结论',manual:true};const updated=reconcileSection(edited,{...draft,text:'新资料'},'新资料');
 assert.equal(updated.text,'人工结论');assert.equal(updated.pendingAuto.draft.text,'新资料');
 const kept=resolveAutomatic(updated,false);assert.equal(kept.text,'人工结论');assert.equal(kept.pendingAuto,undefined);
 assert.equal(reconcileSection(kept,{...draft,text:'新资料'},'新资料'),kept);
 const adopted=resolveAutomatic(updated,true);assert.equal(adopted.text,'新资料');assert.equal(adopted.previous.text,'人工结论');
});
test('资料删除清空自动采用值但保留人工值；冲突返回集中处理',()=>{
 assert.deepEqual(autoParameterUpdates({}, {region:'原地点'}, {region:'原地点'}).updates,{region:''});
 const r=autoParameterUpdates({region:'新地点'},{region:'人工地点'},{region:'原地点'});
 assert.deepEqual(r.updates,{});assert.equal(r.conflicts[0].current,'人工地点');
});
test('修改风压只更新有关章节，未受影响章节对象及人工内容不变',()=>{
 const state=createState({projectName:'验证',unit:'项目整体'});state.referenceTemplate=true;state.parameters={wind:'0.30'};state.document={units:[],sourceIds:[]};
 const render=sid=>{const draft=defaultExpansion(state,sid);return [draft,blocksHTML(sectionBlocks(state,sid,resolveText(draft.text,state)))];};
 for(const sec of SECTIONS)state.sections[sec.id]=reconcileSection(null,...render(sec.id));
 const old={...state.sections};state.parameters.wind='0.45';const changed=[];
 for(const sec of SECTIONS){state.sections[sec.id]=reconcileSection(old[sec.id],...render(sec.id));if(state.sections[sec.id]!==old[sec.id])changed.push(sec.id);}
 assert.ok(changed.includes('loads'));assert.ok(changed.length<SECTIONS.length);assert.equal(state.sections.ground,old.ground);
});
