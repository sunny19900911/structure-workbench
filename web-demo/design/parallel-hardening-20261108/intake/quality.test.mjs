import test from 'node:test';
import assert from 'node:assert/strict';
import {fragments,extractLocal,validateExtraction} from '../../../intake-core.js';
import {composeDocument,createDocumentComposer} from '../../../document-intake.js';
import {referenceText,reportTable,sectionBlocks} from '../../../reference-report.js';
import {tableRecords} from '../../../intake-structure.js';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readWordSource} from '../../../server/word-source.mjs';
const source=(slot,blocks,id=slot)=>({slot,blocks,source_id:id,name:id+'.docx',fragments:fragments(blocks)});

test('task context and TOC are rejected in facts and actual report, recommendations and notes survive',()=>{
 const geo=source('geo',{paras:[
  '（四）地震液化问题31','一、勘察任务要求',
  '（2）查明场地内岩土层的类型、深度及分布，提供地基承载力指标。',
  '（3）地下水的埋藏条件及腐蚀性应提供评价。',
  '二、勘察结论与建议','所有钻孔深度范围内均未见到稳定的地下水。',
  '场地20.00m深度内无饱和粉土和砂类土，可不考虑砂土液化影响。',
  '场地土对混凝土结构具微腐蚀性。',
  '建议采用桩基础，以④2中风化石灰岩为桩端持力层；施工时应进行检验。',
  '注：场平后的填土层剪切波速按160m/s考虑。',
 ]});
 const original=JSON.stringify(geo),facts=extractLocal(geo).facts,d=composeDocument([geo]);
 assert.ok(facts.some(f=>f.key==='geo_water'));
 assert.ok(facts.some(f=>f.key==='geo_corrosivity'));
 assert.ok(facts.some(f=>/160m/.test(f.value)));
 assert.ok(facts.some(f=>f.key==='geo_foundation'&&f.statement==='作者观点'));
 assert.doesNotMatch(JSON.stringify(facts),/提供地基|应提供评价|液化问题31/);
 const state={parameters:{},document:d};
 const text=referenceText(state,'ground')+referenceText(state,'foundation');
 assert.doesNotMatch(text,/提供地基|应提供评价|液化问题31/);
 for(const value of ['未见到稳定的地下水','微腐蚀性','不考虑砂土液化','160m/s','施工时应进行检验'])assert.ok(text.includes(value),value);
 assert.equal(JSON.stringify(geo),original);
 const bad=geo.fragments[2];
 assert.equal(validateExtraction({facts:[{key:'geo_strata',value:bad.text,quote:bad.text,fragment_id:bad.id}]},geo).facts.length,0,'AI validation shares context filter');
});

test('controlled names and key/value schedules do not turn field labels into project names',()=>{
 const arch=source('bldg',{paras:['项目名称：匿名学校建设项目 设计证书编号：TEST-ONLY'],tables:[[['工程名称','匿名学校建设项目'],['工程地点','测试市'],['气候区','温和地区'],['外墙太阳辐射吸收系数','0.75']]]});
 const facts=extractLocal(arch).facts.filter(f=>f.key==='project_name');
 assert.equal(facts.length,2);assert.ok(facts.every(f=>f.value==='匿名学校建设项目'));
 assert.equal(composeDocument([arch]).projectName,'匿名学校建设项目');
 const malformed={...arch,fragments:[{id:'old',text:'工程名称：工程地点；匿名学校：测试市',locator:'提取表 1 行 2'}]};
 assert.equal(extractLocal(malformed).facts.filter(f=>f.key==='project_name').length,0);
});

test('multi-level headers and units retain exact correspondence; anonymous columns are not facts',()=>{
 const rows=[['土层名称及代号','室内土工试验','室内土工试验'],['土层名称及代号','天然重度（kN/m³）','含水率（%）'],['④4粉质黏土','19.0','26.8']];
 const records=tableRecords(rows);assert.equal(records.length,1);
 assert.deepEqual(records[0].fields[2].path,['室内土工试验','含水率（%）']);
 assert.equal(records[0].fields[2].value,'26.8');
 const geo=source('geo',{tables:[rows]});assert.match(extractLocal(geo).facts[0].value,/含水率（%）：26.8/);
 const unknown=source('geo',{tables:[[['土层名称',''],['④4粉质黏土','26.8']]]});
 assert.equal(unknown.fragments[0].kind,'unmapped');assert.equal(extractLocal(unknown).facts.length,0);
});

