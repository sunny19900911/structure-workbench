import test from 'node:test';
import assert from 'node:assert/strict';
import {numberedGeotechSections} from '../../../geotech-numbered-sections.js';
const parse=paras=>numberedGeotechSections({name:'scan-text.pdf',blocks:{paras,pdfReadReport:{paragraphsReflowed:true}}});
test('parenthetical continuation stays in stability rather than turning into fault heading',()=>{
 const p=['一、不良地质作用','场区内无边坡','（滑坡或潜在滑坡）、亦无全新活动断裂、地裂缝、地面沉降、崩塌、泥石流等不良','地质作用，故场地属基本稳定。'];
 const n=parse(p);assert.equal(n.buckets[8].join(''),p.slice(1).join(''));assert.equal(n.buckets[7].length,0);
 assert.deepEqual(n.evidence.map(e=>e.locator),['提取段落 2','提取段落 3','提取段落 4']);
});
test('note ending with a cited table number keeps its text and tail; real caption stays separate',()=>{
 const p=['一、桩基础评价','桩基设计参数表表18','注：1.上表负摩阻力系数依据《建筑桩基技术规范》表5.4.4-1及表5.3.12','进行取值。2.端阻力值进行了适当折减。'];
 const n=parse(p);assert.equal(n.buckets[12].join(''),p.slice(2).join(''));assert.equal(n.paragraphBuckets[1],12);
});
