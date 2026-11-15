import test from 'node:test';
import assert from 'node:assert/strict';
import {seismicGrade,gradeInput} from '../../seismic-grade-core.js';
import {lookupSeismicGrade} from '../../server/mcp-engineering.mjs';

const config={height:23,heightBasis:'main-roof-above-outdoor',buildingUse:'other',structure:'混凝土框架-剪力墙结构',pga:'0.20g',category:'乙类',site:'III 类',special:'ordinary'};
test('MCP与网页查表共同接受数字、数字字符串和页面带度选项',()=>{
  const expected=lookupSeismicGrade({config:{...config,intensity:8}});
  for(const intensity of [8,'8','8度','8 度',' 8 度 ']){
    assert.deepEqual(lookupSeismicGrade({config:{...config,intensity},parameters:{intensity}}),expected);
    assert.deepEqual(lookupSeismicGrade({config,parameters:{intensity}}),expected);
    assert.deepEqual(seismicGrade(gradeInput(config,{intensity})),seismicGrade({...config,intensity:8}));
  }
});
test('归一化不接受混合说明或越界烈度，不掩盖加速度冲突',()=>{
  for(const intensity of ['8度或9度','8abc','10度',''])assert.ok(seismicGrade({...config,intensity}).missing.includes('设防烈度'));
  assert.equal(seismicGrade({...config,intensity:'8度',pga:'0.10g'}).status,'special');
});
