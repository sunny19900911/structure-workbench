import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCafeteriaSlides,templatePages} from './cafeteria-core.js';
const table=(pages,n,id)=>pages[n-1].shapes.find(s=>s.kind==='table'&&s.id===id);
test('native template clears historic project values and retains blank manual sections',()=>{
  const pages=buildCafeteriaSlides();assert.equal(pages.length,25);
  const all=JSON.stringify(pages);assert.doesNotMatch(all,/云南旅游|1#食堂|700×700/);
  assert.equal(pages[9].shapes.find(s=>s.field==='notes').text,'');
  assert.equal(pages[19].shapes.find(s=>s.field==='components').text,'框架柱：\n框架梁：\n次梁：\n板厚：\n超限判断：');
  assert.equal(pages[17].title,'特殊转换');assert.equal(pages.flatMap(p=>p.slots).length,31);
});
test('parameter tables update while manual narrative is retained',()=>{
  const snapshot={params:{design_life:'50',intensity:'8',pga:'0.20g',alpha_max:'多遇 0.16；罕遇 0.9'}};
  const note=templatePages[9].shapes.find(s=>s.field==='notes');
  const edits={[`cafeteria-v1:10:${note.id}`]:'柱底节点需专项处理。'};
  let pages=buildCafeteriaSlides(snapshot,'',edits);
  assert.equal(table(pages,8,'12').rows[1][1].text,'50年');
  assert.equal(table(pages,8,'10').rows[5][1].text,'多遇 0.16；罕遇 0.9');
  snapshot.params.intensity='7';pages=buildCafeteriaSlides(snapshot,'',edits);
  assert.equal(table(pages,8,'10').rows[1][1].text,'7度（0.20g）');
  assert.equal(pages[9].shapes.find(s=>s.field==='notes').text,'柱底节点需专项处理。');
});
test('single unit uses expansion floors and unit-specific structure/grades; many units fit original frame',()=>{
  const units=Array.from({length:24},(_,i)=>({key:`楼${i}`,name:`楼${i}`,floors:'3',parameters:{struct_sys:'框架',g_frame:'二级'}}));
  const snapshot={report:{units},units:units.map(u=>({name:u.name,parameters:u.parameters}))};
  const one=buildCafeteriaSlides(snapshot,'楼2');
  assert.deepEqual(table(one,7,'6').rows[1].map(c=>c.text),['楼2','框架','3','','']);
  assert.equal(table(one,9,'3').rows[2][2].text,'二级');
  for(const [n,id] of [[7,'6'],[9,'3']]){const t=table(buildCafeteriaSlides(snapshot),n,id);assert.ok(t.heights.reduce((a,b)=>a+b,0)<=t.box[3]+.01);}
});
test('concrete uses above-ground and underground component rows independently',()=>{
  const report={concrete:[['1','地下室楼板','C35'],['2','框架柱','C50~C60']],concreteMeasures:[['构件','部位','等级'],['楼盖（梁、板）','地上','C30'],['','地下','C35'],['框架柱','纯地下室车库','C35'],['','地上及投影范围内车库','C50~C60']]};
  const rows=table(buildCafeteriaSlides({report}),11,'3').rows;
  assert.equal(rows[6][2].text,'C30');assert.equal(rows[4][2].text,'C50~C60');assert.equal(rows[7][2].text,'C50~C60');
});
