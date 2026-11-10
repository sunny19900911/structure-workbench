import test from 'node:test';
import assert from 'node:assert/strict';
import {fragments} from '../../../intake-core.js';
import {geotechSectionBlocks} from '../../../geotech-section-blocks.js';
const source=(paras,tables)=>{const blocks={paras,tables,ordered:[{type:'p',index:0},{type:'p',index:1},{type:'table',index:0},{type:'p',index:2}]};return {source_id:'synthetic',name:'报告.docx',blocks,fragments:fragments(blocks)};};

test('native sections replace expanded table text while preserving source cells and surrounding conditions',()=>{
 const s=source(['4 水文地质','场地渗透系数表 表4','以上指标为建议值。'],[[['岩土名称','渗透系数','渗透性'],['黏土','0.01～0.04m/d','弱透水']]]);
 const original=JSON.stringify(s),d=geotechSectionBlocks(s),blocks=d.sections.flatMap(s=>s.blocks);
 assert.equal(blocks.filter(b=>b.kind==='geotech-source-table').length,1);
 assert.deepEqual(blocks.find(b=>b.kind==='geotech-source-table').rows,s.blocks.tables[0]);
 assert.ok(blocks.some(b=>b.text==='以上指标为建议值。'));
 assert.ok(!blocks.some(b=>b.text?.includes('渗透系数：')));assert.equal(JSON.stringify(s),original);
});
test('scoped export retains selected native rows without leaking another building from raw geometry',()=>{
 const s=source(['4 基础方案','基础建议表 表4','仅供比选。'],[[['建筑物名称','基础形式','持力层'],['甲楼','桩基础','⑦'],['乙楼','筏板基础','③']]]);
 const d=geotechSectionBlocks(s,'甲楼'),blocks=d.sections.flatMap(s=>s.blocks),table=blocks.find(b=>b.kind==='geotech-source-table');
 assert.ok(table);assert.match(JSON.stringify(table),/甲楼/);assert.doesNotMatch(JSON.stringify(table),/乙楼|筏板/);
 assert.deepEqual(table.scope.originalRows,[1,2]);
});
test('invalid merge geometry retains readable table values through an explicit fallback',()=>{
 const s=source(['4 水文地质','场地渗透系数表 表4','应结合现场条件。'],[[['岩土名称','渗透系数'],['黏土','0.1m/d']]]);
 s.blocks.tableMeta=[{cellOrigins:[]}];
 const d=geotechSectionBlocks(s),fallback=d.sections.flatMap(s=>s.blocks).find(b=>b.kind==='table-text-fallback');
 assert.ok(fallback);assert.match(fallback.paragraphs.join('\n'),/0.1m\/d/);assert.equal(d.warnings.length,1);
});
test('a merge shared with an excluded unit forces a scoped text fallback',()=>{
 const s=source(['4 基础方案','基础建议表 表4','仅供比选。'],[[['建筑物名称','基础形式','持力层'],['甲楼','桩基础','⑦'],['乙楼','筏板基础','⑦']]]);
 const box=(r,c)=>({bbox:[c,r,c+1,r+1]});
 s.blocks.tableMeta=[{cellOrigins:[[box(0,0),box(0,1),box(0,2)],
  [box(1,0),box(1,1),{bbox:[2,1,3,3]}],[box(2,0),box(2,1),{bbox:[2,1,3,3]}]]}];
 const d=geotechSectionBlocks(s,'甲楼'),fallback=d.sections.flatMap(s=>s.blocks).find(b=>b.kind==='table-text-fallback');
 assert.ok(fallback);assert.match(JSON.stringify(fallback),/甲楼/);assert.doesNotMatch(JSON.stringify(fallback),/乙楼|筏板/);
 assert.ok(d.warnings.some(w=>w.reason.includes('切断跨行合并')));
});
test('selected native body cells retain their original row identity after removing earlier units',()=>{
 const s=source(['4 基础方案','基础建议表 表4','仅供比选。'],[[['建筑物名称','基础形式','持力层'],['甲楼','桩基础','⑦'],['乙楼','筏板基础','③']]]);
 const d=geotechSectionBlocks(s,'乙楼'),table=d.sections.flatMap(s=>s.blocks).find(b=>b.kind==='geotech-source-table');
 assert.deepEqual(table.scope.originalRows,[1,3]);
 assert.equal(table.cells.find(c=>c.text==='③').row,1);assert.equal(table.cells.find(c=>c.text==='③').sourceCell.row,3);
});
test('horizontal building schedules retain every scenario column and shared full-width conditions',()=>{
 const rows=[['建筑物名称','甲楼','甲楼','乙楼','乙楼'],['基础埋深(m)','1.8','5.5','1.0','2.0'],
  ['基础持力层','⑦','⑦','⑦','⑦'],['基础形式','桩基础','桩基础','筏板','筏板'],
  ['注：仅为比选建议','注：仅为比选建议','注：仅为比选建议','注：仅为比选建议','注：仅为比选建议']];
 const s=source(['4 基础方案','基础建议表 表4','以上仅供参考。'],[rows]);
 const origins=rows.map((r,ri)=>r.map((_,ci)=>({bbox:[ci,ri,ci+1,ri+1]})));
 origins[0][1]=origins[0][2]={bbox:[1,0,3,1]};origins[0][3]=origins[0][4]={bbox:[3,0,5,1]};
 for(let c=1;c<5;c++)origins[2][c]={bbox:[1,2,5,3]};
 for(let c=0;c<5;c++)origins[4][c]={bbox:[0,4,5,5]};
 s.blocks.tableMeta=[{cellOrigins:origins}];const original=JSON.stringify(s);
 const t=geotechSectionBlocks(s,'甲楼').sections.flatMap(s=>s.blocks).find(b=>b.kind==='geotech-source-table');
 assert.ok(t);assert.deepEqual(t.scope.originalColumns,[1,2,3]);assert.deepEqual(t.rows[1],['基础埋深(m)','1.8','5.5']);
 assert.equal(t.cells.find(c=>c.text==='⑦').colSpan,2);assert.equal(t.cells.find(c=>c.text==='⑦').sharedAcrossUnits,true);
 assert.equal(t.cells.find(c=>c.text.startsWith('注：')).colSpan,3);assert.doesNotMatch(JSON.stringify(t),/乙楼|筏板/);
 assert.equal(t.headerRows,1);assert.equal(JSON.stringify(s),original);
 rows[3][2]=rows[3][3]='局部方案待定';origins[3][2]=origins[3][3]={bbox:[2,3,4,4]};
 const fallback=geotechSectionBlocks(s,'甲楼');
 assert.ok(fallback.warnings.some(w=>w.reason.includes('切断局部跨列')));
 assert.ok(fallback.sections.flatMap(s=>s.blocks).some(b=>b.kind==='table-text-fallback'));
});
test('source sequence interleaves two tables and their adjacent conditions',()=>{
 const paras=['4 水文地质','第一分区参数见下表。','渗透系数表 表1','上述参数仅适用于第一分区。','渗透系数表 表2','第二分区需另行复核。'];
 const table=[['岩土名称','渗透系数'],['黏土','0.1m/d']];
 const blocks={paras,tables:[table,table],ordered:[{type:'p',index:0},{type:'p',index:1},{type:'p',index:2},{type:'table',index:0},{type:'p',index:3},{type:'p',index:4},{type:'table',index:1},{type:'p',index:5}]};
 const s={name:'报告.docx',source_id:'synthetic',blocks,fragments:fragments(blocks)};
 const d=geotechSectionBlocks(s),water=d.sections.find(s=>s.title.startsWith('4.6'));
 assert.deepEqual(water.blocks.map(b=>b.kind),['paragraph','geotech-source-table','paragraph','geotech-source-table','paragraph']);
 assert.equal(water.blocks[2].text,paras[3]);assert.deepEqual(water.blocks[2].sourceParagraphs,[4]);
 assert.equal(d.tablePlacement,'source-order');
});
test('legacy PDF paragraph reflow cannot span an intervening source table',()=>{
 const s=source(['4 水文地质','参数见下表。','上表仅供参考。'],[[['岩土名称','渗透系数'],['黏土','0.1m/d']]]);
 s.name='报告.pdf';
 const d=geotechSectionBlocks(s),water=d.sections.find(s=>s.title.startsWith('4.6'));
 assert.deepEqual(water.blocks.map(b=>b.kind),['paragraph','geotech-source-table','paragraph']);
 assert.equal(water.blocks[0].text,'参数见下表。');assert.equal(water.blocks[2].text,'上表仅供参考。');
});
test('missing block order is reported rather than presented as restored source sequence',()=>{
 const s=source(['4 水文地质','场地渗透系数表 表4','应结合现场条件。'],[[['岩土名称','渗透系数'],['黏土','0.1m/d']]]);
 delete s.blocks.ordered;
 const d=geotechSectionBlocks(s);assert.equal(d.tablePlacement,'mixed');assert.ok(d.warnings.some(w=>w.reason.includes('缺少来源顺序')));
});
