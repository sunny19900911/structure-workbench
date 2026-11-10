import test from 'node:test';
import assert from 'node:assert/strict';
import {numberedGeotechSections} from '../../../geotech-numbered-sections.js';
function parse(paras){return numberedGeotechSections({name:'report.pdf',blocks:{paras,pdfReadReport:{paragraphsReflowed:true}}});}
test('Chinese numbered conclusion with colon retains wrapped numbered facts',()=>{
 const paras=['六、地质条件可能造成的工程风险','七、结论与建议：',
 '1.拟建场区地下水及地基土对混凝土结构及钢筋混凝土结构中的钢筋均具微腐',
 '蚀性，基础设计时须采取相应的防腐措施。',
 '2.根据拟建场地的水文地质条件及环境条件，本项目长短期抗浮水位取室外地面',
 '设计标高，即取27.10m。','八、其他说明：'];
 const n=parse(paras);assert.ok(n.buckets[11].join('').includes(paras[2]+paras[3]));
 assert.ok(n.buckets[13].join('').includes(paras[4]+paras[5]));
});
test('contents and investigation instructions remain excluded',()=>{
 const n=parse(['目录','七、结论与建议：........16','一、勘察任务','1.查明地下水及地基土的腐蚀性，为设计提供依据。']);
 assert.ok(!n||!n.buckets.flat().join('').includes('查明地下水'));
});
