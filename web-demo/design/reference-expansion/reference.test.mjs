import test from 'node:test';
import assert from 'node:assert/strict';
import {referenceText,reportTable,sectionBlocks,nativeTableHTML} from '../../reference-report.js';
import {detailedGeotech} from '../../geotech-document.js';
import {REFERENCE_TABLES as T} from '../../reference-template-data.js';

const state=()=>({parameters:{},document:{units:[{name:'教学楼',floors:'5',area:'8000'}]},regulations:[]});
test('单体缺项留空，规划与消防高度标明口径，原表合并表头保留',()=>{
 const s=state();s.document.units[0].planningHeight='23.25';s.document.units[0].fireHeight='22.05';
 const t=reportTable(s,'units');assert.equal(t.rows[2].values[2],'');assert.equal(t.rows[2].values[3],'');
 assert.equal(t.rows[2].values[4],'23.25（规划）\n22.05（消防）');
 assert.match(nativeTableHTML(t),/rowspan="2"/);assert.match(nativeTableHTML(t),/colspan="/);
});
test('减隔震章节按项目开关出现，参数表随统一措施变化，中震参数不借用多遇参数',()=>{
 const s=state();assert.doesNotMatch(referenceText(s,'criteria'),/抗震性能目标/);
 s.parameters={has_damp:'是',period_reduce:'0.8',alpha_max:'0.16',alpha_m:'0.45'};
 assert.match(referenceText(s,'criteria'),/抗震性能目标/);
 const values=()=>Object.fromEntries(reportTable(s,'parameters').rows.map(r=>r.values));
 assert.equal(values()['周期折减系数'],'0.8');assert.equal(values()['水平地震影响系数最大值（中震）'],'0.45');
 s.parameters.period_reduce='0.9';assert.equal(values()['周期折减系数'],'0.9');
});
test('国家规范可删改，地方规范取联动清单，抗震等级按单体已有参数填写',()=>{
 const s=state();s.referenceNorms={national:[]};assert.equal(reportTable(s,'national').rows.length,1);
 s.regulations=[{selected:true,kind:'local',title:'地方标准',code:'DBJ-TEST'}];
 assert.deepEqual(reportTable(s,'local').rows[1].values,['地方标准','DBJ-TEST']);
 assert.equal(reportTable(s,'grades').rows[2].values[2],'');
 s.unitParameters={'教学楼':{struct_sys:'框架',g_frame:'二级'}};
 assert.deepEqual(reportTable(s,'grades').rows[2].values.slice(1,3),['框架','二级']);
});
test('未上传图片不占正文，上传图片按图名和章节插入',()=>{
 const s=state();assert.deepEqual(sectionBlocks(s,'overview','[[image:site-plan]]'),[]);
 s.reportImages={'site-plan':{data:'data:image/png;base64,AAAA',caption:'图1 总平面图'}};
 assert.deepEqual(sectionBlocks(s,'overview','[[image:site-plan]]').map(b=>b.kind),['image','caption']);
 assert.equal(sectionBlocks(s,'overview','[[image:site-plan]]')[1].text,'图1 总平面图');
});
test('地勘按章节边界提取、图片去重；桩工艺表头来自当前勘察',()=>{
 const geo=detailedGeotech({name:'当前勘察.doc',source_id:'geo',blocks:{paras:['（四）场地地形、地貌条件 12','（四）场地地形、地貌条件','地形为缓坡。','（五）地质岩性构成','①填土。','（六）土的物理力学性质指标','指标见表。','（七）水文地质条件','地下水说明。','（八）其他'],tables:[],images:[{id:'a',afterParagraph:3,caption:'场地地貌',data:'a'},{id:'b',afterParagraph:3,caption:'场地地貌',data:'a'}]}});
 assert.match(geo.text,/4.1 场地地形及地貌\n地形为缓坡。/);assert.match(geo.text,/4.2 场地地层岩性构成\n①填土。/);assert.equal(geo.images.length,1);
 const s=state();s.document.geotech={tables:[{key:'strength',rows:[['名称'],['②黏土','18','1','2','6','','','120']]},{key:'pile',rows:[['名称','旋挖成孔灌注桩'],['②黏土','55','1200']]}]};
 const t=reportTable(s,'soil');assert.equal(t.rows[0].values[4],'旋挖成孔灌注桩');assert.deepEqual(t.rows[2].values,['②黏土','18','120','6','55','1200']);
});
test('主要技术指标保留原表结构，但不继承历史计算值',()=>{
 const s=state();const t=reportTable(s,'metrics');assert.equal(t.rows.length,T[19].rows.length);
 assert.equal(t.rows[0].values[1],'');assert.equal(T[19].rows[0][1].text,'');
 s.model={metrics:{mass:'1234',T1:'1.2',drift_env_x:'1/600'}};
 const result=reportTable(s,'metrics');assert.equal(result.rows[0].values[1],'1234');assert.equal(result.rows[3].values[2],'1.2');assert.equal(result.rows[14].values[2],'1/600');
});
test('OUT原字段的风和地震抗倾覆比、六阶振型及剪重比完整进入表格',()=>{
 const s=state();s.model={metrics:{over_wind_x:'571.05',over_wind_y:'395.80',over_eq_x:'52.97',over_eq_y:'38.26',periods:[{n:4,T:'0.3',tr:'0.8',tor:'0.2'}],shear_x:'10434.70',shear_x_r:'3.465'}};
 const rows=reportTable(s,'metrics').rows;
 assert.deepEqual(rows[21].values.slice(-2),['571.05','395.80']);assert.deepEqual(rows[22].values.slice(-2),['52.97','38.26']);
 assert.deepEqual(rows[6].values.slice(-3),['0.3','0.8','0.2']);assert.equal(rows[12].values[2],'10434.70 / 3.465%');
});
test('材料按构件与地上地下位置联动，楼面荷载和地震表直接采用当前措施',()=>{
 const s=state();s.templateTables={concrete:[['构件','位置','等级'],['楼盖（梁、板）','地上','C30'],['','地下','C35'],['框架柱','纯地下室车库','C35'],['','地上及投影范围内车库','C50~C60']],floor:[['项次','类别','标准值'],['1','教室','2.5']]};s.parameters={intensity:'8',pga:'0.20g',eq_group:'第三组',site_class:'II 类',tg:'0.45',alpha_max:'0.16'};
 assert.equal(reportTable(s,'concrete').rows[3].values[2],'C35');assert.equal(reportTable(s,'concrete').rows[6].values[2],'C50~C60');assert.equal(reportTable(s,'concrete').rows[7].values[2],'C30');
 assert.equal(reportTable(s,'earthquake').rows[1].values[1],'8');assert.equal(reportTable(s,'floor').rows[1].values[1],'2.5');s.templateTables.floor[1][2]='3.5';assert.equal(reportTable(s,'floor').rows[1].values[1],'3.5');
});
test('多层规则性表只保留一个单体，历史有无判定清空，六类始终可判断',()=>{
 const s=state();let t=reportTable(s,'regularity');assert.equal(t.rows[0].values.length,4);assert.equal(t.rows[0].values[3],'教学楼');assert.equal(t.rows.length,7);assert.ok(t.rows.slice(1).every(r=>r.values[3]===''));
 s.regularity={unit:'本项目单体',rows:t.rows.slice(1).filter(r=>r.values[0]!=='2')};s.regularity.rows[0].values[3]='无';t=reportTable(s,'regularity');assert.equal(t.rows.length,7);assert.equal(t.rows[1].values[3],'无');assert.equal(t.rows[0].values[3],'本项目单体');
});
