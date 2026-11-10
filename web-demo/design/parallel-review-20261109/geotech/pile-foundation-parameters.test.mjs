import test from 'node:test';
import assert from 'node:assert/strict';
import {detailedGeotech} from '../../../geotech-document.js';
function source(task=false){
 const paras=task?['1 勘察任务','1.1 桩基础设计参数','要求提供桩基参数。']:['4 桩基础','4.3.2 桩基础设计参数','按地区经验提出以下建议值。','预制桩填土负摩阻力系数取0.40，灌注桩填土取0.30。','桩基设计参数表 表4.3.2'];
 return {name:'report.pdf',source_id:'fixture',blocks:{paras,tables:[[['土层编号','土层名称','混凝土预制桩','钻孔灌注桩'],['土层编号','土层名称','极限侧阻力标准值qsik(kPa)','极限侧阻力标准值qsik(kPa)'],['（2）','粉质黏土','25','22']]],tableMeta:[{}],ordered:[...paras.map((_,index)=>({type:'p',index})),{type:'table',index:0}],pdfReadReport:{paragraphsReflowed:true}}};
}
test('pile foundation parameter heading retains source table and qualified recommendations',()=>{
 for(const name of ['report.pdf','report.docx']){
  const s=source();s.name=name;const d=detailedGeotech(s);
  assert.ok(d.tables.some(t=>t.key==='source-1'));
  assert.match(d.text,/负摩阻力系数取0.40/);assert.match(d.text,/灌注桩填土取0.30/);
  assert.deepEqual(d.tables.find(t=>t.key==='source-1').rawRows,s.blocks.tables[0]);
 }
});
test('same heading within investigation task does not admit requested results',()=>{
 const d=detailedGeotech(source(true));assert.ok(!d.tables.some(t=>t.key==='source-1'));assert.doesNotMatch(d.text,/要求提供/);
});
