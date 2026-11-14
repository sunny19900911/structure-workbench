import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {subsectionOutline,readSubsection,replaceSubsection} from '../../expansion-subsections.js';
import {tokens,validateDraft} from '../../expansion-core.js';
import {validateProtectedRewrite,validateBridgeRequest} from '../../mcp-browser-core.js';
import {browserToolDefinitions} from '../../server/mcp-tools.mjs';

const source='章首\r\n4.1 地形\r\n原地形。\r\n\r\n4.2 地层\r\n较长的地层描述 {{p:region}}。\r\n[[table:units]]\r\n[[image:site-plan]]\r\n\r\n4.3 参数\r\n保留原始参数。\r\n4.4 地震\r\n4.4.1 场地\r\n子节内容。';
test('局部修改保留章首、相邻正文、CRLF和全部联动标记，可逆向撤销',()=>{
 const before=readSubsection(source,'4.2');
 const args={subsectionId:'4.2',expectedText:before.text,text:before.text.replace('较长的地层描述','简述')};
 const next=replaceSubsection(source,args);
 assert.equal(next,source.replace('较长的地层描述','简述'));
 assert.equal(replaceSubsection(next,{...args,expectedText:readSubsection(next,'4.2').text,text:before.text}),source);
});
test('父子节边界、无小节章节和章首均可定位',()=>{
 assert.deepEqual(subsectionOutline(source).map(x=>x.id),['intro','4.1','4.2','4.3','4.4','4.4.1']);
 assert.match(readSubsection(source,'4.4').text,/4\.4\.1 场地/);
 assert.equal(readSubsection('无标题正文','body').text,'无标题正文');
 assert.equal(readSubsection(source,'intro').text,'章首\r\n');
});
test('拒绝旧原文、未知或重复编号，不误改第一处匹配',()=>{
 assert.throws(()=>replaceSubsection(source,{subsectionId:'4.2',expectedText:'旧稿',text:'新稿'}),e=>e.code==='TEXT_CONFLICT');
 assert.throws(()=>readSubsection(source,'4.9'),e=>e.code==='SUBSECTION_TARGET');
 const duplicate='4.2 地层\nA\n4.2 地层\nB';
 assert.ok(subsectionOutline(duplicate).every(x=>x.ambiguous));
 assert.throws(()=>readSubsection(duplicate,'4.2'),e=>e.code==='SUBSECTION_TARGET');
});
test('拒绝丢失、重复添加参数及图表，以及改动子标题和插入新标题',()=>{
 const old=readSubsection(source,'4.2').text;
 for(const text of [old.replace('{{p:region}}','地点'),old+'[[table:units]]',old+'\n4.9 新节\n内容'])
  assert.throws(()=>replaceSubsection(source,{subsectionId:'4.2',expectedText:old,text}));
 const nested=readSubsection(source,'4.4').text;
 assert.throws(()=>replaceSubsection(source,{subsectionId:'4.4',expectedText:nested,text:nested.replace('场地','新标题')}));
});
test('空小节写入不粘连后续标题',()=>{
 assert.equal(replaceSubsection('4.1 标题\n4.2 下一节\n内容',{subsectionId:'4.1',expectedText:'',text:'新增正文'}),'4.1 标题\n新增正文\n4.2 下一节\n内容');
 assert.equal(replaceSubsection('4.1 标题',{subsectionId:'4.1',expectedText:'',text:'新增正文'}),'4.1 标题\n新增正文');
});
test('真实业务适配器调用原保存链路并保留另一章及表图数据',async()=>{
 const code=await readFile(new URL('../../expansion-workbench.js',import.meta.url),'utf8');
 const start=code.indexOf('window.ExpansionWorkbench.mcp={'),end=code.indexOf('\n};',start);
 const state={sections:{ground:{text:source,evidence_ids:[]},overview:{text:'其他章'}},parameters:{region:'测试'},facts:[],regulations:[],reportImages:{a:'image'},unitTable:{cells:{a:'value'}}};
 const untouched=structuredClone(state),saves=[];
 const scope={window:{ExpansionWorkbench:{}},state,SECTIONS:[{id:'ground'},{id:'overview'}],subsectionOutline,readSubsection,replaceSubsection,validateProtectedRewrite,tokens,validateDraft,
  ensureEdit:()=>true,recordSection:(id,value)=>{state.sections[id]={...value,previous:state.sections[id]};},save:async()=>saves.push(1)};
 vm.runInNewContext(code.slice(start,end+3),scope);
 const api=scope.window.ExpansionWorkbench.mcp,old=api.subsectionRead({sectionId:'ground',subsectionId:'4.2'});
 const result=await api.subsectionEdit({...old,expectedText:old.text,text:old.text.replace('较长的地层描述','简述')});
 assert.equal(saves.length,1);assert.equal(result.previousText,old.text);
 assert.equal(state.sections.ground.previous.text,source);
 assert.deepEqual(state.sections.overview,untouched.sections.overview);
 assert.deepEqual(state.reportImages,untouched.reportImages);assert.deepEqual(state.unitTable,untouched.unitTable);
 await assert.rejects(api.subsectionEdit({...old,expectedText:old.text,text:'旧读取覆盖'}),e=>e.code==='TEXT_CONFLICT');
 assert.equal(saves.length,1);
});
test('MCP暴露三项工具，写入要求修订号及明确单体，桥接schema可校验',()=>{
 const tools=browserToolDefinitions();
 for(const name of ['outline','subsection_read','subsection_edit'])assert.ok(tools.find(t=>t.name==='workbench_expansion_'+name));
 const edit=tools.find(t=>t.name==='workbench_expansion_subsection_edit');
 assert.ok(edit.inputSchema.required.includes('expectedRevisions'));
 assert.equal(edit.annotations.readOnlyHint,false);
 const request={operation:'expansion.subsection_edit',projectId:'a'.repeat(32),unit:'测试楼',args:{sectionId:'ground',subsectionId:'4.2',expectedText:'A',text:'B'}};
 assert.doesNotThrow(()=>validateBridgeRequest(request));
 delete request.unit;assert.throws(()=>validateBridgeRequest(request),e=>e.code==='UNIT_REQUIRED');
});
