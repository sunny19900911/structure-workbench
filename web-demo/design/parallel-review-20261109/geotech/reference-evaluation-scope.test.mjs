import test from 'node:test';
import assert from 'node:assert/strict';
import {referenceEvaluationScope} from './reference-evaluation-scope.mjs';
function fixture(){const paras=Array(396).fill('');paras[381]='12.基坑支护设计';paras[392]='高程1907.59m～1902.02m';return {source_id:'REFERENCE-0625e3734084a973a6af',blocks:{paras}};}
test('quarantines only reviewed chapter, preserving reference and main chapter',()=>{
 const r=fixture(),before=structuredClone(r),scope=referenceEvaluationScope(r);
 assert.deepEqual(scope.excludedParagraphs,Array.from({length:15},(_,i)=>382+i));
 assert.ok(!scope.excludedParagraphs.includes(62));assert.ok(!scope.excludedParagraphs.includes(116));
 assert.equal(scope.quarantines[0].status,'pending-source-review');assert.deepEqual(r,before);
});
test('same numbers in another project do not trigger exclusion',()=>{
 const r=fixture();r.source_id='another-reference';assert.deepEqual(referenceEvaluationScope(r).excludedParagraphs,[]);
});
test('shifted or altered reference cannot silently reuse old boundaries',()=>{
 for(const change of [r=>r.blocks.paras.unshift('new'),r=>r.blocks.paras[381]='other chapter',r=>r.blocks.paras[392]='other values']){
  const r=fixture();change(r);assert.throws(()=>referenceEvaluationScope(r),/stale/);
 }
});
