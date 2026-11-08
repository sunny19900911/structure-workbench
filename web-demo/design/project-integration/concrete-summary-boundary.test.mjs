import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {materialSummary} from '../../module-integration-core.js';

const html=readFileSync(new URL('../../workbuddy-integrated-studio.html',import.meta.url),'utf8');
const parse=runInNewContext(html.slice(html.indexOf('function stNum('),html.indexOf('function stParseBase('))+'\nstParseUp;');

test('全楼统计不重复并入末层，保留各层分项和单方',()=>{
 const input='>第 1自然层:\n砼等级\t个数\tC30\n柱\t2\t10\n小计:\t--\t10\t汇总: 10\n本层总面积=100\n>第 2自然层:\n砼等级\t个数\tC30\n梁\t4\t20\n小计:\t--\t20\t汇总: 20\n本层总面积=100\n>全楼统计:\n砼等级\t个数\tC30\n柱\t2\t10\n梁\t4\t20\n总计:\t--\t30\t汇总: 30\n全楼面积=200';
 const up=parse(input),summary=materialSummary({up});
 assert.equal(up.floors.length,2);
 assert.equal(up.floors[1].comp.length,1);
 assert.equal(summary.floors[1].volume,20);
 assert.equal(summary.floors[1].concreteRate,.2);
 assert.equal(summary.volume,30);
 assert.equal(summary.concreteRate,.15);
 assert.deepEqual(summary.warnings,[]);
 assert.equal(materialSummary({up:parse(input.split('>全楼统计:')[0])}).volume,30);
});
