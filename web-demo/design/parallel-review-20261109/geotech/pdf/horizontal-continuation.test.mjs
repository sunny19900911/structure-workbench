import test from 'node:test';
import assert from 'node:assert/strict';
import {joinHorizontalBuildingTables,restoreHorizontalContinuations} from './horizontal-continuation.mjs';
const fragment=(left,column,cuts,rows)=>({kind:'table',page:3,column,bbox:[left,20,left+100,20+rows.length*10],gridExpanded:true,rows,rawRows:structuredClone(rows),cellOrigins:rows.map((row,ri)=>row.map((text,ci)=>({text,row:ri,column:ci,bbox:[left+cuts[ci],20+ri*10,left+cuts[ci+1],30+ri*10]})))});
const pair=()=>[fragment(0,0,[0,20,40,80,100],[['建筑物名称','甲楼','乙楼','丙楼'],['基础埋深(m)','1.8','2.3','4.8']]),fragment(200,1,[0,20,40,60,80,100],[['基础持力层','④','⑤','⑥','⑦'],['基础形式','独立基础','独立基础','筏基','筏基']])];
test('adjacent horizontal schedules align existing subdivisions with merged original cells',()=>{
 const [a,b]=pair(),original=JSON.stringify([a,b]),joined=joinHorizontalBuildingTables(a,b);
 assert.deepEqual(joined.rows[0],['建筑物名称','甲楼','乙楼','乙楼','丙楼']);
 assert.deepEqual(joined.rows[1],['基础埋深(m)','1.8','2.3','2.3','4.8']);
 assert.deepEqual(joined.rows[2],b.rows[0]);assert.equal(joined.sourceFragments.length,2);
 assert.equal(joined.cellOrigins[0][2].bbox.join(','),joined.cellOrigins[0][3].bbox.join(','));
 assert.equal(JSON.stringify([a,b]),original);
});
test('withheld numeric values and original coordinates remain withheld across reconstructed columns',()=>{
 const [a,b]=pair();a.cellOrigins[1][2]={...a.cellOrigins[1][2],text:'',requiresReview:true,unreviewedText:'23.45'};a.rows[1][2]='';a.numericBoundaryWarnings=[{text:'23.45',reason:'review'}];
 const joined=joinHorizontalBuildingTables(a,b);assert.deepEqual(joined.rows[1].slice(2,4),['','']);assert.equal(joined.cellOrigins[1][3].unreviewedText,'23.45');assert.equal(joined.numericBoundaryWarnings.length,1);
});
test('different headings, incompatible geometry, pages and intervening text do not get joined',()=>{
 const [a,b]=pair();assert.equal(joinHorizontalBuildingTables(a,{...b,page:4}),null);
 const unrelated=structuredClone(b);unrelated.rows[0][0]='另一表的地层';assert.equal(joinHorizontalBuildingTables(a,unrelated),null);
 const shifted=fragment(200,1,[0,25,45,65,85,100],b.rows);assert.equal(joinHorizontalBuildingTables(a,shifted),null);
 assert.equal(restoreHorizontalContinuations([a,{kind:'paragraph',text:'新表'},b]).length,3);
});
