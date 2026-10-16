import test from 'node:test';
import assert from 'node:assert/strict';
import {reportTable,editReportCell,nativeTableHTML,sectionBlocks} from '../../reference-report.js';
import {dependencies} from '../../expansion-core.js';

const fresh=()=>({parameters:{pile:'甲级',intensity:'8'},document:{units:[]},regulations:[],templateTables:{floor:[['类别','值'],['教室','2.5'],['走廊','3.5']]}});
test('桩基两个等级取同一措施值，地震、荷载和材料联动格蓝色加粗且可编辑',()=>{
 const s=fresh(),read=()=>Object.fromEntries(reportTable(s,'classification').rows.map(r=>r.values));
 assert.equal(read()['建筑桩基设计等级'],'甲级');assert.equal(read()['桩基结构安全等级'],'甲级');
 s.parameters.pile='乙级';assert.equal(read()['桩基结构安全等级'],'乙级');
 for(const key of ['classification','earthquake','floor','concrete']){
  const table=reportTable(s,key),html=nativeTableHTML(table,{editCells:true,web:true});
  assert.match(html,/contenteditable="true"/);assert.match(html,/class="ev-linked"/);
  assert.doesNotMatch(nativeTableHTML(table),/contenteditable|ev-linked|data-table-/);
 }
});
test('人工文字和空值保存后可恢复，其他格继续联动；上游插入行不移错人工稿',()=>{
 const s=fresh(),r=reportTable(s,'floor').rows[1],before=dependencies(s);
 assert.ok(editReportCell(s,'floor',r.rowKey,1,''));assert.notEqual(dependencies(s),before);
 let table=reportTable(JSON.parse(JSON.stringify(s)),'floor');assert.equal(table.rows[1].values[1],'');assert.equal(table.rows[1].links[1],'');
 s.templateTables.floor.splice(1,0,['大厅','3.0']);s.templateTables.floor[3][1]='4.0';
 table=reportTable(s,'floor');assert.equal(table.rows[1].values[1],'3.0');assert.equal(table.rows[2].values[1],'');assert.equal(table.rows[3].values[1],'4.0');
 assert.equal(sectionBlocks(s,'loads','[[table:floor]]')[1].rows[2].values[1],'');
 s.signed={at:'test'};assert.equal(editReportCell(s,'floor',r.rowKey,1,'9'),false);
});
test('规范单元格修改同步既有地方规范记录，撤回旧确认，不另建副本',()=>{
 const s=fresh();s.regulations=[{id:'test',title:'地方规范',code:'DBJ-TEST',selected:true,review:'confirmed',status:'current'}];
 const r=reportTable(s,'local').rows[1];assert.ok(editReportCell(s,'local',r.rowKey,0,'编辑后的地方规范'));
 assert.equal(s.regulations[0].title,'编辑后的地方规范');assert.equal(s.regulations[0].review,'candidate');assert.equal(s.referenceNorms,undefined);
});
test('指标表的合并单元格仍保留，手工数值进入导出数据',()=>{
 const s=fresh(),r=reportTable(s,'metrics').rows[21];
 editReportCell(s,'metrics',r.rowKey,2,'53.12');
 const result=reportTable(s,'metrics');assert.equal(result.rows[21].values[2],'53.12');
 assert.match(nativeTableHTML(result,{editCells:true,web:true}),/rowspan="[2-9]/);
 assert.equal(sectionBlocks(s,'model','[[table:metrics]]')[1].rows[21].values[2],'53.12');
});
