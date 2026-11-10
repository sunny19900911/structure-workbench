import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {nativeReportSource} from './compose-native-report.mjs';
import {geotechSectionBlocks} from '../../../../geotech-section-blocks.js';
import {geotechImageBlocks} from '../../../../geotech-image-blocks.js';
const hash='a'.repeat(64);
const data='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1cAAAAASUVORK5CYII=';
const caption='图1 活动断裂分布图';
function sample(){
 const report={name:'sample.pdf',sha256:hash,pageCount:1,pages:[{page:1,width:600,height:800,method:'ocr_pending',blocks:[
  {kind:'paragraph',text:'2.2 区域地质构造',bbox:[50,100,300,120],column:0},
  {kind:'paragraph',text:caption,bbox:[50,500,300,520],column:0}]}]};
 const supplement={schemaVersion:1,sourcePDFSha256:hash,images:[{id:'map',page:1,bbox:[50,150,450,480],coordinateSpace:'pdf-page-top-left-points',visuallyReviewed:true,caption,data:'data:image/png;base64,'+data,imageSha256:createHash('sha256').update(Buffer.from(data,'base64')).digest('hex')}]};
 return {report,supplement};
}
test('reviewed image is anchored while text and OCR pending state remain unchanged',()=>{
 const {report,supplement}=sample(),before=structuredClone({report,supplement});
 const baseline=nativeReportSource(report,{expectedHash:hash});
 const actual=nativeReportSource(report,{expectedHash:hash,imageSupplement:supplement});
 assert.equal(actual.blocks.images.length,1);assert.equal(actual.blocks.images[0].afterParagraph,1);
 assert.equal(actual.blocks.images[0].data,'data:image/png;base64,'+data);
 assert.deepEqual(actual.blocks.paras,baseline.blocks.paras);
 assert.deepEqual(actual.blocks.pdfReadReport,baseline.blocks.pdfReadReport);
 assert.deepEqual({report,supplement},before);
});
test('wrong PDF, image bytes, page bounds or unreviewed crop are rejected',()=>{
 for(const change of [s=>s.sourcePDFSha256='b'.repeat(64),s=>s.images[0].imageSha256='b'.repeat(64),s=>s.images[0].bbox[2]=601,s=>s.images[0].visuallyReviewed=false,s=>s.images[0].page=2]){
  const {report,supplement}=sample();change(supplement);
  assert.throws(()=>nativeReportSource(report,{expectedHash:hash,imageSupplement:supplement}));
 }
});
test('ambiguous caption and repeated image id are not silently selected',()=>{
 let {report,supplement}=sample();report.pages[0].blocks.push({...report.pages[0].blocks[1]});
 assert.throws(()=>nativeReportSource(report,{expectedHash:hash,imageSupplement:supplement}),/Unique/);
 ({report,supplement}=sample());supplement.images.push({...supplement.images[0]});
 assert.throws(()=>nativeReportSource(report,{expectedHash:hash,imageSupplement:supplement}),/Duplicate/);
});

function embedded(){
 const {report,supplement}=sample();report.pages[0].blocks.pop();
 const item=supplement.images[0];item.caption='图2 活动断层分布图';item.captionMethod='reviewed-image-ocr';
 item.captionEvidence={sourcePDFSha256:hash,imageSha256:item.imageSha256,page:1,text:item.caption,bbox:[50,450,250,470],visuallyReviewed:true};
 item.anchor={quote:report.pages[0].blocks[0].text,bbox:report.pages[0].blocks[0].bbox};
 return {report,supplement};
}
test('embedded OCR caption anchors to native context without becoming native paragraph',()=>{
 const {report,supplement}=embedded();
 const s=nativeReportSource(report,{expectedHash:hash,imageSupplement:supplement});
 assert.deepEqual(s.blocks.paras,['2.2 区域地质构造']);
 const d=geotechImageBlocks(s,geotechSectionBlocks(s));
 assert.deepEqual(d.imagePlacement,{placed:['map'],pending:[]});
 const image=d.sections.flatMap(s=>s.blocks).find(b=>b.kind==='geotech-source-image');
 assert.equal(image.sourceCaptionParagraph,null);assert.equal(image.captionInParagraph,false);
});
test('embedded caption needs matching image evidence and original preceding anchor',()=>{
 for(const change of [i=>i.captionEvidence.imageSha256='b'.repeat(64),i=>i.captionEvidence.text='other',i=>i.captionEvidence.bbox[3]=500,i=>i.anchor.quote='invented anchor',i=>i.anchor.bbox=[50,200,300,220]]){
  const {report,supplement}=embedded();change(supplement.images[0]);
  assert.throws(()=>nativeReportSource(report,{expectedHash:hash,imageSupplement:supplement}));
 }
});
