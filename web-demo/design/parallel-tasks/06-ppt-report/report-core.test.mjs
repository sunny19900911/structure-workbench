import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRewrite, rewriteGuidance, parameterEvidence } from './report-core.js';

const original = [{ id: '3:1', text: '本方案高度为24m，节点待复核。' }];
test('expanded reporting accepts detailed prose while retaining numeric and status constraints',()=>{
  const text='本方案高度为24m，节点待复核。'+'汇报应结合现有资料说明设计思路及构件之间的联系。'.repeat(10);
  const response=JSON.stringify({blocks:[{id:'3:1',text}]});
  assert.ok(text.length>180);assert.equal(validateRewrite(response,original,'expand').blocks[0].text,text);
  assert.throws(()=>validateRewrite(response,original));
  assert.throws(()=>validateRewrite(response.replace('24m','25m'),original,'expand'));
  assert.throws(()=>validateRewrite(response.replace('节点待复核','节点已通过'),original,'expand'));
  assert.match(rewriteGuidance('expand'),/详实.*600字/);
});
test('native template without parameter spans still supplies current measure evidence',()=>{
  const evidence=parameterEvidence({querySelectorAll:()=>[]},{intensity:'8',struct_sys:'框架',g_wall:''});
  assert.deepEqual(evidence.map(e=>[e.key,e.value]),[['intensity','8'],['struct_sys','框架']]);
});
test('valid rewrite retains facts and pending status', () => {
  const parsed = validateRewrite(JSON.stringify({ blocks: [{ id: '3:1', text: '方案高度24m；节点待复核。' }], warnings: [] }), original);
  assert.equal(parsed.blocks[0].id, '3:1');
});
test('rejects changed facts, dropped pending status, wrong IDs and invalid JSON', () => {
  for (const text of ['高度25m，节点待复核。', '高度24mm，节点待复核。', '高度24m，节点满足要求。']) {
    assert.throws(() => validateRewrite(JSON.stringify({ blocks: [{ id: '3:1', text }] }), original));
  }
  assert.throws(() => validateRewrite('{"blocks":[]}', original));
  assert.throws(() => validateRewrite('{"blocks":[{"id":"wrong","text":"24m待复核"}]}', original));
  assert.throws(() => validateRewrite('bad JSON', original));
});
