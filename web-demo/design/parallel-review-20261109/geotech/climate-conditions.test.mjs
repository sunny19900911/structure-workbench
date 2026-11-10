import test from 'node:test';
import assert from 'node:assert/strict';
import {numberedGeotechSections} from '../../../geotech-numbered-sections.js';

test('climate result headings retain rainfall, seasonal limits and following groundwater',()=>{
 const paras=['2.6 气象、水文及水文地质条件','2.6.1 气象水文条件',
  '据气象资料，年降水量900～1400mm，雨季集中在6至10月。',
  '1月至5月为干季，易发春旱。','2.6.2 水文地质条件','场区地下水埋藏较浅。'];
 for(const name of ['report.docx','report.pdf']){
  const result=numberedGeotechSections({name,blocks:{paras,pdfReadReport:{paragraphsReflowed:true}}});
  assert.deepEqual(result.buckets[11], [paras[2],paras[3],paras[5]]);
  assert.deepEqual(result.evidence.map(e=>e.locator),['提取段落 3','提取段落 4','提取段落 6']);
 }
});
test('climate results under investigation tasks remain blocked; later real conditions recover',()=>{
 const paras=['1 勘察任务','1.1 气象水文条件','应收集年降雨量与地下水资料。',
  '2 气象调查方法','需访问气象台。','3 气候条件','当地雨季集中在夏季。'];
 const result=numberedGeotechSections({name:'report.docx',blocks:{paras}});
 assert.deepEqual(result.buckets[11],['当地雨季集中在夏季。']);
 assert.ok(!result.evidence.some(e=>/应收集|需访问/.test(e.text)));
});

test('punctuated climate-hydrology parent retains a short hydrology child without unblocking survey tasks',()=>{
 const paras=['一、场地工程地质条件','（一）气象、水文条件','1、气象','气象调查背景。',
  '2、水文','场地处于两流域分水岭，西侧1.0km有水库。','拟建场地位置','图3：勘察区域水系分布图'];
 for(const name of ['report.docx','report.pdf']){
  const result=numberedGeotechSections({name,blocks:{paras,pdfReadReport:{paragraphsReflowed:true}}});
  assert.ok(result.buckets[11].join('').includes(paras[5]));
  assert.equal(result.paragraphBuckets[7],11);
  assert.ok(!result.buckets.flat().join('').includes(paras[3]));
 }
 const task=numberedGeotechSections({name:'report.docx',blocks:{paras:['一、勘察任务',...paras.slice(1)]}});
 assert.ok(!task.buckets.flat().join('').includes(paras[5]));
});
