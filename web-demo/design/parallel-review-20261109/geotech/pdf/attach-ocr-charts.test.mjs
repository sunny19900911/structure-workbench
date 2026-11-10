import test from 'node:test';
import assert from 'node:assert/strict';
import {attachOcrCharts} from './attach-ocr-charts.mjs';
const hash='a'.repeat(64);
function fixture(){
 const report={sha256:hash,pages:[{page:1,method:'ocr_pending'}]};
 const blocks={paras:['原生正文'],tables:[[['原值']]],warnings:[],pdfReadReport:{ocrReviewPages:[1],ocrApplied:false}};
 const chart={sourcePDFSha256:hash,page:1,pageComplete:false,automaticAdoption:false,scope:'wave-chart-layer-results',identity:{borehole:'ZK35'},identityUnits:{},columns:['序号','地层名称','深度(m)','厚度(m)','层速度(m/s)'],rows:[['1','片岩','1.3','1.3','357']],sourceImageSha256:hash,evidenceHashes:Object.fromEntries(['identityEvidence','headerEvidence','layerEvidence'].map(k=>[k,hash])),pixelBoxes:[[1,1,5,5]],sourceImageSize:[10,10]};
 return {report,blocks,supplement:{schemaVersion:1,sourcePDFSha256:hash,completePages:[],charts:[chart]}};
}
test('source supplements preserve native text and unresolved pages',()=>{
 const {report,blocks,supplement}=fixture();attachOcrCharts(blocks,report,supplement);
 assert.deepEqual(blocks.paras,['原生正文']);assert.deepEqual(blocks.tables,[[['原值']]]);assert.deepEqual(blocks.pdfReadReport.ocrReviewPages,[1]);assert.deepEqual(blocks.pdfReadReport.ocrCompletePages,[]);
 assert.equal(blocks.ocrCharts[0].locator,'PDF第1页 ZK35波速柱状图');assert.equal(blocks.pdfReadReport.ocrApplied,true);
 supplement.charts[0].rows[0][4]='999';assert.equal(blocks.ocrCharts[0].rows[0][4],'357');
});
test('wrong report, unsupported completion and duplicate region are rejected',()=>{
 for(const mutate of [s=>s.sourcePDFSha256='b'.repeat(64),s=>s.completePages=[1],s=>s.charts[0].pageComplete=true,s=>s.charts.push(s.charts[0])]){
  const {report,blocks,supplement}=fixture();mutate(supplement);assert.throws(()=>attachOcrCharts(blocks,report,supplement));assert.equal(blocks.ocrCharts,undefined);
 }
});
test('unverifiable geometry, units, evidence and numeric rows are rejected',()=>{
 for(const mutate of [c=>c.pixelBoxes=[[0,0,20,20]],c=>c.identityUnits={equivalentVelocity:'m/s'},c=>c.evidenceHashes={},c=>c.rows[0][4]='357543?',c=>c.page=2]){
  const {report,blocks,supplement}=fixture();mutate(supplement.charts[0]);assert.throws(()=>attachOcrCharts(blocks,report,supplement));
 }
});
