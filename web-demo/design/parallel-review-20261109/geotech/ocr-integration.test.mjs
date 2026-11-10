import test from 'node:test';
import assert from 'node:assert/strict';
import {difficultPages,validateOcrReview,ocrRuntime,reviewDifficultPages} from '../../../server/geotech-ocr-review.mjs';
import {mkdir,mkdtemp} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {completionSummary,sourceReview,ocrReviewText} from '../../../intake-review-summary.js';
import {checkFreshSource} from './end-to-end-acceptance.mjs';
import {fragments} from '../../../intake-core.js';
const blocks={pdfReadReport:{ocrReviewPages:[2,2,4],unrestoredTablePages:[4,6],textReview:[{page:8}]},tableMeta:[{page:10,cellOrigins:[[{requiresReview:true}]]}]};
test('difficult pages include raster, missing table grid, glyph and cell conflicts once',()=>{
 assert.deepEqual(difficultPages(blocks),[2,4,6,8,10]);assert.deepEqual(sourceReview(blocks).pages,[2,4,6,8,10]);
});
test('completion is one minimal batch message, not a persistent checklist',()=>{
 assert.equal(completionSummary([]),'已处理。');
 assert.equal(completionSummary([{review:sourceReview(blocks)},{review:{pages:[2,2]}},{error:'failure'}]),'已处理；1份失败，6页待核。');
 assert.equal(completionSummary([{review:sourceReview({warnings:['missing figure']})}]),'已处理；部分内容待核。');
});
test('OCR source, page scope, coordinates and review-only status are validated',()=>{
 const line={text:'水位2.0m',score:.97,bbox:[1,1,80,20]},page={page:2,width:100,height:200,requiresReview:true,lines:[line],secondPass:[line]};
 const report={schemaVersion:1,sourceHash:'a'.repeat(64),automaticAdoption:false,pages:[page]};
 assert.equal(validateOcrReview(report,report.sourceHash,[2]),report);
 assert.throws(()=>validateOcrReview(report,'b'.repeat(64),[2]),/来源/);
 assert.throws(()=>validateOcrReview({...report,automaticAdoption:true},report.sourceHash,[2]),/来源/);
 assert.throws(()=>validateOcrReview(report,report.sourceHash,[3]),/清单/);
 assert.throws(()=>validateOcrReview({...report,pages:[page,page]},report.sourceHash,[2]),/清单/);
 assert.throws(()=>validateOcrReview({...report,pages:[{...page,lines:[{...line,bbox:[0,0,500,20]}]}]},report.sourceHash,[2]),/坐标/);
 assert.match(ocrReviewText({ocrReview:report}),/第2页.*OCR待核/);
});
test('runtime never accepts relative executable or model directories',async()=>{
 await assert.rejects(ocrRuntime({WORKBENCH_OCR_PYTHON:'python',WORKBENCH_OCR_MODELS:'models'}),/绝对路径/);
});
test('OCR failure preserves native text and unresolved status, never clears pages',async()=>{
 const root=resolve('web-demo/qa/parallel-review-20261109/geotech/ocr-integration/tests');await mkdir(root,{recursive:true});
 const dir=await mkdtemp(join(root,'failure-'));
 const result={status:'extracted',artifactDirectory:dir,source:{hash:'a'.repeat(64),blocks:{paras:['原生水位2.0m'],tables:[],pdfReadReport:{ocrReviewPages:[2]}}}};
 await reviewDifficultPages(result,{WORKBENCH_OCR_PYTHON:join(dir,'absent-python.exe'),WORKBENCH_OCR_MODELS:dir});
 assert.equal(result.status,'extracted');assert.deepEqual(result.source.blocks.paras,['原生水位2.0m']);
 assert.equal(result.source.blocks.ocrReview.status,'failed');assert.deepEqual(result.source.blocks.pdfReadReport.ocrReviewPages,[2]);
 assert.equal(result.source.blocks.pdfReadReport.ocrApplied,false);
});
test('fresh extraction cannot satisfy a lost paragraph using its replacement at the same index',()=>{
 const source=text=>{const b={paras:['4 地下水',text],tables:[]};return {source_id:'test',slot:'geo',blocks:b,fragments:fragments(b)};};
 const frozen=source('地下水位埋深2.0m。'),fresh=source('本节已被替换。');
 assert.ok(checkFreshSource(frozen,frozen,[{kind:'paragraph',paragraph:2,id:'water'}]).results.every(r=>r.pass));
 assert.ok(checkFreshSource(fresh,frozen,[{kind:'paragraph',paragraph:2,id:'water'}]).results.some(r=>!r.pass));
});
