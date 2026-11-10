import test from 'node:test';
import assert from 'node:assert/strict';
import {locatePassage} from './audit-common-passages.mjs';
const source=()=>({source_id:'s',blocks:{paras:['地下水具有','微腐蚀性。'],ordered:[{type:'p',index:0},{type:'p',index:1}]}});
test('locates wrapped text in its original physical paragraphs',()=>{
 assert.deepEqual(locatePassage(source(),'地下水具有微腐蚀性'),{source_id:'s',paragraphs:[1,2]});
});
test('never fabricates a match across tables, omitted paragraphs or source boundaries',()=>{
 let s=source();s.blocks.ordered.splice(1,0,{type:'table',index:0});assert.equal(locatePassage(s,'具有微腐蚀性'),null);
 s=source();s.blocks.paragraphMeta=[{}, {sourceBoundary:true}];assert.equal(locatePassage(s,'具有微腐蚀性'),null);
 s=source();s.blocks.paras.splice(1,0,'其他段落');s.blocks.ordered[1].index=2;assert.equal(locatePassage(s,'具有微腐蚀性'),null);
});
