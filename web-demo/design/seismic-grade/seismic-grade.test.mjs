import test from 'node:test';
import assert from 'node:assert/strict';
import {seismicGrade,tableGrades,gradeParameters} from '../../seismic-grade-core.js';
import {combinedParameters,freshIntake,unitNames} from '../../intake-core.js';
import {reportTable} from '../../reference-report.js';
const base={height:'20',structure:'混凝土框架结构',intensity:'7',pga:'0.10g',category:'标准设防类（丙类）',site:'II 类'};
const run=x=>seismicGrade({...base,...x});
test('普通框架24m边界、乙类提高一度而不改地震作用烈度',()=>{
 assert.equal(run({}).frame,'三级');assert.equal(run({height:'24'}).frame,'三级');assert.equal(run({height:'24.1'}).frame,'二级');
 const b=run({category:'乙类'});assert.equal(b.frame,'二级');assert.equal(b.effectiveIntensity,8);assert.equal(base.intensity,'7');
 assert.equal(run({intensity:'8',pga:'0.2g',category:'乙类'}).frame,'一级');
});
test('框剪、墙及核心筒按不同构件和高度分支',()=>{
 assert.deepEqual(tableGrades('dual',20,7,'gb'),{frame:4,wall:3,wallBase:null});
 assert.deepEqual(tableGrades('dual',60,7,'jgj'),{frame:3,wall:2,wallBase:null});
 assert.equal(tableGrades('dual',60.1,7,'jgj').frame,2);
 assert.equal(tableGrades('wall',24,8,'gb').wall,3);assert.equal(tableGrades('wall',80,7,'jgj').wall,3);assert.equal(tableGrades('wall',80.1,7,'jgj').wall,2);
 assert.equal(run({structure:'混凝土剪力墙结构'}).frame,'');
 assert.equal(run({structure:'框架-核心筒结构',height:'55'}).wall,'二级');
 assert.equal(run({structure:'框架-核心筒结构',height:'61',coreAsDual:'yes'}).status,'special');
});
test('跨度18m分界；8度0.20g和0.30g不同高度限制',()=>{
 assert.equal(run({span:'17.99'}).frame,'三级');assert.equal(run({span:'18'}).frame,'二级');
 assert.equal(run({height:'38',intensity:'8',pga:'0.30g'}).status,'special');assert.equal(run({height:'38',intensity:'8',pga:'0.20g'}).frame,'一级');
 assert.equal(run({intensity:'8',pga:''}).status,'incomplete');assert.equal(run({intensity:'8',pga:'0.1g'}).status,'special');
});
test('场地仅调整构造；9度乙类与超高减隔震边界',()=>{
 const s=run({pga:'0.15g',site:'III类'});assert.equal(s.frame,'三级');assert.equal(s.frameDetail,'二级');
 const hard=run({site:'I类',reduceSiteI:'yes'});assert.equal(hard.frame,'三级');assert.equal(hard.frameDetail,'四级');
 for(const x of [{special:'isolation'},{height:'70'},{heightClass:'B'},{category:'甲类'},{structure:'钢框架结构'}])assert.equal(run(x).frame,'');
 assert.equal(run({structure:'混凝土框架-剪力墙结构',height:'40',intensity:'9',pga:'0.4g',category:'乙类'}).frame,'特一级');
 const b=run({height:'30',intensity:'8',pga:'0.2g',category:'乙类'});assert.equal(b.frame,'一级');assert.match(b.frameDetail,/更有效/);
});
test('少墙50%严格边界、相连裙房、地下二层不降低计算等级',()=>{
 const x={structure:'混凝土框架-剪力墙结构',special:'fewWalls'};
 assert.equal(run({...x,frameMomentPercent:'50'}).frame,'四级');assert.equal(run({...x,frameMomentPercent:'50.1'}).frame,'三级');assert.equal(run({...x,frameMomentPercent:''}).frame,'');
 assert.equal(run({special:'podium',mainFrame:'一级'}).frame,'一级');assert.equal(run({special:'podium'}).frame,'');
 const d=run({basementFixed:'yes',basements:'3'}).basement;assert.equal(d[0].frame,'三级');assert.equal(d[1].frame,'');assert.equal(d[1].frameDetail,'四级');assert.equal(d[2].frameDetail,'四级');
});
test('缺失或无效输入不生成等级，旧项目未启用查表时保持原参数',()=>{
 for(const x of [{height:''},{height:'0'},{height:'-1'},{intensity:'7/8'},{category:''},{structure:''}])assert.equal(run(x).frame,'');
 assert.deepEqual(gradeParameters(undefined,{}),{});
});
test('单体隔离、公共参数变化重算；空结果不回退旧项目一级',()=>{
 const state=freshIntake();state.seismicGrades={A:{height:'20',structure:'混凝土框架结构'},B:{height:'30',structure:'混凝土框架结构'}};
 const p={intensity:'7',pga:'0.1g',seismic_cat:'丙类',site_class:'II类',g_frame:'一级'};
 assert.deepEqual(unitNames(state),['A','B']);assert.equal(combinedParameters(state,'A',p).g_frame,'三级');assert.equal(combinedParameters(state,'B',p).g_frame,'二级');
 assert.equal(combinedParameters(state,'A',{...p,intensity:'8',pga:'0.2g'}).g_frame,'二级');
 state.seismicGrades.A.height='';assert.equal(combinedParameters(state,'A',p).g_frame,'');
 const table=reportTable({document:{units:[{name:'A'}]},parameters:p,unitParameters:{A:combinedParameters(state,'A',p)}},'grades');assert.equal(table.rows.at(-1).values[2],'');
});

test('住宅高规边界与人工新增单体进入扩初表',()=>{
 assert.equal(run({buildingUse:'residential',height:'24',floors:'10'}).basis,'jgj');
 assert.equal(run({buildingUse:'residential',height:'27',floors:'9'}).basis,'gb');
 assert.equal(run({buildingUse:'residential',height:'27',floors:''}).status,'incomplete');
 assert.equal(run({site:'III类',pga:''}).frameDetail,'');
 const t=reportTable({document:{units:[]},unitParameters:{新增楼:{struct_sys:'混凝土框架结构',g_frame:'三级'}}},'grades');
 assert.deepEqual(t.rows.at(-1).values.slice(0,3),['新增楼','混凝土框架结构','三级']);
});

test('9度乙类硬场地仅构造可按本度；8度0.30g乙类软场地叠加构造',()=>{
 const x={structure:'混凝土框架-剪力墙结构',height:'40',intensity:'9',pga:'0.4g',category:'乙类',site:'I类',reduceSiteI:'yes'};
 assert.equal(run(x).frame,'特一级');assert.equal(run(x).frameDetail,'一级');
 assert.equal(run({structure:'混凝土框架-剪力墙结构',height:'40',intensity:'8',pga:'0.3g',category:'乙类',site:'III类'}).frameDetail,'特一级');
});
