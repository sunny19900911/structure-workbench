import test from 'node:test';
import assert from 'node:assert/strict';
import {numberedGeotechSections} from '../../../geotech-numbered-sections.js';
test('numbered soil-layer statement stays content under stability, including Word heading style',()=>{
 for(const name of ['source.pdf','source.docx']){
  const sentence='（3）层淤泥质粉质黏土属于软土，工程性质较差，场地内局部分布，层厚变化较大';
  const source={name,blocks:{paras:['4 场地稳定性评价',sentence,'5 场地类别','场地类别为Ⅲ类。'],paragraphMeta:[{},name.endsWith('docx')?{headingLevel:1}:{},{},{}],pdfReadReport:{paragraphsReflowed:true}}};
  const n=numberedGeotechSections(source);
  assert.ok(n.buckets[8].includes(sentence));assert.ok(n.buckets[4].includes('场地类别为Ⅲ类。'));
  assert.ok(!n.sections.some(s=>s.index===1));
 }
});
test('investigation requirements and ordinary numbered headings remain excluded or structural',()=>{
 const n=numberedGeotechSections({name:'source.pdf',blocks:{paras:['1 勘察任务','1.1 场地稳定性评价','（3）层软土应查明性质','2 场地稳定性评价','（3）软土工程评价','有效评价结论。'],pdfReadReport:{paragraphsReflowed:true}}});
 assert.ok(!n.buckets.flat().some(t=>t.includes('应查明')));
 assert.ok(n.sections.some(s=>s.index===4));
});
