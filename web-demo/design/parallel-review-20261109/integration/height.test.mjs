import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectEngineeringProject} from '../../../server/mcp-engineering.mjs';
import {fragments,combinedParameters} from '../../../intake-core.js';
test('MCP height uses adopted architecture and preserves manual blank, unit isolation',()=>{
 const blocks={paras:['甲楼：抗震计算高度23.7m；建筑高度24m。'],tables:[[['单体名称','建筑面积'],['甲楼','1000'],['乙楼','2000']]]};
 const intake={facts:[],seismicGrades:{},sources:[{source_id:'QA-ARCH',slot:'bldg',blocks,fragments:fragments(blocks)}]};
 const parameters={struct_sys:'混凝土框架结构',intensity:'7',pga:'0.10g',seismic_cat:'丙类',site_class:'II 类'};
 const read=unit=>inspectEngineeringProject({projectId:'c'.repeat(32),unit,records:{main:{parameters},intake}});
 assert.equal(read('甲楼').parameters.seismic_height_m,'23.7');assert.equal(read('甲楼').seismicHeightSource.kind,'architecture');assert.ok(read('甲楼').seismicGrade);
 assert.equal(read('乙楼').parameters.seismic_height_m,undefined);
 intake.seismicGrades.甲楼={height:'25'};assert.equal(read('甲楼').parameters.seismic_height_m,combinedParameters(intake,'甲楼',parameters).seismic_height_m);
 intake.seismicGrades.甲楼.height='';assert.equal(read('甲楼').parameters.seismic_height_m,undefined);assert.equal(read('甲楼').seismicHeightSource.kind,'manual');
});
