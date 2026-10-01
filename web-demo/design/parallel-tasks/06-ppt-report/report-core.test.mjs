import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRewrite } from './report-core.js';

const original = [{ id: '3:1', text: '本方案高度为24m，节点待复核。' }];
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
