import test from 'node:test';
import assert from 'node:assert/strict';
import {materialSummary} from '../../module-integration-core.js';
import {steelPresentation,renderMaterialTables,materialCsvRows} from '../../steel-material-view.js';

test('构件归类保留未知值，单方按对应面积和总面积计算',()=>{
  const t=materialSummary({rebar:[{floor:1,area:100,rows:[{cat:'墙梁',total:1000},{cat:'边缘构件',total:500},{cat:'板',total:0},{cat:'特殊构件',total:300}]},{floor:2,area:300,rows:[{cat:'梁',total:6000},{cat:'墙身',total:100}]}]});
  const p=steelPresentation(t);
  assert.equal(p.floors[0].rates.beam,10);
  assert.equal(p.components.find(c=>c.key==='beam').rate,17.5);
  assert.equal(p.components.find(c=>c.key==='wall').rate,1.5);
  assert.equal(p.floors[0].rates.slab,0);
  assert.equal(p.floors[1].rates.slab,null);
  assert.equal(p.components.find(c=>c.key==='other').rate,.75);
  assert.equal(p.components.reduce((sum,c)=>sum+(c.kg||0),0),t.kg);
  const csv=materialCsvRows(t,'A');
  assert.equal(csv[1][3],10);
  assert.equal(csv.at(-1)[3],17.5);
  assert.match(renderMaterialTables(t),/梁\(kg\/m²\)/);
});
test('空白单体不产生样本图，面积缺失不输出零单方',()=>{
  const empty=materialSummary();
  assert.equal(steelPresentation(empty).floors.length,0);
  assert.doesNotMatch(renderMaterialTables(empty),/im-floor-chart/);
  const t=materialSummary({rebar:[{floor:1,area:0,rows:[{cat:'梁',total:1000}]},{floor:2,area:100,rows:[{cat:'梁',total:1000}]}]});
  const p=steelPresentation(t);
  assert.equal(p.floors[0].rates.beam,null);
  assert.equal(p.components[0].rate,null);
  assert.equal(materialCsvRows(t,'B')[1][2],null);
});
test('显示原始构件名称时转义HTML，单体输入和图表不互相污染',()=>{
  const t=materialSummary({up:{floors:[{floor:1,area:100,total:2,comp:[{name:'<img onerror=x>',sum:2}]}]}});
  const before=JSON.stringify(t);
  assert.match(renderMaterialTables(t),/&lt;img onerror=x&gt;/);
  assert.equal(JSON.stringify(t),before);
  assert.equal(steelPresentation(materialSummary()).components[0].kg,null);
});
