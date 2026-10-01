import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const base = new URL('./', import.meta.url);
const source = fs.readFileSync(new URL('data.js', base), 'utf8');
const html = fs.readFileSync(new URL('index.html', base), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox);

const data = sandbox.window.REGULATION_REVIEW;
const expected = {
  海南: [12, 0, 4, 8],
  上海: [9, 4, 9, 0],
  江苏: [4, 1, 4, 0],
  云南: [15, 0, 12, 3],
};

assert.deepEqual(Object.keys(data.provinces), Object.keys(expected));
for (const [province, summary] of Object.entries(expected)) {
  const item = data.provinces[province];
  assert.deepEqual(Array.from(item.summary), summary, `${province}摘要不一致`);
  assert.equal(item.rows.length, summary[0], `${province}逐项台账数量不一致`);
  assert.equal(summary[2] + summary[3], summary[0], `${province}回写数与未回写数未闭合`);
  assert.ok(item.channels.length >= 5, `${province}缺少已检查渠道`);
  for (const row of item.rows) {
    assert.equal(row.length, 7, `${province}/${row[1]}字段不完整`);
    assert.ok(['verified', 'pending', 'unresolved'].includes(row[5]), `${province}/${row[1]}状态非法`);
    if (row[6]) assert.match(row[6], /^https:\/\//, `${province}/${row[1]}链接不是 HTTPS`);
  }
}

assert.equal(Object.values(data.provinces).reduce((sum, item) => sum + item.rows.length, 0), 40);
assert.match(html, /这里展示检索过程与证据边界，不是第二个正式工作台/);
assert.match(html, /<script src="\.\/data\.js"><\/script>/);
assert.ok(!html.includes('fetch('), '审阅页不得依赖 file:// 下不可用的 fetch');

console.log('PASS: 四省40项审阅台账闭合；页面可直接打开且不依赖 fetch。');
