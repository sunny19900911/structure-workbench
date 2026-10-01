import assert from 'node:assert/strict';
import { resolvePlace } from './core.mjs';
import { places } from './fixtures.mjs';

const tests = [
  ['LOC-01 天津', () => assert.equal(resolvePlace('天津', places).selected.placeId, 'PLACE-TJ')],
  ['LOC-02 上海', () => assert.equal(resolvePlace('上海市', places).selected.placeId, 'PLACE-SH')],
  ['LOC-03 北京', () => assert.equal(resolvePlace('北京', places).selected.placeId, 'PLACE-BJ')],
  ['LOC-04 广东', () => assert.equal(resolvePlace('广东省', places).selected.placeId, 'PLACE-GD')],
  ['LOC-05 江苏', () => assert.equal(resolvePlace('南京市', places).selected.placeId, 'PLACE-JS')],
  ['LOC-06 浙江', () => assert.equal(resolvePlace('浙江', places).selected.placeId, 'PLACE-ZJ')],
  ['LOC-07 云南', () => assert.equal(resolvePlace('昆明市', places).selected.placeId, 'PLACE-YN')],
  ['LOC-08 未收录地点', () => assert.equal(resolvePlace('四川省', places).state, 'unresolved')],
];

let passed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name} — ${error.message}`); }
}
console.log(`\n${passed}/${tests.length} passed`);
if (passed !== tests.length) process.exitCode = 1;
