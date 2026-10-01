import assert from 'node:assert/strict';
import fs from 'node:fs';

const base = new URL('./', import.meta.url);
const data = JSON.parse(fs.readFileSync(new URL('main-workbench-pilot-tj-bj.json', base), 'utf8'));
const runtime = fs.readFileSync(new URL('../../../local-regulation-pilot.js', base), 'utf8');
const html = fs.readFileSync(new URL('../../../workbuddy-integrated-studio.html', base), 'utf8');
const provinces = Object.keys(data.provinces);

const expectedCounts = {
  '天津市': 19,
  '北京市': 27,
  '上海市': 32,
  '广东省': 7,
  '海南省': 8,
  '江苏省': 18,
  '浙江省': 10,
  '云南省': 17,
  '重庆市': 13,
  '河北省': 10,
  '山西省': 4,
  '辽宁省': 8,
  '吉林省': 8,
  '黑龙江省': 7,
  '安徽省': 7,
  '福建省': 10,
  '江西省': 2,
  '山东省': 10,
  '河南省': 10,
  '湖北省': 9,
  '湖南省': 3,
  '广西壮族自治区': 8,
  '四川省': 9,
  '贵州省': 7,
  '西藏自治区': 1,
  '陕西省': 3,
  '甘肃省': 10,
  '青海省': 4,
  '宁夏回族自治区': 12,
  '新疆维吾尔自治区': 9,
  '内蒙古自治区': 4,
};

assert.deepEqual(provinces.sort(), Object.keys(expectedCounts).sort());
assert.equal(data.coverage.province_level_regions, 31);
assert.equal(data.coverage.completeness_status, 'in_progress', '覆盖31省不得被误写成目录已经收全');
for (const [province, expectedCount] of Object.entries(expectedCounts)) {
  assert.equal(data.provinces[province].records.length, expectedCount, `${province}记录数不符`);
}

for (const [province, value] of Object.entries(data.provinces)) {
  assert.ok(value.aliases.includes(province));
  const normalizedCodes = new Set();
  for (const record of value.records) {
    assert.ok(record.title, `${province}/${record.id} 缺少名称`);
    assert.ok(record.code, `${province}/${record.id} 缺少编号`);
    assert.ok(['current', 'non_current', 'pending'].includes(record.status), `${province}/${record.id} 状态非法`);
    assert.match(record.source_id, /^SRC-/);
    assert.match(record.source_url, /^https:\/\//);
    const normalizedCode = record.code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    assert.ok(!normalizedCodes.has(normalizedCode), `${province}/${record.id} 编号与同地区其他记录重复：${record.code}`);
    normalizedCodes.add(normalizedCode);
    if (record.status === 'non_current') {
      assert.notEqual(record.status_label, '非现行', `${province}/${record.id} 不得只显示笼统的“非现行”`);
      assert.ok(record.status_date, `${province}/${record.id} 缺少废止或替代日期`);
      assert.ok(record.status_replacement, `${province}/${record.id} 缺少替代说明`);
      assert.ok(Array.isArray(record.replacement_codes), `${province}/${record.id} 缺少结构化替代编号`);
      if (record.replacement_codes.length > 0) {
        assert.match(record.status_replacement, /《.+》/, `${province}/${record.id} 替代标准必须同时显示名称`);
      }
    }
    for (const snapshotValue of [record.id, record.title, record.code, record.source_id, record.source_url, record.status_label, record.status_date, record.status_replacement]) {
      if (snapshotValue) assert.ok(runtime.includes(snapshotValue), `${province}/${record.id} 尚未同步到直接打开版`);
    }
  }
}

for (const [province, value] of Object.entries(data.provinces)) {
  const availableCodes = new Set(value.records.map((record) => record.code));
  for (const record of value.records) {
    for (const replacementCode of record.replacement_codes || []) {
      assert.ok(
        availableCodes.has(replacementCode),
        `${province}/${record.id} 引用了替代标准 ${replacementCode}，但清单中没有该标准的独立记录`,
      );
    }
  }
}

for (const [province, expectedCount] of Object.entries(expectedCounts)) {
  const prefix = data.provinces[province].records[0].id.split('-')[0];
  assert.equal((runtime.match(new RegExp(`["']${prefix}-\\d{2}["']`, 'g')) || []).length, expectedCount, `直接打开版${province}数据应为${expectedCount}项`);
}
assert.ok(!runtime.includes('import.meta'), '直接打开版不得依赖 ES module');
assert.ok(!runtime.includes('fetch(DATA_URL'), '直接打开版不得通过 file:// fetch JSON');
assert.ok(!runtime.includes("'非现行'"), '页面不得继续使用笼统的“非现行”标签');
assert.match(html, /id="local-regulation-form" onsubmit="return false"/);
assert.match(html, /<script src="\.\/local-regulation-pilot\.js"><\/script>/);

console.log('PASS: 全国31个省级地区（不含港澳台）共306项；M9纠正上海岩土旧版状态并补齐京沪版本链；替代编号都有独立记录；直接双击 HTML 时回车不会提交跳页。');
