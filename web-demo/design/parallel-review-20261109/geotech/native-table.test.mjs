import test from 'node:test';
import assert from 'node:assert/strict';
import {geotechNativeTable,geotechRetainedNativeTable} from '../../../geotech-native-table.js';
import {geotechCorrosionRecords,geotechPermeabilityRecords} from '../../../geotech-tables.js';
test('permeability table requires an explicit unit in the value or header',()=>{
 const rows=[['岩土名称','渗透系数','渗透性'],['黏土','0.01～0.04m/d','弱透水']];
 assert.equal(geotechNativeTable({blocks:{tables:[rows]}},0).headerRows,1);
 assert.equal(geotechPermeabilityRecords([rows[0],['黏土','0.01～0.04','弱透水']]),null);
 assert.equal(geotechPermeabilityRecords([['岩土名称','渗透系数(m/d)','渗透性'],['黏土','0.01～0.04','弱透水']])[0].fields[1].value,'0.01～0.04');
 assert.equal(geotechPermeabilityRecords([rows[0],['黏土','0.01～0.04MPa','弱透水']]),null);
});
test('native corrosion headers stop before explicit limits and do not infer a sample from header comparisons',()=>{
 const rows=[['内容','混凝土腐蚀性','混凝土腐蚀性'],['内容','SO4(mg/L)','Mg(mg/L)'],
  ['《规范》微腐蚀性规定','<300','<2000'],['水样','120.8','32.09']];
 const s={blocks:{tables:[rows]}};
 assert.equal(geotechNativeTable(s,0).headerRows,2);
 assert.deepEqual(geotechNativeTable(s,0).rows,rows);
 assert.equal(geotechCorrosionRecords(rows.slice(0,3)),null);
 assert.equal(geotechCorrosionRecords(rows.map((r,i)=>i===2?['试验条件','<300','<2000']:r)),null);
});
test('sample-only corrosion result tables keep two header levels and reject unlabelled grade lists',()=>{
 const rows=[['试样编号','类型','混凝土腐蚀性','混凝土腐蚀性'],['试样编号','类型','环境类型','渗透性'],['ZK45-S','上层滞水','微','弱']];
 assert.equal(geotechNativeTable({blocks:{tables:[rows]}},0).headerRows,2);
 assert.equal(geotechCorrosionRecords(rows.map((r,i)=>i===2?['示例','水','微','弱']:r)),null);
 assert.equal(geotechCorrosionRecords(rows.map((r,i)=>i===0?['项目','类型','混凝土腐蚀性','混凝土腐蚀性']:r)),null);
});
test('Word spans preserve vertical and horizontal merges without merging equal independent values',()=>{
 const s={source_id:'original',hash:'hash',blocks:{tables:[[['土层','桩型','桩型'],['土层','侧阻(kPa)','端阻(kPa)'],['①','20','20']]],tableMeta:[{rows:[{cells:[{column:0,span:1,verticalMerge:'restart'},{column:1,span:2}]},{cells:[{column:0,span:1,verticalMerge:'continue'},{column:1,span:1},{column:2,span:1}]},{cells:[{column:0,span:1},{column:1,span:1},{column:2,span:1}]}]}]}};
 const before=JSON.stringify(s),t=geotechNativeTable(s,0);
 assert.equal(t.cells.find(c=>c.text==='土层').rowSpan,2);assert.equal(t.cells.find(c=>c.text==='桩型').colSpan,2);
 assert.equal(t.cells.filter(c=>c.text==='20').length,2);assert.equal(JSON.stringify(s),before);
 s.blocks.tableMeta[0].rows[0].cells[0].verticalMerge='';assert.throws(()=>geotechNativeTable(s,0),/缺少对应起点/);
});
test('PDF geometry must form rectangles with identical expanded values',()=>{
 const s={blocks:{tables:[[['A','A'],['x','y']]],tableMeta:[{cellOrigins:[[{bbox:[0,0,2,1]},{bbox:[0,0,2,1]}],[{bbox:[0,1,1,2]},{bbox:[1,1,2,2]}]]}]}};
 assert.equal(geotechNativeTable(s,0).cells[0].colSpan,2);
 s.blocks.tables[0][0][1]='B';assert.throws(()=>geotechNativeTable(s,0),/值不一致/);
});
test('explicit continuation inherits its accepted header with separate header/body cell provenance',()=>{
 const rows=[['腐蚀介质','实测值'],['Cl','20']],tail=[['Mg','30']];
 const s={source_id:'original',blocks:{tables:[rows,tail],tableMeta:[{}, {continuationOf:0}]}};
 const accepted=[{key:'source-1',rows},{key:'source-2',rows:[rows[0],...tail],inheritedHeaders:1,headerSource:1}];
 const before=JSON.stringify(s),t=geotechRetainedNativeTable(s,accepted[1],accepted);
 assert.equal(t.headerRows,1);assert.deepEqual(t.rows,accepted[1].rows);
 assert.deepEqual(t.cells.find(c=>c.text==='实测值').sourceCell,{source_id:'original',table:1,row:1,column:2});
 assert.deepEqual(t.cells.find(c=>c.text==='30').sourceCell,{source_id:'original',table:2,row:1,column:2});
 assert.equal(JSON.stringify(s),before);
 assert.throws(()=>geotechRetainedNativeTable(s,accepted[1],[accepted[1]]),/未通过章节筛选/);
 s.blocks.tableMeta[1].continuationOf=1;assert.throws(()=>geotechRetainedNativeTable(s,accepted[1],accepted),/来源不一致/);
});
test('continuation rejects conflicting restored values instead of silently substituting predecessor data',()=>{
 const s={blocks:{tables:[[['项目','值'],['甲','1']],[['乙','2']]],tableMeta:[{}, {continuationOf:0}]}};
 const accepted=[{key:'source-1',rows:s.blocks.tables[0]},{key:'source-2',rows:[['项目','值'],['乙','999']],inheritedHeaders:1,headerSource:1}];
 assert.throws(()=>geotechRetainedNativeTable(s,accepted[1],accepted),/网格.*不一致/);
});
