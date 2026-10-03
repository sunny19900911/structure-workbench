import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {reportTable} from '../../reference-report.js';
const context=vm.createContext({window:{}});
for(const f of ['measure-template.js','floor-live-loads.js'])vm.runInContext(readFileSync(new URL('../../'+f,import.meta.url),'utf8'),context);
const api=context.window.FloorLiveLoads,copy=x=>JSON.parse(JSON.stringify(x));
test('按用户清单展开17种取值，只有序号、类别和标准值，不含系数',()=>{
 assert.equal(api.rows.length,17);
 assert.deepEqual(copy(api.rows.filter(r=>/厨房|楼梯|阳台/.test(r[0]))),[['厨房（餐厅）','4.0'],['厨房（其他）','2.0'],['楼梯（多层住宅）','2.0'],['楼梯（其他）','3.5'],['阳台（人员密集）','3.5'],['阳台（其他）','2.5']]);
 assert.doesNotMatch(api.section,/ψ|组合值|频遇|准永久/);
 assert.match(context.window.MeasureTemplate.paper,/data-floor-load-version/);
});
test('旧默认清单升级，人工类别及取值保留，匹配类别不重复补回',()=>{
 const old=[['教室','2.5']];assert.deepEqual(copy(api.mergeRows(old,old)),copy(api.rows));
 const custom=[['厨房（餐厅）','5.0'],['特殊设备间','15.0']];
 const merged=copy(api.mergeRows(custom,old));assert.deepEqual(merged.slice(0,2),custom);assert.equal(merged.filter(r=>r[0]==='厨房（餐厅）').length,1);
 assert.equal(api.upgrade('已签发原文',true),'已签发原文');
});
test('删行后重排仅改序号，不改名称和荷载；扩初与Word读取删改后的同一表',()=>{
 const data=[['1','办公楼','2.5'],['3','厨房（餐厅）','5.0']];
 const table={rows:[{querySelector:s=>s==='th'?{}:null},...data.map(r=>({querySelector:s=>s==='th'?null:{set textContent(v){r[0]=v;}}}))]};
 api.renumber({closest:()=>({querySelector:()=>table})});assert.deepEqual(data,[['1','办公楼','2.5'],['2','厨房（餐厅）','5.0']]);
 const exported=reportTable({templateTables:{floor:[['序号','类别','活荷载标准值（kN/m²）'],...data]}},'floor');
 assert.deepEqual(exported.rows.slice(1).map(r=>r.values),[['办公楼','2.5'],['厨房（餐厅）','5.0']]);
});
