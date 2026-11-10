import test from 'node:test';
import assert from 'node:assert/strict';
import {numberedGeotechSections} from '../../../geotech-numbered-sections.js';
test('Chinese task hierarchy exits contents mode before a wrapped numbered task can masquerade as result',()=>{
 const paras=['目录','一、工程概况........1','附表','附图','附件',
 '一、工程与勘察工作概况：','(一)拟建工程概况','(二)勘察的目的、任务和要求及依据的技术标准',
 '2.查明拟建场区内岩土层的类型、深度、工程特性，分析和评价地基的稳定性、',
 '均匀性和承载力。','3.查明地下水类型、赋存条件，判定地下水腐蚀性。',
 '二、场地地形地貌','场地地势平坦。','三、水文地质','地下水具有微腐蚀性。'];
 const n=numberedGeotechSections({name:'report.pdf',blocks:{paras,pdfReadReport:{paragraphsReflowed:true}}});
 assert.equal(n.paragraphBuckets[8],-1);assert.equal(n.paragraphBuckets[9],-1);assert.equal(n.paragraphBuckets[10],-1);
 assert.ok(n.buckets[0].includes('场地地势平坦。'));assert.ok(n.buckets[11].includes('地下水具有微腐蚀性。'));
 assert.ok(!n.evidence.some(e=>/查明/.test(e.text)));
});
