import test from 'node:test';
import assert from 'node:assert/strict';
import {reportTable,nativeTableHTML,referenceText} from '../../reference-report.js';
import {lineSource,tableSource,parameterSource} from '../../report-provenance.js';
const state=()=>({parameters:{},document:{projectName:'测试项目',units:[{name:'教学楼',floors:'5'},{name:'食堂',floors:'2'}]}});
test('单体表人工值与空值优先；删行不修改输入，未编辑数据继续联动',()=>{
 const s=state();s.unitTable={cells:{'教学楼':{0:'教学楼A',1:''}},deleted:['食堂']};
 let t=reportTable(s,'units');assert.equal(t.rows.length,3);assert.deepEqual(t.rows[2].values.slice(0,2),['教学楼A','']);
 assert.equal(s.document.units.length,2);assert.equal(s.document.units[0].name,'教学楼');
 s.document.units[0].width='21';t=reportTable(s,'units');assert.equal(t.rows[2].values[3],'21');
 assert.equal(tableSource('units',t.rows[2],2,0),'');assert.equal(tableSource('units',t.rows[2],2,3),'bldg');
 assert.deepEqual(reportTable(JSON.parse(JSON.stringify(s)),'units'),t);
 s.unitTable.deleted.push('教学楼');assert.equal(reportTable(s,'units').rows.length,2);
});
test('网页版有编辑和删行控件，导出表格不带控件或来源颜色',()=>{
 const t=reportTable(state(),'units');const html=nativeTableHTML(t,{editUnits:true,source:(r,ri,ci)=>tableSource('units',r,ri,ci)});
 assert.match(html,/data-unit-delete="教学楼"/);assert.match(html,/contenteditable="true"/);assert.match(html,/data-source-kind="bldg"/);
 assert.doesNotMatch(nativeTableHTML(t),/contenteditable|data-unit-delete|data-source-kind/);
 assert.match(nativeTableHTML(t,{editUnits:true,editable:false}),/contenteditable="false"/);
});
test('规范辅助列去除，设计依据规范表保留',()=>{
 const s=state();s.templateTables={floor:[['类别','值'],['教室','2.5']]};
 for(const key of ['classification','floor','roof','equipment'])assert.ok(reportTable(s,key).rows.every(r=>r.values.length===2));
 assert.deepEqual(reportTable(s,'floor').rows[1].values,['教室','2.5']);assert.ok(reportTable(s,'national').rows.length>1);
});
test('源文着色，人工改写普通色；地勘参数仅在值仍匹配时标色',()=>{
 const s=state(),line=referenceText(s,'overview').split('\n')[0];assert.equal(lineSource(s,'overview',line),'bldg');
 assert.equal(lineSource(s,'overview',line+'人工补充'),'');s.sections={overview:{manualSourceLines:[line]}};assert.equal(lineSource(s,'overview',line),'');
 s.document.geotech={text:'4.1 地形\n场地平坦。'};assert.equal(lineSource(s,'ground','场地平坦。'),'geo');assert.equal(lineSource(s,'ground','4.1 地形'),'');
 s.document.parameters={site_class:'Ⅱ类',intensity:'8'};s.parameters={site_class:'II',intensity:'7'};
 assert.equal(parameterSource(s,'site_class'),'geo');assert.equal(parameterSource(s,'intensity'),'');
 assert.equal(tableSource('metrics',{values:['风荷载','52.97','38.26']},21,1),'yjk');
});
