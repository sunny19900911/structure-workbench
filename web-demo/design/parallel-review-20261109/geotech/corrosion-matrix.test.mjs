import test from 'node:test';
import assert from 'node:assert/strict';
import {geotechCorrosionMatrixRecords} from '../../../geotech-tables.js';
import {detailedGeotech} from '../../../geotech-document.js';

function fixture(){
 const physical=[
  [['场地环境类型',1],['Ⅱ类',4]],
  [['腐蚀介质',1],['SO42-',1],['NH4+',2],['总矿化度',1]],
  [['介质含量(mg/kg)',1],['20～180',1],['0.2～4.0',2],['/',1]],
  [['腐蚀等级',1],['微',1],['微',2],['/',1]],
  [['1、按环境类型土对混凝土结构的腐蚀性评价',1],['微',4]],
  [['PH值',1],['B（弱透水土层）',2],['5.1～7.7',2]],
  [['2、按地层渗透性土对混凝土结构的腐蚀性评价',1],['微',4]],
  [['土中的Cl-含量(mg/kg)',1],['B',2],['7.1～35.6',2]],
  [['3、土对钢筋混凝土结构中钢筋的腐蚀性评价',1],['微',4]],
  [['4、土对钢结构的腐蚀性评价',1],['PH值5.1～7.7',4]],
  [['4、土对钢结构的腐蚀性评价',1],['弱',4]]
 ];
 const rows=physical.map(row=>row.flatMap(([text,span])=>Array(span).fill(text)));
 const meta={rows:physical.map(row=>{let column=0;return {cells:row.map(([text,span])=>{const c={text,span,column,verticalMerge:''};column+=span;return c;})};})};
 meta.rows[9].cells[0].verticalMerge='restart';meta.rows[10].cells[0].verticalMerge='continue';meta.rows[10].cells[0].text='';
 return {rows,meta};
}
test('row-local labels separate pH and chloride from ion headers using real cell spans',()=>{
 const {rows,meta}=fixture(),before=structuredClone({rows,meta}),records=geotechCorrosionMatrixRecords(rows,meta);
 assert.equal(records.find(r=>r.index===5).fields.find(c=>c.label==='PH值').value,'5.1～7.7');
 assert.equal(records.find(r=>r.index===7).fields.find(c=>c.label==='土中的Cl-含量(mg/kg)').value,'7.1～35.6');
 assert.equal(records.find(r=>r.index===2).fields.filter(c=>c.label.includes('NH4+')).length,1);
 assert.equal(records.find(r=>r.index===10).fields[0].value,'弱');
 assert.ok(records.filter(r=>r.index>=4).every(r=>r.fields.every(c=>!c.label.includes('SO42-')&&!c.label.includes('NH4+'))));
 assert.deepEqual({rows,meta},before);
});
test('no merge inferred from equal values, incomplete geometry or changed column spans',()=>{
 const {rows,meta}=fixture();assert.equal(geotechCorrosionMatrixRecords(rows,{}),null);
 const broken=structuredClone(meta);broken.rows[5].cells[1].span=3;
 assert.equal(geotechCorrosionMatrixRecords(rows,broken),null);
 const wrong=structuredClone(rows);wrong[5][1]='C';assert.equal(geotechCorrosionMatrixRecords(wrong,meta),null);
 assert.equal(geotechCorrosionMatrixRecords([['腐蚀介质','含量'],['SO4','10']],{}),null);
});
test('real composition emits local pH/Cl readings and preserves all raw source rows',()=>{
 const {rows,meta}=fixture();const paras=['4 水文地质条件','场地土腐蚀性评价表 表7'];
 const s={name:'report.docx',source_id:'fixture',blocks:{paras,tables:[rows],tableMeta:[meta],ordered:[{type:'p',index:0},{type:'p',index:1},{type:'table',index:0}]}};
 const doc=detailedGeotech(s);assert.match(doc.text,/PH值：5.1～7.7/);
 assert.match(doc.text,/土中的Cl-含量\(mg\/kg\)：7.1～35.6/);
 assert.doesNotMatch(doc.text,/SO42-：B|NH4\+：5.1/);
 assert.deepEqual(doc.tables.find(t=>t.key==='source-1').rawRows,rows);
});
