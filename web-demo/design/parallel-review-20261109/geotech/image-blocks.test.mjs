import test from 'node:test';
import assert from 'node:assert/strict';
import {geotechSectionBlocks} from '../../../geotech-section-blocks.js';
import {geotechImageBlocks} from '../../../geotech-image-blocks.js';
import {detailedGeotech} from '../../../geotech-document.js';

function sample(){
 const paras=['2.2 区域地质构造','2.2.1 断裂带','场地位于断裂东侧。','图1 活动断裂分布图','该断裂距场地约2km。'];
 const image={id:'image-1',caption:paras[3],afterParagraph:3,data:'data:image/png;base64,YQ=='};
 const source={name:'测试.docx',source_id:'A',hash:'abc',blocks:{paras,tables:[],images:[image],ordered:paras.map((_,index)=>({type:'p',index}))}};
 return {source,document:geotechSectionBlocks(source)};
}

test('source image is placed after original anchor without changing existing text or table blocks',()=>{
 const {source,document}=sample(),before=JSON.stringify(document);
 const result=geotechImageBlocks(source,document);
 assert.deepEqual(result.imagePlacement,{placed:['image-1'],pending:[]});
 const section=result.sections.find(s=>s.blocks.some(b=>b.kind==='geotech-source-image'));
 const image=section.blocks.find(b=>b.kind==='geotech-source-image');
 assert.equal(section.title,'4.4.5 断裂带');assert.equal(image.sourceCaptionParagraph,4);
 assert.equal(image.sourceOrder,2.5);assert.equal(JSON.stringify(document),before);
 for(let i=0;i<document.sections.length;i++)assert.deepEqual(result.sections[i].blocks.filter(b=>b.kind!=='geotech-source-image'),document.sections[i].blocks);
});

test('ambiguous caption and merged paragraph remain pending instead of guessed',()=>{
 const {source,document}=sample();source.blocks.paras.push(source.blocks.paras[3]);
 assert.match(geotechImageBlocks(source,document).imagePlacement.pending[0].reason,/唯一定位/);
 source.blocks.paras.pop();const section=document.sections.find(s=>s.buckets.includes(7));
 section.blocks.push({kind:'paragraph',text:'拼接段落',sourceParagraphs:[3,5],sourceOrder:2});
 assert.match(geotechImageBlocks(source,document).imagePlacement.pending[0].reason,/拼接段落/);
});

test('different project or source version is rejected',()=>{
 const {source,document}=sample();assert.throws(()=>geotechImageBlocks({...source,hash:'other'},document),/来源版本/);
 document.images[0].source_id='B';assert.throws(()=>geotechImageBlocks(source,document),/当前报告/);
});

test('tectonic zoning caption selects the original source map and anchors it',()=>{
 const {source}=sample();source.blocks.paras[3]='附图1：云南省构造分区图';
 source.blocks.images[0].caption=source.blocks.paras[3];
 const result=geotechImageBlocks(source,geotechSectionBlocks(source));
 assert.deepEqual(result.imagePlacement,{placed:['image-1'],pending:[]});
 assert.equal(result.images[0].caption,'附图1：云南省构造分区图');
});

test('water-system and antifloat zoning figures retain source bytes and distinct section anchors',()=>{
 for(const [heading,caption,title] of [
  ['2.3 水文地质条件','图3：勘察区域水系分布图','4.6 水文地质与腐蚀性'],
  ['3.4 抗浮设防水位','附图3：2#综合楼抗浮设防水位平面分区图','抗浮建议']]){
  const {source}=sample();source.blocks.paras=[heading,'水位建议见下图。',caption];
  source.blocks.ordered=source.blocks.paras.map((_,index)=>({type:'p',index}));
  Object.assign(source.blocks.images[0],{caption,afterParagraph:2});
  const before=structuredClone(source),result=geotechImageBlocks(source,geotechSectionBlocks(source));
  assert.equal(detailedGeotech(source).images.length,0,'legacy exporter must not place water maps under the fault section');
  assert.deepEqual(result.imagePlacement,{placed:['image-1'],pending:[]});
  assert.ok(result.sections.find(s=>s.title===title).blocks.some(b=>b.kind==='geotech-source-image'));
  assert.equal(result.images[0].data,source.blocks.images[0].data);assert.deepEqual(source,before);
 }
});

test('a textual antifloat citation does not manufacture a missing attachment or select calculation screenshots',()=>{
 const {source}=sample();source.blocks.paras.push('抗浮水位见附图3：抗浮设防水位分区图。');
 source.blocks.images=[];assert.equal(detailedGeotech(source).images.length,0);
 source.blocks.images=[{id:'calc',caption:'抗浮稳定系数计算结果',data:'data:image/png;base64,YQ=='}];
 assert.equal(detailedGeotech(source).images.length,0);
});
