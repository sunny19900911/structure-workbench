import test from 'node:test';
import assert from 'node:assert/strict';
import {fragments,extractLocal,resolveSeismicConfig,combinedParameters} from '../../../intake-core.js';
import {composeDocument} from '../../../document-intake.js';
const source=(paras,tables=[],id='test')=>{const blocks={paras,tables};return {slot:'bldg',source_id:id,blocks,fragments:fragments(blocks)};};
const state=sources=>({sources,facts:[],seismicGrades:{}});
test('distinct height and elevation meanings survive document and candidate extraction',()=>{
 const s=source(['单体名称：甲楼','甲楼：建筑高度24m；结构高度23.4m；抗震计算高度23.7m；消防高度22.8m；规划高度25m。','±0.000对应绝对标高为56.5m；屋面结构标高23.4m。']);
 const d=composeDocument([s]);
 // A schedule establishes the unit, without changing paragraph evidence.
 const scoped=source(s.blocks.paras,[[['单体名称','建筑面积'],['甲楼','1200']]]);
 const u=composeDocument([scoped]).units[0];
 assert.equal(u.height,'24');assert.equal(u.structuralHeight,'23.4');assert.equal(u.seismicHeight,'23.7');
 assert.equal(u.zeroElevation,'56.5');assert.equal(u.roofElevation,'23.4');
 assert.equal(u.fireHeight,'22.8');assert.equal(u.planningHeight,'25');
 const f=extractLocal(scoped).facts;
 assert.ok(f.some(x=>x.key==='height_seismic_m'&&x.unit==='甲楼'&&x.value==='23.7'));
 assert.ok(f.some(x=>x.key==='elevation_zero_m'&&x.value==='56.5'));
 assert.equal(resolveSeismicConfig(state([scoped]),'甲楼').config.height,'23.7');
});
test('architectural, structural, fire and datum levels never become seismic height',()=>{
 const s=source(['甲楼：建筑高度24m；结构高度23m；消防高度22m；±0.000相当于绝对标高56m。'],[[['单体名称','建筑面积'],['甲楼','1000']]]);
 const st=state([s]);st.facts=[{unit:'甲楼',key:'height_m',status:'confirmed',value:'23',source_id:s.source_id}];
 assert.equal(resolveSeismicConfig(st,'甲楼').config.height,'');
 assert.equal(combinedParameters(st,'甲楼',{}).seismic_height_m,'');
});
test('manual edit including an intentional blank wins; sources and units remain isolated',()=>{
 const make=n=>source([`甲楼：抗震计算高度${n}m。`],[[['单体名称','建筑面积'],['甲楼','1000'],['乙楼','2000']]],'source-'+n);
 const st=state([make(24)]);
 assert.equal(resolveSeismicConfig(st,'甲楼').config.height,'24');
 assert.equal(resolveSeismicConfig(st,'乙楼').config.height,'');
 st.seismicGrades.甲楼={height:'30',source_id:'USER'};
 st.sources=[make(26)];assert.equal(resolveSeismicConfig(st,'甲楼').config.height,'30');
 st.seismicGrades.甲楼.height='';assert.equal(resolveSeismicConfig(st,'甲楼').config.height,'');
 delete st.seismicGrades.甲楼;assert.equal(resolveSeismicConfig(st,'甲楼').config.height,'26');
 st.sources=[];assert.equal(resolveSeismicConfig(st,'甲楼').config.height,'');
 assert.equal(resolveSeismicConfig(state([make(17)]),'甲楼').config.height,'17');
});
test('conflicting seismic values stay empty, including same-unit prose and table',()=>{
 const s=source(['甲楼：抗震计算高度24m。','甲楼：抗震计算高度25m。'],[[['单体名称','建筑面积','抗震计算高度（m）'],['甲楼','1000','23']]]);
 const u=composeDocument([s]).units[0];
 assert.equal(u.seismicHeight,'');assert.deepEqual(u.geometryConflicts.seismicHeight,['23','24','25']);
 assert.equal(resolveSeismicConfig(state([s]),'甲楼').config.height,'');
});
test('narrative named building keeps tower/podium floors, not planned neighbours',()=>{
 const s=source(['某学校宿舍项目设计说明','项目位于测试市校园。基地规划三栋建筑，其中西侧规划为实训楼，南侧规划为教学楼。宿舍楼位于校园，层数地上5、10层，地下两层。建筑消防高度（最不利点）：37.9米。','宿舍总建筑面积约为：20000㎡。','本学生宿舍为女生宿舍。']);
 const d=composeDocument([s]);assert.equal(d.projectName,'某学校宿舍项目');assert.equal(d.location,'测试市校园');
 assert.deepEqual(d.allUnitNames,['宿舍楼']);assert.equal(d.units[0].floors,'5、10；地下2');assert.equal(d.units[0].area,'20000');assert.equal(d.units[0].fireHeight,'37.9');
 assert.equal(resolveSeismicConfig(state([s]),'宿舍楼').config.height,'');
});
test('numbered sections supply the same scoped seismic field without a table',()=>{
 const s=source(['1. 甲楼','建筑面积：1000㎡','建筑层数：地上5层','抗震计算高度：20m','2. 乙楼','建筑面积：2000㎡','建筑层数：地上6层','抗震计算高度：24m']);
 assert.deepEqual(composeDocument([s]).units.map(u=>u.seismicHeight),['20','24']);
 assert.equal(resolveSeismicConfig(state([s]),'乙楼').config.height,'24');
 assert.equal(extractLocal(s).facts.filter(f=>f.key==='height_seismic_m').length,2);
});