test('multiple facts from one paragraph are retained without broadcasting duplicate prose',()=>{
 const geo=source('geo',{paras:['场地土对混凝土结构具微腐蚀性。所有钻孔均未见地下水。地层为粉质黏土。']});
 const facts=extractLocal(geo).facts;assert.equal(facts.length,3);
 assert.equal(new Set(facts.map(f=>f.fragment_id)).size,1);
 const body=referenceText({parameters:{},document:composeDocument([geo])},'ground');
 assert.equal(body.split('所有钻孔均未见地下水').length-1,1);
});

test('unit geometry uses latest architecture; geo quotations keep geo source and scoped foundations',()=>{
 const arch=source('bldg',{tables:[[['单体名称','建筑面积（㎡）','地上层数','建筑高度（米）','规划高度（m）','消防高度（m）','主要功能'],['甲楼','1200','5','21.30','22.00','20.80','教学'],['乙楼','2000','6','24.00','25.00','23.50','住宿']]]});
 const geo=source('geo',{tables:[[['建（构）筑物名称','地上/地下层数','建筑高度（米）','建议基础型式','持力层建议'],['甲楼','4/0','19.00','桩基础','④2中风化石灰岩'],['乙楼','5/1','21.00','独立基础','③粉质黏土'],['注：上述桩长为有效桩长，最终应以静载荷试验结果进行设计。']]],paras:['总建筑面积66997.63平方米。']});
 const facts=extractLocal(geo).facts;
 assert.ok(facts.some(f=>f.key==='height_arch_m'&&f.unit==='甲楼'&&f.value==='19.00'&&f.slot==='geo'));
 assert.ok(facts.some(f=>f.key==='bldg_total'&&f.category==='bldg'&&f.slot==='geo'));
 assert.ok(facts.some(f=>f.key==='floors_below'&&f.unit==='乙楼'&&f.value==='1'));
 const composer=createDocumentComposer(),d=composer([arch,geo],'甲楼');
 assert.equal(d.units.length,1);assert.equal(d.units[0].height,'21.30');assert.equal(d.units[0].area,'1200');
 assert.equal(d.units[0].planningHeight,'22.00');assert.equal(d.units[0].fireHeight,'20.80');
 const text=referenceText({parameters:{},document:d},'foundation');
 assert.match(text,/甲楼.*桩基础.*④2/);assert.doesNotMatch(text,/乙楼|独立基础/);assert.match(text,/最终应以静载荷/);
 assert.ok(d.evidence.some(e=>e.source_id==='geo'&&e.locator==='提取表 1 行 2'));
 const latest=source('bldg',{paras:['项目名称：匿名学校新资料']},'new');
 assert.equal(composeDocument([arch,latest,geo]).units.length,0,'missing new architecture must not inherit old geometry');
 const state={parameters:{},document:d,unitTable:{cells:{'甲楼':{8:'人工用途'}}}};
 assert.equal(reportTable(state,'units').rows[2].values[8],'人工用途');
});

