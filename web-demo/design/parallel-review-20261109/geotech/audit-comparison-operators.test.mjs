import test from 'node:test';
import assert from 'node:assert/strict';
import {comparisonConditions,auditComparisonOperators} from './audit-comparison-operators.mjs';
test('equivalent glyphs retain inclusive boundary and units',()=>{
 assert.deepEqual(comparisonConditions('fak ≦ 100 kPa'),comparisonConditions('fak≤100kPa'));
 assert.notDeepEqual(comparisonConditions('fak<100kPa'),comparisonConditions('fak≤100kPa'));
});
test('faithful extraction can disagree with reference without being repaired',()=>{
 const a=auditComparisonOperators('fak≦100kPa','fak＜100kPa','fak≦100kPa');
 assert.equal(a.sourceOutput,'preserved');assert.equal(a.sourceReference,'source-reference-difference');assert.equal(a.automaticAdoption,false);
});
test('lost or changed comparison is not a preserved result',()=>{
 for(const text of ['fak100kPa','fak<100kPa','fak<=101kPa','fak<=100MPa'])
  assert.equal(auditComparisonOperators('fak<=100kPa','fak<=100kPa',text).sourceOutput,'needs-output-review');
});
test('multiple and negative boundaries keep order; no claim without an operator',()=>{
 assert.deepEqual(comparisonConditions('>-1.2m且≤0.5m').map(x=>x.operator),['>','<=']);
 assert.equal(auditComparisonOperators('100kPa','100kPa','100kPa').sourceOutput,'no-source-condition');
});
