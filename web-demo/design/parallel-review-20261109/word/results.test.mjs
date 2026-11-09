import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDisplacementResults,displacementCase,correctModelResults} from '../../../model-out-results.js';
import {reportTable,editReportCell,nativeTableHTML} from '../../../reference-report.js';
import {filterParameters,parameterItems,documentParameters} from '../../../office-word-parameters.js';
export const caseText=(n,title,den,floor,ratio='1.1',rfloor='2')=>`=== 工况${n} === ${title}\n最大层间位移角: 1/${den} (${floor}层)\n最大层间位移与平均层间位移的比值: ${ratio} (${rfloor}层)\n`;
export const displacementFixture=[caseText(1,'X向地震作用',1000,2),caseText(2,'X向双向地震作用',900,3),caseText(3,'Y向地震作用',800,4),caseText(4,'Y向双向地震作用',750,5),caseText(5,'X向地震作用（考虑偶然偏心）',200,6),caseText(6,'30度地震作用',100,7),caseText(7,'X向30度地震作用',50,8),caseText(8,'X+方向规定水平力',1100,2,'1.25','8'),caseText(9,'Y-方向规定水平力',1200,3,'1.33','9'),caseText(10,'X向风荷载',1500,4)].join('\n');
test('explicit case filters precede extrema; corresponding floors survive',()=>{
 const r=parseDisplacementResults(displacementFixture);
 assert.equal(r.drift_env_x,'1/900（3 层）');assert.equal(r.drift_env_y,'1/750（5 层）');assert.equal(r.drift_ecc_x,'1/200（6 层）');
 assert.equal(r.disp_ratio_x,'1.25');assert.equal(r.disp_ratio_x_floor,'8');assert.equal(r.disp_ratio_y_floor,'9');assert.equal(r.drift_wind_x,'1/1500（4 层）');
 assert.equal(displacementCase('30度地震作用'),null);assert.equal(displacementCase('未知工况'),null);
 const y=parseDisplacementResults(caseText(1,'Y+方向规定水平力',900,1,'1.4','6'));
 assert.equal(y.disp_ratio_x,'');assert.equal(y.disp_ratio_y_floor,'6');
});
test('report keeps X/Y components, torsion and direction-specific ratio floors',()=>{
 const state={identity:{unit:'QA楼'},model:{metrics:{...parseDisplacementResults(displacementFixture),periods:[{n:1,T:'0.51',x:'1.0',y:'0.0',tr:'1.0',tor:'0.02'}]}}};
 const rows=reportTable(state,'metrics').rows;
 assert.deepEqual(rows[3].values.slice(-3),['0.51','(1.0 + 0.0)','0.02']);
 assert.deepEqual(rows[15].values.slice(-2),['1.25（8 层）','1.33（9 层）']);assert.doesNotMatch(rows[14].values[1],/中震/);
});
test('pile safety is independent, zero remains a value, drafts survive refresh',()=>{
 const state={parameters:{pile:'甲级',pile_gamma:'  桩土承载力 1.0；桩身承载力 1.1',gamma0_found:' 1.0 '}};
 let table=reportTable(state,'classification');assert.equal(table.rows[7].values[1],'');assert.equal(table.rows[5].values[1],'1.0');assert.ok(table.rows[8].values[1].startsWith('桩土'));
 assert.equal(editReportCell(state,'classification',table.rows[7].rowKey,1,'二级'),true);state.parameters.pile='乙级';table=reportTable(state,'classification');assert.equal(table.rows[7].values[1],'二级');
 assert.match(nativeTableHTML(table,{editCells:true}),/contenteditable="true"/);
 assert.equal(reportTable({parameters:{gamma0:0}},'classification').rows[2].values[1],'0');
});
test('parameter filtering uses name, key and value; empty values are omitted',()=>{
 const items=parameterItems({project_name:'QA教学楼',pile_safety:'二级',missing:'',zero:0});
 assert.equal(filterParameters(items,'桩基 二级')[0].key,'pile_safety');assert.equal(filterParameters(items,'PROJECT_NAME')[0].value,'QA教学楼');assert.equal(filterParameters(items,'不存在').length,0);assert.equal(items.find(x=>x.key==='zero').value,'0');
});
test('document parameter source stays on its own project and unit',async()=>{
 const projectId='a'.repeat(32),calls=[];
 const fetcher=async url=>{calls.push(url);return {ok:true,json:async()=>({record:{data:url.endsWith('/main')?{parameters:{project_name:'文档项目',struct_sys:'公共体系'}}:{facts:[{status:'confirmed',unit:'甲楼',key:'struct_sys',value:'甲楼体系'},{status:'confirmed',unit:'乙楼',key:'struct_sys',value:'乙楼体系'}]}}})};};
 const parentWindow={WorkbenchProjects:{id:'b'.repeat(32)},WorkbenchIntake:{parameters:()=>{throw Error('不得读取其他项目');}}};
 const items=await documentParameters({projectId,unit:'甲楼'},{fetcher,parentWindow});
 assert.equal(items.find(x=>x.key==='struct_sys').value,'甲楼体系');assert.ok(calls.every(url=>url.includes(projectId)));
 let requested;parentWindow.WorkbenchProjects.id=projectId;parentWindow.WorkbenchIntake.parameters=unit=>{requested=unit;return {project_name:'当前未保存稿'};};
 const draft=await documentParameters({projectId,unit:'甲楼'},{fetcher,parentWindow});assert.equal(requested,'甲楼');assert.equal(draft[0].value,'当前未保存稿');
});
test('period parsing keeps spaced components from first model table only',()=>{
 const result=correctModelResults({},[{name:'WZQ.OUT',text:'1 0.51 0.0 1.0 ( 1.0 + 0.0 ) 0.02\n2 0.43 90 1.0(0.0+1.0) 0.03\n1 99.0 0 1.0(1.0+0.0) 0.05'}]);
 assert.equal(result.periods.length,2);assert.equal(result.periods[0].x,'1.0');assert.equal(result.periods[0].tor,'0.02');
});
test('corrected case summaries replace legacy diagnostics',()=>{
 const log=['质量保持','地震位移角包络（旧）X 1/50','逐层位移比已读取（旧）'];
 const metrics=correctModelResults({},[{name:'WDISP.OUT',text:displacementFixture}],log);
 assert.deepEqual(log.slice(0,1),['质量保持']);assert.doesNotMatch(log.join('\n'),/旧|1\/50/);assert.match(log.join('\n'),/1\/900（3 层）/);assert.equal(metrics.ratios.X[0].floor,8);
});