test('merged DOCX headers survive readWordSource through facts and real report table slots',async()=>{
 const qa=new URL('../../../qa/parallel-hardening/intake/',import.meta.url);await mkdir(qa,{recursive:true});
 const file=new URL('merged-synthetic.docx',qa);
 const python=process.env.WORKBENCH_PYTHON||(process.platform==='win32'?join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'):'python3');
 await promisify(execFile)(python,[fileURLToPath(new URL('make-fixture.py',import.meta.url)),fileURLToPath(new URL('../../portable/fixtures/architecture.docx',import.meta.url)),fileURLToPath(file)],{windowsHide:true});
 const blocks=await readWordSource(await readFile(file),false,'merged-synthetic.docx');
 assert.deepEqual(blocks.tables[0][0],['土层名称及代号','室内土工试验','室内土工试验','室内土工试验']);
 assert.equal(blocks.tables[0][1][0],'土层名称及代号');
 assert.equal(blocks.tableMeta[0].rows[0].cells[1].span,3);
 assert.equal(blocks.tableMeta[0].rows[1].cells[0].verticalMerge,'continue');
 const geo=source('geo',blocks),f=extractLocal(geo).facts[0];
 assert.match(f.value,/含水率（%）：26.8/);assert.match(f.value,/天然重度（kN\/m³）：19.0/);
 assert.doesNotMatch(f.value,/列\d/);
 const document=composeDocument([geo]),table=reportTable({parameters:{},document},'soil');
 assert.deepEqual(table.rows[2].values,['④4粉质黏土','19.0','180','','','']);
 assert.equal(document.geotech.tables.find(t=>t.key==='strength').rawRows[2][1],'26.8','raw values remain available');
 const state={parameters:{},document},spec=new URL('report-spec.json',qa),output=new URL('report-native.docx',qa);
 await writeFile(spec,JSON.stringify({blocks:sectionBlocks(state,'ground',referenceText(state,'ground'))}));
 await promisify(execFile)(python,[fileURLToPath(new URL('../../../server/reference-docx.py',import.meta.url)),fileURLToPath(spec),fileURLToPath(output)],{windowsHide:true});
 const exported=await readWordSource(await readFile(output),false,'report-native.docx');
 const soilRow=exported.tables.flat().find(r=>r[0]==='④4粉质黏土');
 assert.deepEqual(soilRow,['④4粉质黏土','19.0','180','','',''],'native DOCX uses the same mapped values as the web report');
});

test('task tables are not revived by document composition and short subheadings are not facts',()=>{
 const geo=source('geo',{paras:['一、勘察任务要求','二、勘察结论','（1）地层岩性','场地土为粉质黏土。'],tables:[[['建（构）筑物名称','建议基础型式'],['甲楼','桩基础']]],ordered:[{type:'p',index:0},{type:'table',index:0},{type:'p',index:1},{type:'p',index:2},{type:'p',index:3}]});
 assert.doesNotMatch(JSON.stringify(extractLocal(geo).facts),/地层岩性|甲楼/);
 assert.doesNotMatch(referenceText({parameters:{},document:composeDocument([geo])},'foundation'),/甲楼/);
 assert.match(referenceText({parameters:{},document:composeDocument([geo])},'ground'),/粉质黏土/);
});

test('known unit paragraph scope and measurement headings retain actual values',()=>{
 const arch=source('bldg',{paras:['甲楼：建筑高度21.30m。','乙楼：建筑高度24.00m。'],tables:[[['单体名称','建筑面积'],['甲楼','1200'],['乙楼','2000']]]});
 const facts=extractLocal(arch).facts;
 assert.ok(facts.some(f=>f.unit==='甲楼'&&f.key==='height_arch_m'&&f.value==='21.30'));
 assert.ok(facts.some(f=>f.unit==='乙楼'&&f.key==='height_arch_m'&&f.value==='24.00'));
 const geo=source('geo',{paras:['（1）地下水位埋深2m','（2）场地类别为Ⅱ类','建议采用桩基础；应查明桩端持力层完整性。']});
 assert.ok(extractLocal(geo).facts.some(f=>f.key==='geo_water'));
 assert.match(referenceText({parameters:{},document:composeDocument([geo])},'foundation'),/应查明桩端持力层完整性/);
});

test('incompatible table units are preserved but never relabelled as metres',()=>{
 const arch=source('bldg',{tables:[[['单体名称','建筑高度（cm）','消防高度（mm）'],['甲楼','2130','20800']]]});
 assert.ok(!extractLocal(arch).facts.some(f=>/height/.test(f.key)));
 assert.equal(composeDocument([arch]).units[0].fireHeight,'');
 assert.equal(composeDocument([arch]).units[0].height,'');
 assert.match(arch.fragments[0].text,/20800/);
});
