import test from 'node:test';
import assert from 'node:assert/strict';
import {readPptImage,matchImageFiles,reportImageAliases} from '../../../office-ppt-assets.js';
import {restorePptDraft,serializePptDraft} from '../../parallel-tasks/06-ppt-report/ppt-draft.js';

test('v3 migration retains every unit, slot and manual paragraph; image bytes serialized once',()=>{
 const a={edits:{a:'人工文字'},provenance:{a:{source_id:'manual'}},images:{slot:'data:image/png;base64,ORIGINAL_A',__unplaced__:'data:image/png;base64,ORIGINAL_B'}},b={edits:{b:'另一单体'},images:{slot:'data:image/png;base64,ORIGINAL_C'}};
 const old={layoutVersion:3,unit:'甲',...a,unitDrafts:{甲:a,乙:b}};
 const restored=restorePptDraft(old,'甲'),saved=serializePptDraft('甲',7,restored.drafts,restored.current);
 assert.deepEqual(Object.keys(saved.unitDrafts),Object.keys(old.unitDrafts));assert.equal(saved.images,undefined);
 assert.equal(JSON.stringify(saved).split('ORIGINAL_A').length,2);
 assert.deepEqual(restorePptDraft(saved,'甲').current,restored.current);assert.deepEqual(restorePptDraft(saved,'乙').current,restored.drafts['乙']);
 assert.deepEqual(restorePptDraft({unit:'甲',...a},'甲').current,restored.current);
 assert.deepEqual(Object.values(saved.unitDrafts['甲'].images).sort(),Object.values(a.images).sort());assert.deepEqual(saved.unitDrafts['甲'].edits,a.edits);
});
test('numbered semantic aliases match only a unique slot; effects and multiple slots remain unplaced',()=>{
 const targets=[{key:'model',aliases:['盈建科模型']},{key:'floor',aliases:['二层结构布置']},{key:'r1',aliases:['小屋面结构布置']},{key:'r2',aliases:['小屋面结构布置']}];
 const files=['03_媒体楼YJK模型_历史汇报.png','05_媒体楼二层结构布置.png','08_小屋面结构布置.png','01_科研创新组团效果图.png'].map(name=>({name}));
 const plans=matchImageFiles(files,targets,{aliases:reportImageAliases,suffix:true});
 assert.equal(plans[0].target.key,'model');assert.equal(plans[1].target.key,'floor');
 assert.equal(plans[2].reason,'匹配多个图位');assert.equal(plans[3].reason,'未匹配图位');
 assert.equal(matchImageFiles(files,targets)[0].reason,'未匹配图位','native editor matching unchanged');
});
test('reader preserves exact bytes and rejects bad images or a stalled read/decode with bounded cleanup',async()=>{
 const originalReader=globalThis.FileReader,originalImage=globalThis.Image;
 try{
  let aborted=0;
  globalThis.FileReader=class{readAsDataURL(file){this.result=file.data;if(!file.stall)queueMicrotask(()=>this.onload?.());}abort(){aborted++;this.onabort?.();}};
  globalThis.Image=class{naturalWidth=100;naturalHeight=80;decode(){return this.src==='bad'?Promise.reject(Error('坏图片')):this.src==='stall'?new Promise(()=>{}):Promise.resolve();}};
  const file={name:'大效果图.png',type:'image/png',size:1601318,data:'data:image/png;base64,UNCHANGED'};
  assert.equal((await readPptImage(file,{maxBytes:4*1024*1024})).data,file.data);
  await assert.rejects(readPptImage({...file,data:'bad'},{maxBytes:4*1024*1024}),/坏图片/);
  await assert.rejects(readPptImage({...file,stall:true},{maxBytes:4*1024*1024,timeoutMs:15}),/读取超时/);assert.equal(aborted,1);
  await assert.rejects(readPptImage({...file,data:'stall'},{maxBytes:4*1024*1024,timeoutMs:15}),/解码超时/);
 }finally{globalThis.FileReader=originalReader;globalThis.Image=originalImage;}
});
