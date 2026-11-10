import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeReportSource} from './compose-native-report.mjs';
const hash='a'.repeat(64);
const report=()=>({name:'report.pdf',sha256:hash,pageCount:2,pages:[
 {page:1,width:600,height:800,method:'native',blocks:[{kind:'paragraph',text:'4 地下水',bbox:[50,100,250,120],column:0}]},
 {page:2,width:600,height:800,method:'ocr_pending',blocks:[{kind:'paragraph',text:'地下水位埋深2.50米。',bbox:[50,300,350,320],column:0}]}
]});
test('adapter can be imported without running CLI and preserves mixed page evidence',()=>{
 const input=report(),snapshot=structuredClone(input),s=nativeReportSource(input,{expectedHash:hash});
 assert.deepEqual(s.blocks.paras,['4 地下水','地下水位埋深2.50米。']);
 assert.deepEqual(s.blocks.pdfReadReport.ocrReviewPages,[2]);
 assert.deepEqual(s.blocks.pdfReadReport.mixedTextPages,[2]);
 assert.equal(s.blocks.pdfReadReport.ocrApplied,false);
 assert.equal(s.blocks.paragraphMeta[1].page,2);
 assert.deepEqual(input,snapshot);
 s.blocks.paragraphMeta[1].bbox[0]=0;
 assert.deepEqual(input,snapshot);
});
test('adapter rejects stale report identity and missing or duplicate pages',()=>{
 assert.throws(()=>nativeReportSource(report()),/hash mismatch/);
 assert.throws(()=>nativeReportSource(report(),{expectedHash:'b'.repeat(64)}),/hash mismatch/);
 for(const mutate of [r=>r.pages.pop(),r=>r.pages[1].page=1,r=>r.pages[1].method='complete']){
  const r=report();mutate(r);assert.throws(()=>nativeReportSource(r,{expectedHash:hash}),/page inventory/);
 }
});
test('OCR supplement from another PDF is rejected instead of merged',()=>{
 assert.throws(()=>nativeReportSource(report(),{expectedHash:hash,supplement:{schemaVersion:1,sourcePDFSha256:'b'.repeat(64),charts:[],completePages:[]}}),/another PDF/);
});

test('page inventory header is removed only in the top margin with matching counts',()=>{
 const r=report();r.pages[1].blocks.push(
  {kind:'paragraph',text:'工程勘察报告 共2页 第2页',bbox:[50,40,550,55],column:0},
  {kind:'paragraph',text:'正文引用共2页第2页',bbox:[50,400,550,420],column:0},
  {kind:'paragraph',text:'另一份文件共3页第2页',bbox:[50,40,550,55],column:0});
 const s=nativeReportSource(r,{expectedHash:hash});
 assert(!s.blocks.paras.includes('工程勘察报告 共2页 第2页'));
 assert(s.blocks.paras.includes('正文引用共2页第2页'));
 assert(s.blocks.paras.includes('另一份文件共3页第2页'));
 assert.equal(s.blocks.pdfReadReport.excludedHeaders[0].reason,'matching-page-inventory-header');
});
