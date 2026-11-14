import test from 'node:test';
import assert from 'node:assert/strict';
import {reportImageAliases,matchImageFiles} from '../../../office-ppt-assets.js';
import {singleImageLayoutId,reportImageTargets,reconcileUnplacedImages} from '../../parallel-tasks/06-ppt-report/single-image-layout.js';
import {restorePptDraft,serializePptDraft} from '../../parallel-tasks/06-ppt-report/ppt-draft.js';
const plan=name=>matchImageFiles([{name}],reportImageTargets(),{aliases:reportImageAliases,suffix:true})[0];
const cases=[['建筑三层平面图.png',16],['建筑一层平面图.png',14],['建筑首层平面图.png',13],['建筑二层平面图.png',15],['建筑四层平面图.png',17],['建筑屋顶层平面图.png',18],['结构二层平面布置图.png',23],['结构2层平面图.png',23],['2层结构平面图.png',23],['结构４层平面布置图.png',25],['结构四层平面布置图.png',25],['结构屋顶平面图.png',26],['结构小屋顶层平面图.png',27],['结构YJK整体模型轴测图.png',19],['媒体楼YJK模型_历史汇报.png',19],['建筑B1平面图.png',12],['地下1层建筑平面图.png',12],['地下室一层建筑平面图.png',12],['负一层建筑平面图.png',12],['结构桩位平面布置图.png',21],['结构基础平面布置图.png',20],['建筑3层平面图.png',16]];
test('explicit discipline + floor + topic match all supported word orders and aliases',()=>{for(const [name,page]of cases){const p=plan(name);assert.equal(p.reason,'',name);assert.equal(Number(p.target.key.split('-')[0])+1,page,name);}});
test('missing floors, combined drawings, ambiguous disciplines and out-of-range floors stay unplaced',()=>{for(const name of ['建筑五层平面图.png','结构五层平面图.png','地下室首层建筑平面图.png','地下室顶板一层结构平面图.png','建筑平面CAD分析图1.png','建筑平面CAD分析图2.png','建筑平面CAD分析图3-报告厅.png','结构桩位及基础布置图.png','04_媒体楼桩位及基础布置.png','二层平面图.png','建筑结构三层平面图.png','建筑二层及三层平面图.png','建筑二至四层平面图.png','建筑2-4层平面图.png','建筑一二层平面图.png','结构局部YJK模型.png','结构YJK二层模型.png'])assert.equal(plan(name).reason,'未匹配图位',name);});
test('occupied slots and multiple candidates never overwrite or choose an arbitrary winner',()=>{
 const targets=reportImageTargets({'15-三层建筑平面布置图':'MANUAL'});
 assert.equal(matchImageFiles([{name:'建筑三层平面图.png'}],targets,{aliases:reportImageAliases,suffix:true})[0].reason,'图位已有图片');
 const plans=matchImageFiles([{name:'建筑三层平面图.png'},{name:'三层建筑平面布置图.png'}],reportImageTargets(),{aliases:reportImageAliases,suffix:true});assert.ok(plans.every(p=>p.reason==='多张图片匹配同一图位'));
});
const key=(n,name)=>`__unplaced__${String(n).padStart(32,'0')}__${name}`;
test('already-new layout recovers existing unplaced on every load, every unit; original bytes/edits/bindings persist once',()=>{
 const a={layoutId:singleImageLayoutId,edits:{'cafeteria-single-v2:16:12':'人工标题'},images:{[key(1,'建筑三层平面图.png')]:'A',[key(2,'建筑五层平面图.png')]:'F','22-二层结构平面布置图':'BOUND',[key(3,'结构二层平面布置图.png')]:'B'},layoutMigration:{oldEdits:{old:'旧人工稿'}}};
 const b={layoutId:singleImageLayoutId,images:{[key(4,'建筑屋顶层平面图.png')]:'C'}};
 const original={layoutVersion:4,templateLayout:singleImageLayoutId,unit:'甲',unitDrafts:{甲:a,乙:b}},snapshot=structuredClone(original),loaded=restorePptDraft(original,'甲');
 assert.deepEqual(original,snapshot);assert.equal(loaded.current.images['15-三层建筑平面布置图'],'A');assert.equal(loaded.drafts['乙'].images['17-屋面层建筑平面布置图'],'C');assert.equal(loaded.current.images['22-二层结构平面布置图'],'BOUND');assert.equal(loaded.current.images[key(3,'结构二层平面布置图.png')],'B');
 assert.deepEqual(loaded.current.edits,a.edits);assert.deepEqual(loaded.current.layoutMigration,a.layoutMigration);assert.deepEqual(Object.values(loaded.current.images).sort(),Object.values(a.images).sort());
 const saved=serializePptDraft('甲',4,loaded.drafts,loaded.current);assert.equal(saved.images,undefined);assert.deepEqual(restorePptDraft(saved,'甲').drafts,saved.unitDrafts);assert.equal(loaded.current.imageMatches.length,1);
});
test('ambiguous legacy slot labels do not become filename matches; repeated recovery is idempotent',()=>{
 const draft={images:{[key(1,'旧第13页 一层结构布置 · 图1')]:'old',[key(2,'建筑三层平面图.png')]:'a',[key(3,'三层建筑平面布置图.png')]:'b'}};
 assert.deepEqual(reconcileUnplacedImages(draft),draft);
});

test('numeric structural floor names recover from a saved new-layout unplaced image',()=>{
 const name='结构2层平面图.png',source=key(22,name);
 const original={layoutId:singleImageLayoutId,images:{[source]:'ORIGINAL_BYTES'},edits:{manual:'人工说明'}};
 const restored=reconcileUnplacedImages(original);
 assert.equal(restored.images['22-二层结构平面布置图'],'ORIGINAL_BYTES');
 assert.equal(restored.images[source],undefined);
 assert.deepEqual(restored.edits,original.edits);
 assert.deepEqual(reconcileUnplacedImages(restored),restored);
});
