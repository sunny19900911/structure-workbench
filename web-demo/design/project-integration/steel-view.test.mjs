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
  const t=materialSummary({firstFloorArea:100,base:{rows:[{name:'<img onerror=x>',sum:2}]}});
  const before=JSON.stringify(t);
  assert.match(renderMaterialTables(t),/&lt;img onerror=x&gt;/);
  assert.equal(JSON.stringify(t),before);
  assert.equal(steelPresentation(materialSummary()).components[0].kg,null);
});

test('钢筋总量换算为吨，网页与CSV一致，单方仍用kg/m²',()=>{
  const t=materialSummary({rebar:[{floor:1,area:100,rows:[{cat:'梁',total:1250}]},{floor:2,area:300,rows:[{cat:'板',total:750}]}]});
  assert.equal(t.tonnes,2);
  assert.equal(t.steelRate,5);
  const rows=materialCsvRows(t,'A'),col=rows[0].indexOf('钢筋总量(t)');
  assert.equal(rows[1][col],1.25);
  assert.equal(rows[2][col],.75);
  assert.equal(rows.at(-1)[col],2);
  const html=renderMaterialTables(t);
  assert.match(html,/钢筋总量\(t\)/);
  assert.match(html,/>1\.250</);
  assert.doesNotMatch(html,/钢筋总量\(kg\)/);
});

test('基础单方只除首层面积，上部混凝土仅展示单方',()=>{
  const t=materialSummary({up:{floors:[{floor:-1,area:800,total:80,comp:[{name:'柱',sum:80}]},{floor:1,area:200,total:100,comp:[{name:'柱',sum:100}]},{floor:2,area:400,total:120,comp:[{name:'柱',sum:120}]}]},base:{rows:[{name:'承台',sum:60},{name:'筏板',sum:40},{name:'合计',sum:100}]}});
  assert.equal(t.foundation,100);
  assert.equal(t.firstFloorArea,200);
  assert.equal(t.foundationRate,.5);
  assert.equal(t.concreteRate,300/1400);
  const html=renderMaterialTables(t),upper=html.split('<summary>上部混凝土单方量</summary>')[1].split('</details>')[0];
  assert.doesNotMatch(upper,/合计\(m³\)|混凝土量\(m³\)|>300\.000</);
  const csv=materialCsvRows(t,'A');
  assert.equal(csv.at(-1)[csv[0].indexOf('基础混凝土单方量(m³/m²)')],.5);
  assert.equal(csv.at(-1)[csv[0].indexOf('首层面积(m²)')],200);
  assert.ok(csv.slice(1,-1).every(r=>r.at(-1)===null));
});

test('首层面积缺失、无效或冲突不猜测，手动补填可恢复且不串单体',()=>{
  const input={base:{rows:[{name:'筏板',sum:60}]},rebar:[{floor:2,area:100,rows:[]}]};
  assert.equal(materialSummary(input).foundationRate,null);
  input.rebar.push({floor:1,area:100,rows:[]});
  input.up={floors:[{floor:1,area:120,total:0,comp:[]}]};
  assert.equal(materialSummary(input).foundationRate,null);
  assert.ok(materialSummary(input).warnings.includes('首层面积不一致，请补填首层面积'));
  for(const firstFloorArea of [0,-1,'bad',Infinity])assert.equal(materialSummary({...input,firstFloorArea}).foundationRate,null);
  const saved=JSON.parse(JSON.stringify({...input,firstFloorArea:150}));
  assert.equal(materialSummary(saved).foundationRate,.4);
  assert.equal(materialSummary(input).foundationRate,null);
  assert.equal(materialSummary({firstFloorArea:100}).foundationRate,null);
  assert.equal(materialSummary({firstFloorArea:100,base:{rows:[{name:'筏板',sum:0}]}}).foundationRate,0);
  assert.equal(materialSummary({...input,firstFloorArea:''}).foundationRate,null);
});
