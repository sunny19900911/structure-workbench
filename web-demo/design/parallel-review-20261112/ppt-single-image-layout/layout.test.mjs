import test from 'node:test';
import assert from 'node:assert/strict';
import {cafeteriaTemplate} from '../../ppt-template/cafeteria-template.js';
import {buildCafeteriaSlides,templatePages} from '../../parallel-tasks/06-ppt-report/cafeteria-core.js';
import {singleImageLayoutId} from '../../parallel-tasks/06-ppt-report/single-image-layout.js';
import {restorePptDraft,serializePptDraft} from '../../parallel-tasks/06-ppt-report/ppt-draft.js';
import {matchImageFiles,reportImageAliases} from '../../../office-ppt-assets.js';
const oldKey=(n,i=0)=>`${n-1}-${cafeteriaTemplate.pages[n-1].slots[i]}`;
test('27 pages retain first 11 templates and derive 16 single-image pages from original slide 19',()=>{
 assert.equal(templatePages.length,27);assert.deepEqual(templatePages.slice(0,11),cafeteriaTemplate.pages.slice(0,11));
 const expected=['B1建筑平面布置图','首层建筑平面布置图','一层建筑平面布置图','二层建筑平面布置图','三层建筑平面布置图','四层建筑平面布置图','屋面层建筑平面布置图','结构模型与构件','基础布置图','桩平面布置图','首层结构平面布置图','二层结构平面布置图','三层结构平面布置图','四层结构平面布置图','屋面层结构平面布置图','小屋面层结构平面布置图'];
 assert.deepEqual(templatePages.slice(11).map(p=>p.title),expected);
 for(const page of buildCafeteriaSlides().slice(11)){
  assert.equal(page.sourceSlideNumber,19);assert.equal(page.slots.length,1);
  const images=page.shapes.filter(s=>s.kind==='image');assert.equal(images.length,1);assert.deepEqual(images[0].box,[131.026,68.418,763.947,563.479]);
  assert.equal(page.shapes.find(s=>s.id==='9').text,page.number<=18?'01  建筑设计':'02  结构设计');
  assert.equal(page.shapes.find(s=>s.id==='4').text,String(page.number-1));
 }
});
for(const layoutVersion of [3,4])test(`v${layoutVersion}: migrate all units, archive old text, preserve every image without duplicates`,()=>{
 const a={edits:{'cafeteria-v1:10:5':'前11人工稿','cafeteria-v1:12:9':'旧结构页眉','cafeteria-v1:20:5':'旧构件文字'},provenance:{'cafeteria-v1:20:5':{source_id:'manual'}},images:{}};
 for(const n of [3,12,13,14,15,16,17,18,19,20,21,22,23,24,25])for(const [i] of cafeteriaTemplate.pages[n-1].slots.entries())a.images[oldKey(n,i)]=`data:image/png;base64,OLD_${n}_${i}`;
 a.images.__unplaced__='data:image/png;base64,UNPLACED';
 const b={edits:{'cafeteria-v1:12:12':'乙旧标题'},images:{[oldKey(20)]:'data:image/png;base64,OTHER_UNIT'}};
 const saved={layoutVersion,unit:'甲',...(layoutVersion===3?a:{}),unitDrafts:{甲:a,乙:b}};
 const original=structuredClone(saved),loaded=restorePptDraft(saved,'甲');assert.deepEqual(saved,original);
 for(const unit of ['甲','乙'])assert.deepEqual(Object.values(loaded.drafts[unit].images).sort(),Object.values(original.unitDrafts[unit].images).sort());
 const current=loaded.current;assert.equal(current.images['22-二层结构平面布置图'],'data:image/png;base64,OLD_15_0');assert.equal(current.images['18-盈建科模型'],'data:image/png;base64,OLD_20_0');
 assert.equal(loaded.drafts['乙'].images['18-盈建科模型'],'data:image/png;base64,OTHER_UNIT');
 for(let n=11;n<=17;n++)assert.ok(!Object.keys(current.images).some(k=>k.startsWith(n+'-')));
 assert.deepEqual(current.edits,{'cafeteria-v1:10:5':'前11人工稿'});assert.equal(current.layoutMigration.oldEdits['cafeteria-v1:20:5'],'旧构件文字');
 const output=serializePptDraft('甲',5,loaded.drafts,{edits:current.edits,images:current.images});assert.equal(output.images,undefined);
 assert.deepEqual(restorePptDraft(output,'乙').current,loaded.drafts['乙']);assert.deepEqual(restorePptDraft(output,'甲').drafts,output.unitDrafts);
 assert.equal(JSON.stringify(output).split('OLD_15_0').length,2);
 const pages=buildCafeteriaSlides({},'',{'cafeteria-v1:12:9':'旧结构页眉'});assert.equal(pages[11].shapes.find(s=>s.id==='9').text,'01  建筑设计');
 // A global marker must never suppress migration of a still-old secondary unit.
 assert.equal(restorePptDraft({...saved,templateLayout:singleImageLayoutId},'乙').current.images['18-盈建科模型'],'data:image/png;base64,OTHER_UNIT');
});
test('building/structure and first/ground floor aliases stay distinct',()=>{
 const targets=templatePages.slice(11).map(p=>({key:p.number,aliases:p.aliases}));
 const names=['首层建筑平面布置图.png','一层建筑平面布置图.png','二层建筑平面布置图.png','05_媒体楼二层结构布置.png','03_媒体楼YJK模型_历史汇报.png','二层平面图.png','04_媒体楼桩位及基础布置.png'];
 const plans=matchImageFiles(names.map(name=>({name})),targets,{aliases:reportImageAliases,suffix:true});
 assert.deepEqual(plans.slice(0,5).map(p=>p.target?.key),[13,14,15,23,19]);assert.equal(plans[5].reason,'未匹配图位');assert.equal(plans[6].reason,'未匹配图位');
});

test('old unplaced model/floor names migrate uniquely while combined pile/foundation stays unplaced',()=>{
 const files=['03_媒体楼YJK模型_历史汇报.png','05_媒体楼二层结构布置.png','06_媒体楼四层结构布置.png','04_媒体楼桩位及基础布置.png'];
 const images=Object.fromEntries(files.map((name,i)=>[`__unplaced__${String(i).padStart(32,'0')}__${name}`,'bytes'+i]));
 const {current}=restorePptDraft({unit:'甲',images},'甲');
 assert.equal(current.images['18-盈建科模型'],'bytes0');assert.equal(current.images['22-二层结构平面布置图'],'bytes1');assert.equal(current.images['24-四层结构平面布置图'],'bytes2');
 assert.equal(Object.keys(current.images).filter(k=>k.startsWith('__unplaced__')).length,1);assert.deepEqual(Object.values(current.images).sort(),Object.values(images).sort());
});
