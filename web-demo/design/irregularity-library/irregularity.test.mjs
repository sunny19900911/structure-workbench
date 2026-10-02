import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {irregularityCategories,irregularityAnswer,setIrregularityAnswer,setMeasureDraft,chooseMeasure,measureDraft,irregularityMeasureBlocks} from '../../irregularity-library.js';
import {reportTable,referenceText,sectionBlocks,blocksHTML} from '../../reference-report.js';
import {dependencies} from '../../expansion-core.js';
const state=()=>({parameters:{},document:{units:[{name:'教学楼'}]}});
test('六类都有独立键，34段历史措施保留原文来源，承载力缺项不编造',()=>{
 assert.equal(irregularityCategories.length,6);assert.equal(irregularityCategories.flatMap(c=>c.cases).length,34);
 for(const c of irregularityCategories)for(const item of c.cases){assert.ok(item.source_id&&item.sha256&&item.section&&item.locator&&item.text);assert.equal(item.statement,'原文事实');}
 const last=irregularityCategories.at(-1);assert.equal(last.name,'楼层承载力突变');assert.equal(last.common.text,'');assert.deepEqual(last.cases,[]);
});
test('未判断不默认为否；是展开措施，否隐藏措施，切回是保留人工稿',()=>{
 const s=state();assert.equal(irregularityAnswer(s,'torsion'),'');assert.deepEqual(irregularityMeasureBlocks(s),[]);
 const old=dependencies(s);setIrregularityAnswer(s,'torsion','yes');assert.notEqual(dependencies(s),old);
 assert.ok(irregularityMeasureBlocks(s).some(b=>b.text.includes('扭转不规则应对措施')));
 setMeasureDraft(s,'torsion','本单体人工修改后的措施。');setIrregularityAnswer(s,'torsion','no');assert.deepEqual(irregularityMeasureBlocks(s),[]);
 setIrregularityAnswer(s,'torsion','yes');assert.equal(irregularityMeasureBlocks(s)[1].text,'本单体人工修改后的措施。');
 assert.deepEqual(irregularityMeasureBlocks(JSON.parse(JSON.stringify(s))),irregularityMeasureBlocks(s));
 assert.equal(irregularityAnswer(state(),'torsion'),'');
});
test('原先删掉的分类恢复为未判断，不自动勾选；原判定有无迁移',()=>{
 const s=state();s.regularity={rows:[{source:1,values:['1','扭转不规则','人工判据','有']}]};
 const table=reportTable(s,'regularity');assert.equal(table.rows.length,7);assert.equal(table.rows[1].values[3],'有');assert.equal(table.rows[2].values[3],'');
 setIrregularityAnswer(s,'torsion','no');assert.equal(reportTable(s,'regularity').rows[1].values[3],'无');
 setIrregularityAnswer(s,'torsion','');assert.equal(reportTable(s,'regularity').rows[1].values[3],'');
});
test('选择历史版本可追溯，各版本人工修改互不覆盖，空稿不被默认稿顶替',()=>{
 const s=state(),item=irregularityCategories[0].cases[0];setMeasureDraft(s,'torsion','通用人工稿');
 chooseMeasure(s,'torsion',item.id);assert.equal(measureDraft(s,'torsion').text,item.text);assert.deepEqual(measureDraft(s,'torsion').source_ids,[item.source_id]);
 setMeasureDraft(s,'torsion','');assert.equal(measureDraft(s,'torsion').text,'');
 chooseMeasure(s,'torsion','common');assert.equal(measureDraft(s,'torsion').text,'通用人工稿');
 chooseMeasure(s,'torsion',item.id);assert.equal(measureDraft(s,'torsion').text,'');
});
test('网页和Word共用展开结果，否不残留措施或下拉框，其他类别独立',()=>{
 const s=state();setIrregularityAnswer(s,'reentrant','yes');setIrregularityAnswer(s,'torsion','no');
 const blocks=sectionBlocks(s,'special',referenceText(s,'special'));const html=blocksHTML(blocks);
 assert.match(html,/10.2.1 凹凸不规则应对措施/);assert.doesNotMatch(html,/扭转不规则应对措施|<select|data-irregularity/);
 setIrregularityAnswer(s,'capacity','yes');assert.equal(measureDraft(s,'capacity').text,'');
 setMeasureDraft(s,'capacity','本项目承载力措施');assert.ok(irregularityMeasureBlocks(s).some(b=>b.text==='本项目承载力措施'));
});
test('正式页面规则表以是/否替换删除，不影响表1删行',async()=>{
 const js=await readFile(new URL('../../expansion-workbench.js',import.meta.url),'utf8');
 assert.doesNotMatch(js,/data-regularity-delete/);assert.match(js,/data-irregularity-answer/);assert.match(js,/data-unit-delete/);
});
