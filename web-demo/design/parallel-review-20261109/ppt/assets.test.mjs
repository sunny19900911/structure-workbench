import test from 'node:test';
import assert from 'node:assert/strict';
import {matchImageFiles,nativeImageTargets} from '../../../office-ppt-assets.js';
import {parameterRows,filterParameters,loadPptParameters} from '../../../office-ppt-parameters.js';
test('filename matching keeps duplicates, ambiguous titles and occupied slots unplaced',()=>{
 const targets=[{key:'a',aliases:['平面图','结构方案'],occupied:false},{key:'b',aliases:['结构方案'],occupied:false},{key:'c',aliases:['模型图'],occupied:true}];
 const plans=matchImageFiles(['平面图.png','平面图.jpg','结构方案.png','模型图.png','未知.png'].map(name=>({name})),targets);
 assert.deepEqual(plans.map(p=>p.reason),['同名图片','同名图片','匹配多个图位','图位已有图片','未匹配图位']);
 assert.equal(matchImageFiles([{name:' 平面图.png'}],targets)[0].target.key,'a');
 assert.equal(matchImageFiles([{name:'平面图.png'},{name:'结构方案.png'}],[targets[0]])[0].reason,'多张图片匹配同一图位');
});
test('one slot can match title; multiple slots require a unique name',()=>{
 const view={slides:[{number:1,title:'结构方案',shapes:[{id:'2',name:'模型图',type:'sp',imageSlot:true}]},{number:2,title:'基础',shapes:[{id:'3',name:'剖面',type:'sp',imageSlot:true},{id:'4',name:'平面',type:'pic',imageSlot:true}]}]};
 const targets=nativeImageTargets(view);assert.equal(matchImageFiles([{name:'结构方案.png'}],targets)[0].target.key,'1:2');assert.equal(matchImageFiles([{name:'基础.png'}],targets)[0].reason,'未匹配图位');
 const caption=nativeImageTargets({slides:[{number:3,title:'',shapes:[{id:'1001',name:'鸟瞰图 · 图1',type:'sp',imageSlot:true}]}]});assert.equal(matchImageFiles([{name:'鸟瞰图.png'}],caption)[0].target.key,'3:1001');
});
test('parameter search uses current unit override and excludes blanks',()=>{
 const rows=parameterRows({project_name:'甲工程',intensity:'7',g_frame:'三级',empty:'',object:{}},{g_frame:'二级'});
 assert.equal(filterParameters(rows,'抗震 二级')[0].value,'二级');assert.equal(filterParameters(rows,'三级').length,0);assert.equal(filterParameters(rows,'intensity')[0].label,'设防烈度');assert.equal(rows.length,3);
});
test('standalone file reads its own project and exact unit, without stale expansion parameters',async()=>{
 const original=globalThis.fetch,paths=[];
 globalThis.fetch=async path=>{paths.push(path);return {ok:true,json:async()=>({record:{data:path.endsWith('/main')?{parameters:{project_name:'本文件项目',struct_sys:'框架',g_frame:'二级'}}:{facts:[{status:'confirmed',unit:'甲楼',key:'struct_sys',value:'框架-剪力墙'},{status:'confirmed',unit:'乙楼',key:'struct_sys',value:'剪力墙'}]}}})};};
 try{const rows=await loadPptParameters({projectId:'a'.repeat(32),unit:'甲楼'},{WorkbenchProjects:{id:'b'.repeat(32)}});assert.equal(rows.find(r=>r.key==='struct_sys').value,'框架-剪力墙');assert.equal(rows.some(r=>r.value==='剪力墙'),false);assert.equal(rows.some(r=>r.key==='g_frame'),false);assert.ok(paths.every(p=>p.includes('a'.repeat(32))));}finally{globalThis.fetch=original;}
});
