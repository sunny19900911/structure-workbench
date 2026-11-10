import test from 'node:test';
import assert from 'node:assert/strict';
import {numberedGeotechSections} from '../../../geotech-numbered-sections.js';
test('foundation scheme conclusion preserves wrapped layer values and conditional backfill as advice',()=>{
 const paras=['6 结论与建议','4) 基础方案：门卫和操场可采用天然地基，视基础埋深位于',
 '②、③层土上，承载力特征值分别取80kPa、120kPa。局部填土较深，可采用换',
 '土回填处理，回填土经检验合格后，其承载力可取与周边土层一致。'];
 const n=numberedGeotechSections({name:'report.pdf',blocks:{paras,pdfReadReport:{paragraphsReflowed:true}}});
 assert.equal(n.buckets[12].join(''),paras.slice(1).join(''));
 assert.deepEqual(n.runs[12][0].paragraphs,[1,2,3]);
});
test('same words in investigation requirements cannot become a foundation conclusion',()=>{
 const n=numberedGeotechSections({name:'report.pdf',blocks:{paras:['1 勘察任务','2 结论与建议','查明基础方案并提供建议。'],paragraphMeta:[{headingLevel:0},{headingLevel:1},{}]}});
 assert.ok(!n||!n.buckets[12].length);
});
