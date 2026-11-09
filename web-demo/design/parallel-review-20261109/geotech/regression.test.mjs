import test from 'node:test';
import assert from 'node:assert/strict';
import {detailedGeotech} from '../../../geotech-document.js';
import {fragments} from '../../../intake-core.js';
import {reportTable} from '../../../reference-report.js';
const source=(paras,tables=[],ordered=[])=>{const blocks={paras,tables,ordered};return {name:'合成报告.docx',source_id:'synthetic',blocks,fragments:fragments(blocks)};};
test('automatic Word outline starts the body after a TOC without visible numeric text',()=>{
 const s=source(['目录','软土震陷……8','附图、附表：','土工试验成果表（2张）','场地地震效应评价','软土震陷','②层需考虑软土震陷的影响。']);
 s.blocks.paragraphMeta=[{},{},{},{},{headingLevel:0},{headingLevel:1},{}];
 const d=detailedGeotech(s);assert.match(d.text,/②层需考虑软土震陷/);assert.doesNotMatch(d.text,/2张|成果表/);
});
test('a task-only source cannot revive its numeric soil table through fallback',()=>{
 const s=source(['一、勘察任务','应查明下列地基参数。'],[[['层号','土层名称','承载力特征值(kPa)'],['①','待查土','999']]], [{type:'p',index:0},{type:'p',index:1},{type:'table',index:0}]);
 assert.doesNotMatch(JSON.stringify(detailedGeotech(s)),/999/);
});
test('semantic terrain and strata headings retain data, TOC/attachments/climate cannot leak',()=>{
 const s=source(['目录','2.1 地貌、地形- 3 -','2.2 地层特征描述3','附图、附表：','物理力学指标统计表（3张）','钻孔柱状图（5张）','1 前言','2 场地工程地质、水文地质条件','2.1 气候条件','年均气温21度。','2.2 地貌、地形','地貌为河谷。','2.3 场地地层结构与岩性','2.3.1 地层特征描述','①填土厚2m。','3 水文地质','地下水为潜水。','Ⅱ 附图表部分','物理力学指标统计表（3张）','钻孔柱状图（5张）']);
 const d=detailedGeotech(s);assert.match(d.text,/河谷/);assert.match(d.text,/填土厚2m/);assert.doesNotMatch(d.text,/柱状图|3张|年均气温|附图/);
});
test('transposed soil parameters retain layer columns and conditions',()=>{
 const s=source(['4 地基承载力特征值','承载力建议表 表4.1'],[[['层 号','①','②'],['fak(kPa)','65','125'],['注：①层取值须以载荷试验复核。','注：①层取值须以载荷试验复核。','注：①层取值须以载荷试验复核。']]], [{type:'p',index:0},{type:'p',index:1},{type:'table',index:0}]);
 const d=detailedGeotech(s);assert.deepEqual(d.tables.find(t=>t.key==='strength').rows.slice(1).map(r=>[r[0],r.at(-1)]),[['①','65'],['②','125']]);assert.match(d.text,/载荷试验复核/);assert.ok(d.evidence.some(e=>e.locator==='提取表 1 列 2'));
});
test('same-named layers stay distinct, c never becomes compression modulus',()=>{
 const s=source(['物理力学参数'],[[['层号','土层名称','天然重度(kN/m3)','粘聚力C(kPa)','承载力特征值(kPa)'],['①','粉土','18','12','110'],['②','粉土','19','15','150']]], [{type:'p',index:0},{type:'table',index:0}]);
 const d=detailedGeotech(s),t=reportTable({parameters:{},document:{geotech:d}},'soil');
 assert.deepEqual(t.rows.slice(2).map(r=>r.values),[['① 粉土','18','110','','',''],['② 粉土','19','150','','','']]);assert.match(d.text,/粘聚力C\(kPa\)：12/);
});
test('explicit zones cannot supply complementary parameters to each other',()=>{
 const s=source(['物理力学参数'],[[['分区','层号','土层名称','天然重度(kN/m3)'],['东区','①','黏土','18']],[['分区','层号','土层名称','承载力特征值(kPa)'],['西区','①','黏土','130']]], [{type:'p',index:0},{type:'table',index:0},{type:'table',index:1}]);
 const rows=detailedGeotech(s).tables.find(t=>t.key==='strength').rows.slice(1);
 assert.deepEqual(rows.map(r=>[r[0],r[1],r.at(-1)]),[['东区 ① 黏土','18',''],['西区 ① 黏土','','130']]);
});
test('conflicting tests and multiple pile methods stay in source data without arbitrary selection',()=>{
 const s=source(['物理力学参数'],[[['层号','土层名称','压缩模量Es0.1-0.2(MPa)','承载力特征值(kPa)'],['①','黏土','5','100']],[['层号','土层名称','压缩模量Es0.1-0.2(MPa)'],['①','黏土','7']],[['层号','土层名称','预制桩极限侧阻力(kPa)','灌注桩极限侧阻力(kPa)'],['①','黏土','20','25']]], [{type:'p',index:0},{type:'table',index:0},{type:'table',index:1},{type:'table',index:2}]);
 const d=detailedGeotech(s);assert.equal(d.tables.find(t=>t.key==='strength').rows[1][4],'');assert.equal(d.tables.find(t=>t.key==='pile'),undefined);assert.match(d.text,/预制桩极限侧阻力\(kPa\)：20/);assert.match(d.text,/灌注桩极限侧阻力\(kPa\)：25/);
});
test('foundation and anti-float remain separate and keep zone/period conditions',()=>{
 const d=detailedGeotech(source(['4 基础方案','4.1 天然地基','东区建议采用独立基础。','4.2 桩基','西区建议采用灌注桩。','4.3 抗浮设防水位','施工期按3m，永久期东区按5m、西区按6m。','4.4 桩基施工建议','泥浆配置说明。']));
 assert.match(d.foundationText,/东区.*\n西区/s);assert.match(d.antifloatText,/施工期按3m.*永久期东区按5m、西区按6m/);assert.doesNotMatch(d.foundationText,/泥浆|永久期/);
});
