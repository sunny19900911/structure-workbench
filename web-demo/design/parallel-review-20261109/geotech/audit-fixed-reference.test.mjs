import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyReferenceCell} from './audit-fixed-reference.mjs';
test('an empty numerical result is not equivalent to a required reference number',()=>{
 assert.equal(classifyReferenceCell('150','',{}),'needs-source-review');
 assert.equal(classifyReferenceCell('150','151',{}),'needs-source-review');
});
test('slash versus blank stays a representation difference, never a passed numeric check',()=>{
 assert.equal(classifyReferenceCell('/','',{}),'unspecified-value-format');
 assert.equal(classifyReferenceCell('150','150',{}),'exact-match');
});
test('a preserved source conflict is unresolved and cannot be counted as corrected',()=>{
 assert.equal(classifyReferenceCell('150','',{conflict:true}),'unresolved-source-conflict');
});
