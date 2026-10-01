import assert from 'node:assert/strict';
import { addClause, deriveDiff, moveClause, renumberClauses, validateClauses, visibleSetSnapshot } from '../prototype/numbering.mjs';

const sample = [
  { uid: 'a', sectionKey: '3.2', originalNo: '3.2.1', title: 'A', sourceId: 'S-A', suggestion: 'keep', decision: 'keep', reason: '' },
  { uid: 'b', sectionKey: '3.2', originalNo: '3.2.2', title: 'B', sourceId: 'S-B', suggestion: 'delete', decision: 'delete', reason: '' },
  { uid: 'c', sectionKey: '3.2', originalNo: '3.2.3', title: 'C', sourceId: 'S-C', suggestion: 'keep', decision: 'keep', reason: '' },
  { uid: 'd', sectionKey: '3.3', originalNo: '3.3.1', title: 'D', sourceId: 'S-D', suggestion: 'keep', decision: 'keep', reason: '' },
];

const numbered = renumberClauses(sample);
assert.deepEqual(numbered.map((item) => item.draftNo), ['3.2.1', null, '3.2.2', '3.3.1'], '删除后同章节应连续编号');

const added = addClause(numbered, { uid: 'e', sectionKey: '3.2', title: 'E', sourceId: 'S-E', decision: 'keep', suggestion: 'keep' }, 'a');
assert.deepEqual(added.map((item) => item.draftNo), ['3.2.1', '3.2.2', null, '3.2.3', '3.3.1'], '新增后应立即重排');

const moved = moveClause(added, 'c', 'a');
assert.equal(moved.find((item) => item.uid === 'c').draftNo, '3.2.1', '拖拽后目标条款应取得新编号');
assert.equal(moved.find((item) => item.uid === 'a').draftNo, '3.2.2', '拖拽后后续条款应顺延');

const restored = renumberClauses(sample);
assert.deepEqual(restored.map((item) => item.draftNo), numbered.map((item) => item.draftNo), '撤销恢复快照后编号应确定性复原');

const invalid = validateClauses([{ ...sample[0], suggestion: 'delete', decision: 'keep', reason: '' }]);
assert.equal(invalid[0].reasonMissing, true, '人工覆盖规则建议时必须填写理由');

const snapshot = visibleSetSnapshot(numbered, { generatedAt: 'fixed' });
assert.deepEqual(snapshot.visible_clause_ids, ['a', 'c', 'd'], '网页和 Word 应共享同一可见条款集');
assert.deepEqual(snapshot.clauses.map((item) => item.display_no), ['3.2.1', '3.2.2', '3.3.1'], '快照应固化最终连续编号');

const diff = deriveDiff(numbered, added);
assert.equal(diff.added.length, 1, '差异对比应识别新增条款');

console.log('numbering.test.mjs: 8 assertions passed');
