import test from 'node:test';
import assert from 'node:assert/strict';
import {checkDocument} from './fixed-acceptance.mjs';
const source={name:'test.docx',source_id:'fixture',blocks:{paras:['4 水文地质条件','地下水位为1.2m，施工期间应排水。'],tables:[]}};
test('fixed checks fail for lost or altered engineering content',()=>{
 const result=checkDocument(source,[{kind:'paragraph',paragraph:2},{kind:'text',expected:'地下水位为1.2m'},{kind:'text',expected:'地下水位为2.1m'},{kind:'table-retained',table:1}]);
 assert.deepEqual(result.map(c=>c.pass),[true,true,false,false]);
});
test('empty or unknown checks cannot silently pass',()=>{
 assert.throws(()=>checkDocument(source,[]));
 assert.throws(()=>checkDocument(source,[{kind:'unknown'}]));
 assert.throws(()=>checkDocument(source,[{kind:'absent',expected:''}]));
});
