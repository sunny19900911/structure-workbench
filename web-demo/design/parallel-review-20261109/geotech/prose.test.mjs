import test from 'node:test';
import assert from 'node:assert/strict';
import {uniqueGeotechProse} from '../../../geotech-prose.js';
test('identical complete passages survive once across different PDF line wraps',()=>{
 const input=['据测试结果，①素填土：Vs=143.07m/s，','软弱土；②黏土：Vs=279.99m/s，中硬土。','据测试结果，','①素填土：Vs=143.07m/s，软弱土；','②黏土：Vs=279.99m/s，中硬土。'];
 const original=[...input];assert.deepEqual(uniqueGeotechProse(input),input.slice(0,2));assert.deepEqual(input,original);
});
test('different water locations, values and qualifications cannot be deduplicated',()=>{
 const input=['甲楼抗浮水位取5m。','乙楼抗浮水位取5m。','甲楼抗浮水位取6m。','施工期间，甲楼抗浮水位取5m。'];
 assert.deepEqual(uniqueGeotechProse(input),input);
});
test('unfinished lines and punctuation differences are preserved conservatively',()=>{
 const input=['建议采用独立基础。','建议采用独立基础；','局部应处理软土。','尚待核实','尚待核实'];assert.deepEqual(uniqueGeotechProse(input),input);
});
