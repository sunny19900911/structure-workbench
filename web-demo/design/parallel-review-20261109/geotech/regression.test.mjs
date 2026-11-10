import test from 'node:test';
import assert from 'node:assert/strict';
import {detailedGeotech} from '../../../geotech-document.js';
import {fragments} from '../../../intake-core.js';
import {reportTable} from '../../../reference-report.js';
import {numberedGeotechSections} from '../../../geotech-numbered-sections.js';
const source=(paras,tables=[],ordered=[])=>{const blocks={paras,tables,ordered};return {name:'合成报告.docx',source_id:'synthetic',blocks,fragments:fragments(blocks)};};
test('pile estimates retain scenarios and limitations without supplying fixed design slots',()=>{
 const paras=['（二）桩基础的有关估算指标','最终应以桩的静载试验结果进行桩基础的设计。','桩基估算指标表 表14','本次估算结果仅供设计参考。','单桩竖向极限承载力标准值估算结果表 表15'];
 const tables=[[['土层名称及代号','桩周极限侧阻力标准值qsik(kPa)','桩端极限端阻力标准值qpk(kPa)'],['②黏土','55','1200']],[['试算点孔号','桩端持力层','预计桩长(米)','桩径800mm Quk(kN)'],['ZK1','④石灰岩','10.0','10751.3'],['ZK2','④石灰岩','12.0','12000']]];
 const s=source(paras,tables,[{type:'p',index:0},{type:'p',index:1},{type:'p',index:2},{type:'table',index:0},{type:'p',index:3},{type:'p',index:4},{type:'table',index:1}]);
 for(const name of ['报告.docx','报告.pdf']){s.name=name;const d=detailedGeotech(s);assert.match(d.foundationText,/最终应以桩的静载试验结果/);assert.match(d.foundationText,/仅供设计参考/);assert.match(d.foundationText,/10751.3/);assert.equal(d.tables.find(t=>t.key==='pile'),undefined);for(let i=0;i<2;i++){const t=d.tables.find(t=>t.key==='source-'+(i+1));assert.equal(t.estimateOnly,true);assert.deepEqual(t.rawRows,tables[i]);}}
 s.blocks.paras[0]='一、勘察任务';assert.equal(detailedGeotech(s).tables.find(t=>t.key==='source-1'),undefined);
});

test('named laboratory result sections retain statistics without relabelling them as design bearing values',()=>{
 const paras=['2.4 土的物理力学性质','2.4.3 室内岩石饱和单轴抗压强度试验','岩石试验成果统计表 表2.4.3','2.4.4 自由膨胀率试验','自由膨胀率统计表 表2.4.4','2.4.5 剪切试验','剪切指标建议值 表2.4.5'];
 const tables=[[['岩层名称 统计指标','平均值(MPa)','标准值(MPa)'],['④中风化玄武岩','22.20','20.26']],[['土层名称','平均值%'],['②粉质黏土','146']],[['土层名称','粘聚力Ck(kPa)','内摩擦角Φk(度)'],['②粉质黏土','40.0','11.4']]];
 const ordered=paras.flatMap((_,index)=>[{type:'p',index},...([2,4,6].includes(index)?[{type:'table',index:(index-2)/2}]:[])]);
 for(const name of ['报告.docx','报告.pdf']){
  const s=source(paras,tables,ordered);s.name=name;const before=JSON.stringify(s),d=detailedGeotech(s);
  for(let i=0;i<3;i++)assert.deepEqual(d.tables.find(t=>t.key==='source-'+(i+1)).rawRows,tables[i]);
  assert.match(d.text,/标准值\(MPa\)：20.26/);assert.match(d.text,/平均值%：146/);assert.equal(d.tables.find(t=>t.key==='strength'),undefined);assert.equal(JSON.stringify(s),before);
 }
 const task=source(['一、勘察任务','（一）自由膨胀率试验','应测定膨胀率。']);assert.doesNotMatch(numberedGeotechSections(task)?.buckets.flat().join('')||'',/应测定/);
});

test('karst caption and borehole alias retain multiple cavities in the same hole',()=>{
 const rows=[['钻孔','顶板埋深(m)','底板埋深(m)','洞高H(m)','充填物','顶板厚度(m)'],['ZK67','10.1','13.1','3','部分充填黏土','3.9'],['ZK67','18.1','19.2','1.1','黏土','5.0']];
 for(const name of ['报告.docx','报告.pdf']){
  const s=source(['五、岩溶评价','钻探揭露溶洞（隙）统计表 表11'],[rows],[{type:'p',index:0},{type:'p',index:1},{type:'table',index:0}]);s.name=name;
  const before=JSON.stringify(s),d=detailedGeotech(s),t=d.tables.find(t=>t.key==='source-1');assert.deepEqual(t.rawRows,rows);assert.equal(t.records.filter(r=>r.kind==='table_row').length,2);assert.match(d.text,/顶板埋深\(m\)：10.1/);assert.match(d.text,/顶板埋深\(m\)：18.1/);assert.equal(JSON.stringify(s),before);
  s.blocks.paras[0]='一、勘察任务';assert.equal(detailedGeotech(s).tables.find(t=>t.key==='source-1'),undefined);
 }
});

test('corrosion caption identifies measured-result tables while preserving exposure conditions',()=>{
 const rows=[['分项评价内容','评价主要指标','试验结果','评价依据','评价结果','备注'],['对钢筋','Cl-（mg/L）','93.72～170.40','100~500(弱)','弱腐蚀性','按干湿交替评价'],['对钢筋','Cl-（mg/L）','93.72～170.40','＜10000(微)','微腐蚀性','按长期浸水评价']];
 for(const name of ['报告.docx','报告.pdf']){
  const s=source(['2.6 地下水','地下水的腐蚀性判定 表2.6-1'],[rows],[{type:'p',index:0},{type:'p',index:1},{type:'table',index:0}]);s.name=name;
  const before=JSON.stringify(s),d=detailedGeotech(s),t=d.tables.find(t=>t.key==='source-1');assert.deepEqual(t.rawRows,rows);assert.equal(t.records.filter(r=>r.kind==='table_row').length,2);assert.match(d.text,/按干湿交替评价/);assert.match(d.text,/按长期浸水评价/);assert.match(d.text,/试验结果：93.72～170.40/);assert.equal(JSON.stringify(s),before);
  s.blocks.paras[0]='一、勘察任务';assert.equal(detailedGeotech(s).tables.find(t=>t.key==='source-1'),undefined);
 }
});

test('building-and-structure name headers retain scoped foundation recommendations',()=>{
 for(const header of ['建（构）筑物名称','建(构)筑物名称']){
  const rows=[['序号',header,'场地整平后最大填土厚度（m）','建议基础型式','持力层建议'],['1','教学楼','17.70','桩基础','④2中风化石灰岩'],['2','大门','4.89','条形基础或独立基础','处理后的人工填土或②黏土']];
  const s=source(['六、基础形式建议','基础型式及持力层建议 表13'],[rows],[{type:'p',index:0},{type:'p',index:1},{type:'table',index:0}]);
  const before=JSON.stringify(s),d=detailedGeotech(s);assert.deepEqual(d.tables.find(t=>t.key==='source-1').rawRows,rows);assert.match(d.foundationText,/17.70/);assert.match(d.foundationText,/处理后的人工填土或②黏土/);
  const selected=detailedGeotech(s,'大门');assert.match(selected.foundationText,/4.89/);assert.doesNotMatch(selected.foundationText,/17.70|中风化石灰岩/);assert.equal(JSON.stringify(s),before);
  s.blocks.paras[0]='一、勘察任务';assert.equal(detailedGeotech(s).tables.find(t=>t.key==='source-1'),undefined);
 }
});

test('explicit uplift coefficient tables survive only in antifloat context without becoming pile resistance',()=>{
 const rows=[['土类','λ值'],['砂土','0.50'],['黏性土、粉土','0.70']];
 for(const name of ['报告.docx','报告.pdf']){
  const s=source(['8.2 抗浮评价','表8 抗拔系数λ'],[rows],[{type:'p',index:0},{type:'p',index:1},{type:'table',index:0}]);s.name=name;
  const before=JSON.stringify(s),d=detailedGeotech(s);assert.match(d.antifloatText,/λ值：0.50/);assert.match(d.antifloatText,/λ值：0.70/);assert.deepEqual(d.tables.find(t=>t.key==='source-1').rawRows,rows);assert.equal(d.tables.find(t=>t.key==='pile'),undefined);assert.equal(JSON.stringify(s),before);
  s.blocks.paras[0]='一、勘察任务';assert.equal(detailedGeotech(s).tables.find(t=>t.key==='source-1'),undefined);
  s.blocks.paras[0]='8.2 抗浮评价';s.blocks.paras[1]='表8 未说明系数';assert.equal(detailedGeotech(s).tables.find(t=>t.key==='source-1'),undefined);
 }
});

test('earthquake parameter headings retain the source clause, not historical regional earthquakes or tasks',()=>{
 for(const name of ['报告.docx','报告.pdf']){
  const s=source(['5.2 地震参数','场地抗震设防烈度为 8 度，设计基本地震加速度值为 0.30g，设计地震分组为第二组。','6 地下水','地下水稳定埋深2.00m。']);s.name=name;s.blocks.pdfReadReport={paragraphsReflowed:true};
  const n=numberedGeotechSections(s);assert.match(n.buckets[3].join(''),/烈度为 8 度/);assert.doesNotMatch(n.buckets[3].join(''),/地下水/);
  const task=source(['一、勘察任务','（一）地震参数','应查明抗震设防烈度。']);assert.doesNotMatch(numberedGeotechSections(task)?.buckets.flat().join('')||'',/应查明/);
 }
});

test('pile risk analysis retains source advice and conditions but cannot revive task requirements',()=>{
 for(const name of ['报告.docx','报告.pdf']){
  const s=source(['7.4 成桩风险分析及沉桩对周边环境的影响分析','采用管桩应注意挤土效应，可能导致已施工管桩上浮或倾斜、断桩。','钻孔灌注桩应防止砂层塌孔及软土缩径。','单桩竖向极限承载力标准值应通过静载试验确定。','8 基坑工程','8.1 基坑开挖','基坑深度约8m。']);
  s.name=name;s.blocks.pdfReadReport={paragraphsReflowed:true};
  const before=JSON.stringify(s),d=detailedGeotech(s);
  assert.match(d.foundationText,/上浮或倾斜、断桩/);assert.match(d.foundationText,/砂层塌孔及软土缩径/);assert.match(d.foundationText,/应通过静载试验确定/);assert.doesNotMatch(d.foundationText,/深度约8m/);assert.equal(JSON.stringify(s),before);
  const task=source(['一、勘察任务','（一）成桩风险评价','应调查成桩施工的地质风险，建议进行静载试验。']);
  assert.doesNotMatch(numberedGeotechSections(task)?.buckets.flat().join('')||'',/应调查/);
 }
});

test('combined geology-water chapters do not misclassify geography or numbered faults as groundwater',()=>{
 for(const name of ['报告.docx','报告.pdf']){
  const s=source(['一、场地工程及水文地质条件评价','（一）自然、地理环境','拟建场地位于甲街道，东临乙路。','（二）区域地质条件','1、区域地质构造','（1）小江断裂西支（3）','该断裂距场地约13.0km，属全新世活动断裂。','（2）白邑-横冲断裂（7）','该断裂距场地约4.00km。','（3）一朵云断裂（16）','该断裂距场地约3.50km。','2、地震','区域历史最大地震为8级。','（三）地下水','地下水稳定埋深为2.00m。','（四）地质岩性构成','（1）寒武系-下统∈1q','①强风化白云岩：裂隙发育。']);
  s.name=name;s.blocks.pdfReadReport={paragraphsReflowed:true};
  const before=JSON.stringify(s),n=numberedGeotechSections(s);
  assert.match(n.buckets[0].join('\n'),/甲街道/);
  assert.match(n.buckets[7].join('\n'),/小江断裂西支（3）/);
  for(const text of ['13.0km','4.00km','3.50km','8级'])assert.ok(n.buckets[7].join('\n').includes(text));
  assert.doesNotMatch(n.buckets[11].join('\n'),/甲街道|断裂|8级/);
  assert.match(n.buckets[11].join('\n'),/2.00m/);
  assert.match(n.buckets[1].join('\n'),/寒武系-下统∈1q/);
  assert.equal(JSON.stringify(s),before);
 }
});
test('geological age and origin subdivisions survive with evidence, but tasks and contents do not',()=>{
 for(const name of ['报告.docx','报告.pdf']){
  const p=['目录','1、近期人类活动形成的地层（Qml）........12','一、勘察任务','1、第四系地层调查','应查明地层组成。','二、地质岩性构成','1、近期人类活动形成的地层（Qml）','①素填土：结构松散。','2、第四系坡、残积相（Qdl+el）地层','②黏土：可塑。','三、地下水','地下水埋深2.0m。'];
  const s=source(p);s.name=name;s.blocks.pdfReadReport={paragraphsReflowed:true};
  const before=JSON.stringify(s),n=numberedGeotechSections(s),text=n.buckets[1].join('\n');
  assert.match(text,/1、近期人类活动形成的地层（Qml）/);
  assert.match(text,/2、第四系坡、残积相（Qdl\+el）地层/);
  assert.doesNotMatch(text,/调查|应查明|\.\.\.|地下水/);
  assert.ok(n.evidence.some(e=>e.locator==='提取段落 7'));
  assert.equal(JSON.stringify(s),before);
 }
});
test('body lines ending in a standard year or bare measurement are not discarded as contents entries',()=>{
 for(const name of ['报告.docx','报告.pdf']){
  const p=['目录','4.1 场地类别 12','4.2 地下水........13','4 场地类别','依据《建筑抗震设计规范》(GB50011-2010-2016','年版)判定场地类别为Ⅱ类。','5 地下水','甲区抗浮设防水位为105.50','m；乙区抗浮设防水位为104.20m。'];
  const s=source(p);s.name=name;s.blocks.pdfReadReport={paragraphsReflowed:true};
  const n=numberedGeotechSections(s),text=n.buckets.flat().join('\n');
  assert.match(text,/GB50011-2010-2016/);assert.match(text,/105.50/);assert.match(text,/104.20/);
  assert.doesNotMatch(text,/场地类别 12|地下水\.\.\./);
 }
});
test('attachment titles end conclusion and groundwater context without losing later test results',()=>{
 for(const name of ['合成报告.docx','合成报告.pdf']){
  const s=source(['八、结论与建议','地下水对混凝土具有微腐蚀性。','勘察工作量一览表','岩石抗压强度检验报告','综合图例','地下水稳定水位及标高','车库出入口','五、结论与建议','本场地等效剪切波速为276.86m/s，场地类别为Ⅱ类。']);
  s.name=name;s.blocks.pdfReadReport={paragraphsReflowed:true};
  const before=JSON.stringify(s),n=numberedGeotechSections(s),text=n.buckets.flat().join('\n');
  assert.match(text,/微腐蚀性/);assert.match(text,/276.86m\/s/);
  assert.doesNotMatch(text,/车库出入口|检验报告|地下水稳定水位及标高/);
  assert.equal(JSON.stringify(s),before);
 }
});
test('testing objectives and standard-classification subsections cannot revive as actual site conclusions',()=>{
 const s=source(['一、前言','测试的目的是对拟建建筑场地土的类型及建筑场地类别进行划','分，以确定建筑抗震有利、一般、不利和危险地段。','1、测定场地20米以内覆盖层深度的等效剪切波速','三、检测依据','划分场地土类型及建筑场地类别依照中华人民共和国国家标准','2、建筑场地类别划分标准','根据土层等效剪切波速和场地覆盖层厚度按下表划分为四类。','五、结论与建议','本场地等效剪切波速为276.86m/s，场地类别为Ⅱ类。']);
 const text=numberedGeotechSections(s).buckets.flat().join('\n');
 assert.doesNotMatch(text,/测试的目的|四类|依照中华人民共和国|测定场地/);assert.match(text,/276.86/);
});
test('numbered site-result labels with colons retain the actual layer wave speeds',()=>{
 const s=source(['五、结论与建议','1、场地土类型：','①素填土：Vs=143.07m/s，软弱土；','②粉质粘土：Vs=279.99m/s，中硬土；','2、建筑场地类别：','ZK35号孔：Vse=357.00m/s']);
 const n=numberedGeotechSections(s);assert.match(n.buckets[4].join('\n'),/143.07/);assert.match(n.buckets[4].join('\n'),/279.99/);assert.match(n.buckets[4].join('\n'),/357.00/);
});
test('horizontal building calculations retain separate scenarios and limitations rather than merging the same building',()=>{
 const rows=[['建筑物名称','甲楼','甲楼','乙楼'],['基础埋深（m）','1.8','5.5','2.5'],['基础持力层','⑤','⑥','④'],['基础形式','独立基础','独立基础','筏基'],['承载力验算结果','面积不小于27m²时局部满足','应处理局部软土','按原报告条件复核'],['注：地下室修正深度另取1.5m。','','','']];
 const s=source(['7 天然地基基础方案分析与评价','7.1 天然地基承载力验算','天然地基验算结果 表7.5'],[rows],[{type:'p',index:0},{type:'p',index:1},{type:'p',index:2},{type:'table',index:0}]);
 const d=detailedGeotech(s,'甲楼'),t=d.tables.find(t=>t.key==='source-1');assert.equal(t.transposed,true);assert.deepEqual(t.rawRows,rows);
 assert.match(d.foundationText,/1.8/);assert.match(d.foundationText,/5.5/);assert.match(d.foundationText,/局部满足/);assert.match(d.foundationText,/地下室修正深度另取1.5m/);assert.doesNotMatch(d.foundationText,/筏基/);assert.equal(d.tables.find(t=>t.key==='strength'),undefined);
 s.blocks.paras[0]='7 勘察任务';assert.equal(detailedGeotech(s).tables.find(t=>t.key==='source-1'),undefined);
});
test('foundation schedules keep building scope and composite pile values out of ordinary parameter columns',()=>{
 const p=['六、地基基础类型的分析与评价','（一）天然地基评价','天然地基基础形式建议表 表6-1','（二）复合地基评价','地基处理设计参数一览表 表6-4','（三）桩基础评价','1、静压预制桩','静压桩在该类地段施工应慎用。','（3）桩基类型选择','桩端进入持力层深度不应小于','3 倍桩径，桩长及桩径应结合荷载分布详细计算后确定，并应满足相关','规范要求。'];
 const a=[['拟建\n建筑物名称','建议持力层编号','建议基础形式'],['甲 楼','④','独立基础'],['乙楼','⑤','条形基础']];
 const b=[['土层名称','CFG桩端端阻力特征值qp(kPa)','旋喷桩端地基土承载力特征值qp(kPa)'],['黏土','350','250']];
 const s=source(p,[a,b],p.flatMap((_,index)=>[{type:'p',index},...(index===2?[{type:'table',index:0}]:index===4?[{type:'table',index:1}]:[])]));
 const d=detailedGeotech(s);assert.match(d.foundationText,/施工应慎用/);assert.match(d.foundationText,/3 倍桩径/);assert.equal(d.tables.find(t=>t.key==='pile'),undefined);assert.equal(d.tables.find(t=>t.key==='strength'),undefined);
 const selected=detailedGeotech(s,'甲楼');assert.match(selected.foundationText,/独立基础/);assert.doesNotMatch(selected.foundationText,/条形基础/);assert.deepEqual(s.blocks.tables[0],a);
 s.blocks.paras[0]='六、勘察任务';assert.doesNotMatch(detailedGeotech(s).foundationText,/独立基础|施工应慎用|350/);
});
test('a duplicate unlabelled soil cell does not hide a pile table, while genuinely unknown values remain rejected',()=>{
 const rows=[['','土层名称及编号','静压预制桩qsik(kPa)','钻孔灌注桩qsik(kPa)'],['黏土③','黏土③','70','68']];
 const s=source(['三、桩基础评价'],[rows],[{type:'p',index:0},{type:'table',index:0}]);
 const d=detailedGeotech(s);assert.ok(d.tables.find(t=>t.key==='source-1'));assert.equal(d.tables.find(t=>t.key==='pile'),undefined);
 s.blocks.tables[0][1][0]='未知部位';assert.equal(detailedGeotech(s).tables.find(t=>t.key==='source-1'),undefined);
});
test('expansive soil evaluation retains strata schedule and conditional estimates without becoming an adopted calculation',()=>{
 const p=['五、场地岩土工程地质分析与评价','（三）岩土层的胀缩性评价','1、各岩土层胀缩性等级','膨胀土胀缩性和膨胀土评价表 表5-3','2、膨胀土地基胀缩等级','假设基础埋深2m，以黏土④为持力层时，估算地基胀缩变形量为130.68mm。','以强风化泥岩⑤为持力层时，估算为72.07mm；综合考虑，场地胀缩等级为Ⅲ级。','上述为假设基础埋深2m的估算值，设计应根据实际基础埋深重新计算。'];
 const table=[['岩土层','自由膨胀率δef（%）','膨胀土胀缩性等级'],['黏土④','65.88','中等'],['强风化泥岩⑤','69.0','中等'],['备注','中风化泥岩⑥与强风化泥岩⑤具有相同胀缩性。','中风化泥岩⑥与强风化泥岩⑤具有相同胀缩性。']];
 const s=source(p,[table],p.flatMap((_,index)=>[{type:'p',index},...(index===3?[{type:'table',index:0}]:[])]));
 const before=JSON.stringify(s),d=detailedGeotech(s);for(const text of p.slice(5))assert.ok(d.text.includes(text));
 assert.ok(d.tables.some(t=>t.key==='source-1'));assert.match(d.text,/65.88/);assert.match(d.text,/69.0/);assert.equal(d.text.split('中风化泥岩⑥与强风化泥岩⑤具有相同胀缩性。').length-1,1);assert.equal(JSON.stringify(s),before);
 s.blocks.paras[0]='五、勘察任务';const task=detailedGeotech(s);assert.doesNotMatch(task.text,/130.68|72.07|65.88|69.0/);
});
test('laboratory results and explicit soil recommendations retain their own values and note conditions',()=>{
 const paras=['四、岩土参数的分析与选定','（一）室内试验成果统计分析和应用','1、土工试验成果的统计分析和应用','土工试验统计结果计算的力学参数表 表4-3','（二）各岩土层的岩土参数的选用','各岩土层主要岩土参数建议值表 表4-5'];
 const trial=[['岩土层及编号','承载力特征值fak(kPa)'],['淤泥质 黏土②','153.5'],['黏土③','210.82']];
 const advice=[['参数地层名称','质量密度g/cm³','压缩模量(MPa)','承载力特征值fak(kPa)'],['淤泥质黏土②','1.91','3.55','70'],['黏土③','1.97','7.46','180'],['备注','表中带*号为经验值。','表中带*号为经验值。','表中带*号为经验值。']];
 const s=source(paras,[trial,advice],paras.flatMap((_,index)=>[{type:'p',index},...(index===3?[{type:'table',index:0}]:index===5?[{type:'table',index:1}]:[])]));
 const d=detailedGeotech(s),table=d.tables.find(t=>t.key==='strength');
 assert.deepEqual(table.rows.slice(1).map(r=>[r[0],r[1],r[4],r[5]]),[['淤泥质黏土②','','','70'],['黏土③','','','180']]);
 assert.match(d.text,/153.5/);assert.match(d.text,/210.82/);assert.equal(d.text.split('表中带*号为经验值。').length-1,1);
 assert.equal(table.rowSources[1].references.filter(r=>r.recommended).length,1);
 const conflict=structuredClone(s);conflict.blocks.tables.push([advice[0],['淤泥质黏土②','1.91','3.55','80']]);conflict.blocks.ordered.push({type:'table',index:2});
 const conflicted=detailedGeotech(conflict);assert.ok(!conflicted.tables.find(t=>t.key==='strength').rows.find(r=>r[0]==='淤泥质黏土②')?.[5]);
 assert.ok(conflicted.tables.find(t=>t.key==='source-2'));assert.ok(conflicted.tables.find(t=>t.key==='source-3'));
 const task=source(['一、勘察任务',...paras.slice(1)],s.blocks.tables,s.blocks.ordered);assert.equal(detailedGeotech(task).tables.find(t=>t.key==='strength'),undefined);
});
test('calculation borehole column retains its identifier alongside building name in exported site table',()=>{
 const s=source(['5 场地地震效应'],[[['建筑物名称','计算钻孔','等效剪切波速值Vse（m/s）','覆盖层厚度(m)','场地类别'],['甲楼','ZK208','303.7','13.00','Ⅱ']]],[{type:'p',index:0},{type:'table',index:0}]);
 const d=detailedGeotech(s),site=d.tables.find(t=>t.key==='site');
 assert.equal(site.rowSources[1].borehole,'ZK208');
 assert.deepEqual(reportTable({document:{geotech:d}},'site').rows[1].values,['ZK208（甲楼）','303.7','13.00','','Ⅱ']);
});
test('transposed borehole schedules under seismic sections keep speed and category without treating calculation depth as cover',()=>{
 const rows=[['孔号','ZK3','ZK23'],['等效剪切波速Vse（m/s）','209.85','222.56'],['计算深度（m）','11.5','8.8'],['场地类别','Ⅱ','Ⅱ']];
 const s=source(['4.3 场地地震效应','等效剪切波速及场地类别划分表 表7'],[rows],[{type:'p',index:0},{type:'p',index:1},{type:'table',index:0}]);const before=JSON.stringify(s),d=detailedGeotech(s),site=d.tables.find(t=>t.key==='site'),raw=d.tables.find(t=>t.key==='source-1');
 assert.deepEqual(site.rows.slice(1).map(r=>[r[1],r[4],r[5],r[7]]),[['ZK3','209.85','','Ⅱ'],['ZK23','222.56','','Ⅱ']]);
 assert.equal(raw.transposed,true);assert.deepEqual(raw.rawRows,rows);assert.equal(site.rowSources[1].locator,'提取表 1 列 2');
 assert.match(d.text,/计算深度（m）：11.5/);assert.equal(JSON.stringify(s),before);
 s.blocks.paras[0]='4.3 勘察任务';assert.equal(detailedGeotech(s).tables.find(t=>t.key==='site'),undefined);
});
test('PDF conclusion continuation retains the condition tail and both paragraph locators',()=>{
 const s=source(['一、结论与建议','1、场地基本稳定，需处理','岩溶后方适宜建设。','2、场地地下水位较高。']);s.name='报告.pdf';s.blocks.pdfReadReport={paragraphsReflowed:true};
 const d=detailedGeotech(s);assert.ok(d.text.includes('场地基本稳定，需处理岩溶后方适宜建设。'));
 assert.ok(d.evidence.some(x=>x.locator==='提取段落 2'));assert.ok(d.evidence.some(x=>x.locator==='提取段落 3'));
 assert.match(d.text,/场地地下水位较高/);
});
test('conclusions retain mixed geological conditions intact and skip verbatim repeated paragraphs',()=>{
 const mixed='场地地势北高南低，场地基本稳定，需处理岩溶后方适宜建设。';
 const s=source(['一、地下水','钻孔内未见地下水。','二、结论与建议','（一）'+mixed,'（二）钻孔内未见地下水。','三、勘察任务','应查明场地稳定性。']);
 const d=detailedGeotech(s);assert.ok(d.text.includes(mixed));assert.equal(d.text.split('钻孔内未见地下水。').length-1,1);assert.doesNotMatch(d.text,/应查明场地稳定性/);
 assert.ok(d.evidence.some(x=>x.locator==='提取段落 4'&&x.quote.includes(mixed)));
});
test('conclusion routing respects task ancestors, unit identity and source boundaries',()=>{
 const task=detailedGeotech(source(['一、勘察任务','（一）结论与建议','应查明地下水埋藏条件。']));assert.doesNotMatch(task.text,/应查明地下水/);
 const s=source(['一、结论与建议','甲楼地基稳定，需处理人工填土。','另一份文件','场地地势北低南高。']);
 s.fragments[1].unit='甲楼';s.blocks.paragraphMeta=[{},{},{sourceBoundary:true},{}];
 const mine=detailedGeotech(s,'甲楼'),other=detailedGeotech(s,'乙楼');
 assert.match(mine.text,/甲楼地基稳定，需处理人工填土/);assert.doesNotMatch(mine.text,/北低南高/);assert.doesNotMatch(other.text,/甲楼地基稳定/);
});
test('geological pile construction risks and fill evaluation survive without importing task requests',()=>{
 const d=detailedGeotech(source(['一、场地填方工程评述','雨季填土可能浸泡软化，建议完善截排水系统。','二、桩基础施工可能遇到的地质问题分析及注意事项','软弱土可能导致缩颈，建议加强验槽。','三、成桩可行性及桩基施工时应采取的工程措施建议','建议根据岩面起伏调整桩长，最终应以试桩结果为准。','四、施工监测','监测仪器配置清单。']));
 assert.match(d.text,/雨季填土可能浸泡软化/);assert.match(d.foundationText,/软弱土可能导致缩颈/);assert.match(d.foundationText,/最终应以试桩结果为准/);assert.doesNotMatch(d.foundationText,/仪器配置/);
 const task=detailedGeotech(source(['一、勘察任务','（一）桩基础施工地质问题','应查明桩基施工风险。','（二）场地填方工程评价','应提供填方处理建议。']));assert.doesNotMatch(task.text+task.foundationText,/应查明桩基|应提供填方/);
 const direct=detailedGeotech(source(['一、桩基施工地质问题勘察要求','应查明下伏溶洞。']));assert.doesNotMatch(direct.text+direct.foundationText,/应查明下伏溶洞/);
});
test('named regional faults retain their conclusions and characteristic periods retain their basis',()=>{
 const s=source(['一、区域构造','（一）甲河断裂（F150）','该断裂属早中更新世断裂。','场地10km范围内无全新世活动断裂通过，可不考虑发震断裂影响。','二、建筑场地类别','（一）特征周期','Ⅱ类场地特征周期为0.45s，Ⅲ类为0.65s。']);
 const d=detailedGeotech(s);assert.match(d.text,/无全新世活动断裂通过/);assert.match(d.text,/Ⅱ类场地特征周期为0.45s，Ⅲ类为0.65s/);
 const task=source(['一、勘察任务','（一）甲河断裂（F150）','查明断裂活动性并提供结论。','（二）特征周期','提供场地周期取值。']);
 assert.doesNotMatch(detailedGeotech(task).text,/查明断裂|提供场地周期/);
});
test('site schedules preserve boreholes and both current and estimated bases through the actual report table',()=>{
 const rows=[['部位','钻孔','现状场地等效剪切波速υse（m/s）','按场地±0.00标高估算等效剪切波速υse（m/s）','场平后覆盖层厚度(m)','按场地±0.00标高划分场地类别'],['甲楼','ZK1','152.06','175.06','4.15','Ⅱ']];
 const s=source(['1 场地地震效应评价','（一）钻孔波速测试','各钻孔等效剪切波速值 表9'],[rows],[{type:'p',index:0},{type:'p',index:1},{type:'p',index:2},{type:'table',index:0}]);
 const before=JSON.stringify(s),d=detailedGeotech(s),t=d.tables.find(t=>t.key==='site');
 assert.equal(t.rows[1][1],'ZK1（甲楼）');
 assert.equal(t.rows[1][4],'现状场地：152.06\n按场地±0.00标高估算：175.06');assert.equal(t.rows[1][7],'按场地±0.00标高：Ⅱ');assert.equal(t.rows[1][5],'场平后：4.15');
 assert.equal(t.rowSources[1].fields.speed.length,2);assert.match(d.text,/现状场地等效剪切波速.*152.06/);
 const rendered=reportTable({document:{geotech:d}},'site');assert.deepEqual(rendered.rows[1].values,['ZK1（甲楼）','现状场地：152.06\n按场地±0.00标高估算：175.06','场平后：4.15','','按场地±0.00标高：Ⅱ']);
 assert.equal(JSON.stringify(s),before);
 s.blocks.paras[0]='1 勘察任务';assert.equal(detailedGeotech(s).tables.find(t=>t.key==='site'),undefined);
});
test('multiple accepted site schedules retain independent hole identifiers and values',()=>{
 const s=source(['1 场地类别'],[
  [['孔号','等效剪切波速(m/s)','场地类别','覆盖层厚度(m)'],['K1','180','Ⅱ','25']],
  [['孔号','等效剪切波速(m/s)','场地类别','覆盖层厚度(m)'],['K2','190','Ⅱ','30']]
 ],[{type:'p',index:0},{type:'table',index:0},{type:'table',index:1}]);
 const t=detailedGeotech(s).tables.find(t=>t.key==='site');assert.equal(t.rows.length,3);
 assert.equal(t.rows[1][1],'K1');assert.equal(t.rows[1][4],'180');assert.equal(t.rows[2][1],'K2');assert.equal(t.rows[2][4],'190');assert.equal(t.rawRows,undefined);
});
test('identical corrosion measurements survive in both water-type tables',()=>{
 const table=[['腐蚀介质','环境类别','界限值','实测值','腐蚀性判别'],['NH₄⁺(mg/L)','II','<500','0.00','微'],['OH⁻(mg/L)','II','<43000','0.00','微']];
 const s=source(['4 水文地质','上层滞水对混凝土结构的腐蚀性评价 表1','承压水对混凝土结构的腐蚀性评价 表2'],[table,structuredClone(table)],[{type:'p',index:0},{type:'p',index:1},{type:'table',index:0},{type:'p',index:2},{type:'table',index:1}]);
 const d=detailedGeotech(s);
 assert.equal(d.text.split('NH₄⁺').length-1,2);assert.equal(d.text.split('OH⁻').length-1,2);
 assert.match(d.text,/上层滞水/);assert.match(d.text,/承压水/);
 assert.ok(d.evidence.some(e=>e.locator==='提取表 1 行 2'));assert.ok(d.evidence.some(e=>e.locator==='提取表 2 行 2'));
});
test('explicit associated-source boundary clears appendix exclusion and preserves original locators',()=>{
 const s=source(['1 水文地质','水位埋深2.0m。','附表','','地基岩、土层设计参数一览表','附表1'],[
  [['层序号','岩土层名称','天然地基承载力建议特征值fa(kPa)'],['②','黏土','160']]
 ],[{type:'p',index:0},{type:'p',index:1},{type:'p',index:2},{type:'p',index:3},{type:'p',index:4},{type:'table',index:0},{type:'p',index:5}]);
 s.blocks.paragraphMeta=[{},{sourceOrigin:{source_id:'main',locator:'提取段落 2'}},{},{sourceBoundary:true},{},{}];
 s.blocks.tableMeta=[{sourceOrigin:{source_id:'appendix',hash:'original-hash',locator:'提取表 1'}}];
 const before=JSON.stringify(s),d=detailedGeotech(s);
 assert.equal(d.tables.find(t=>t.key==='strength').rows[1][5],'160');
 assert.equal(d.tables.find(t=>t.key==='strength').rowSources[1].references[0].sourceOrigin.source_id,'appendix');
 assert.ok(d.evidence.some(e=>e.sourceOrigin?.source_id==='appendix'&&e.sourceOrigin.locator==='提取表 1 行 2'));
 assert.ok(d.evidence.some(e=>e.sourceOrigin?.source_id==='main'));assert.equal(JSON.stringify(s),before);
});
test('standalone design appendix retains recommended bearing and pile values without converting density or pressure intervals',()=>{
 const s=source(['地 基 岩、土 层 设 计 参 数 一览表','附表1','备注：打*的参数值为经验类比值。','制表：某甲 审核：某乙','签字：'],[
  [['层序号','岩土层名称','天然密度ρ(g/cm3)','压缩模量Es1-2(MPa)','天然地基承载力标准值fk(kPa)','天然地基承载力建议特征值fa(kPa)','岩石单轴抗压强度标准值frk(kPa)','侧阻力qsik(kPa)','端阻力qpk(kPa)'],['②','黏土','1.89','6.78','180','160','','40',''],['⑨','泥岩','2.30*','','2500','2000','9000','120','5500']]
 ],[{type:'p',index:0},{type:'table',index:0},...[1,2,3,4].map(index=>({type:'p',index}))]);
 const before=JSON.stringify(s),d=detailedGeotech(s),strength=d.tables.find(t=>t.key==='strength');
 assert.deepEqual(strength.rows.slice(1),[['② 黏土','','','','','160'],['⑨ 泥岩','','','','','2000']]);
 assert.deepEqual(d.tables.find(t=>t.key==='pile').rows.slice(1),[['② 黏土','40',''],['⑨ 泥岩','120','5500']]);
 assert.match(d.text,/经验类比值/);assert.match(d.text,/Es1-2\(MPa\)：6.78/);assert.match(d.text,/frk\(kPa\)：9000/);
 assert.doesNotMatch(d.text,/某甲|某乙|签字/);assert.equal(JSON.stringify(s),before);
});
test('geometry-reflowed PDF paragraphs retain clause citations and following corrosion tables',()=>{
 const s=source(['4 水文地质','4.1 地下水腐蚀性','按第12.2.3和第12.2.4条评价。','水质腐蚀性评价表 表4-1'],[[['环境','腐蚀性指标','评价值'],['地下水','硫酸盐含量','120']]], [{type:'p',index:0},{type:'p',index:1},{type:'p',index:2},{type:'p',index:3},{type:'table',index:0}]);
 s.name='合成报告.pdf';s.blocks.pdfReadReport={paragraphsReflowed:true};
 const d=detailedGeotech(s),sections=numberedGeotechSections(s);assert.match(d.text,/按第12\.2\.3和第12\.2\.4条评价/);
 assert.equal(sections.paragraphBuckets[3],11);assert.equal(sections.sections.length,2);
});
test('engineering properties retain parallel pile methods, length conditions and following notes',()=>{
 const rows=[['地层编号及岩土名称','钻孔灌注桩','预应力管桩'],['地层编号及岩土名称','极限端阻力标准值qpk','极限端阻力标准值qpk'],['地层编号及岩土名称','kPa','kPa'],['⑤层黏土','500（10≤l＜15m）','1500（9≤l＜16m）']];
 const s=source(['5 各土层的工程性质评价','各层性质如下。','表6 桩基工程设计参数建议值表','注：表中为极限值，不自动换算。','6 桩基施工建议','施工说明。'],[rows],[{type:'p',index:0},{type:'p',index:1},{type:'p',index:2},{type:'table',index:0},{type:'p',index:3},{type:'p',index:4},{type:'p',index:5}]);
 const before=JSON.stringify(s),d=detailedGeotech(s);
 assert.deepEqual(d.tables.find(t=>t.key==='source-1').rawRows,rows);
 assert.match(d.text,/钻孔灌注桩\/极限端阻力标准值qpk\/kPa：500（10≤l＜15m）/);
 assert.match(d.text,/预应力管桩\/极限端阻力标准值qpk\/kPa：1500（9≤l＜16m）/);
 assert.match(d.text,/不自动换算/);assert.doesNotMatch(d.text,/施工说明/);
 assert.equal(d.tables.find(t=>t.key==='pile'),undefined);assert.equal(JSON.stringify(s),before);
 s.blocks.paras.unshift('1 勘察任务');s.blocks.paragraphMeta=s.blocks.paras.map((_,i)=>({headingLevel:i===0?0:1}));
 s.blocks.ordered=s.blocks.ordered.map(b=>b.type==='p'?{...b,index:b.index+1}:b);s.blocks.ordered.unshift({type:'p',index:0});
 assert.doesNotMatch(JSON.stringify(detailedGeotech(s)),/1500/);
});
test('automatic Word outline starts the body after a TOC without visible numeric text',()=>{
 const s=source(['目录','软土震陷……8','附图、附表：','土工试验成果表（2张）','场地地震效应评价','软土震陷','②层需考虑软土震陷的影响。']);
 s.blocks.paragraphMeta=[{},{},{},{},{headingLevel:0},{headingLevel:1},{}];
 const d=detailedGeotech(s);assert.match(d.text,/②层需考虑软土震陷/);assert.doesNotMatch(d.text,/2张|成果表/);
});
test('a task-only source cannot revive its numeric soil table through fallback',()=>{
 const s=source(['一、勘察任务','应查明下列地基参数。'],[[['层号','土层名称','承载力特征值(kPa)'],['①','待查土','999']]], [{type:'p',index:0},{type:'p',index:1},{type:'table',index:0}]);
 assert.doesNotMatch(JSON.stringify(detailedGeotech(s)),/999/);
});
test('semantic terrain, strata and climate conditions retain data while TOC/attachments stay excluded',()=>{
 const s=source(['目录','2.1 地貌、地形- 3 -','2.2 地层特征描述3','附图、附表：','物理力学指标统计表（3张）','钻孔柱状图（5张）','1 前言','2 场地工程地质、水文地质条件','2.1 气候条件','年均气温21度。','2.2 地貌、地形','地貌为河谷。','2.3 场地地层结构与岩性','2.3.1 地层特征描述','①填土厚2m。','3 水文地质','地下水为潜水。','Ⅱ 附图表部分','物理力学指标统计表（3张）','钻孔柱状图（5张）']);
 const d=detailedGeotech(s);assert.match(d.text,/河谷/);assert.match(d.text,/填土厚2m/);assert.match(d.text,/年均气温21度/);assert.doesNotMatch(d.text,/柱状图|3张|附图/);
});
test('transposed soil parameters retain layer columns and conditions',()=>{
 const s=source(['4 地基承载力特征值','承载力建议表 表4.1'],[[['层 号','①','②'],['fak(kPa)','65','125'],['注：①层取值须以载荷试验复核。','注：①层取值须以载荷试验复核。','注：①层取值须以载荷试验复核。']]], [{type:'p',index:0},{type:'p',index:1},{type:'table',index:0}]);
 const d=detailedGeotech(s);assert.deepEqual(d.tables.find(t=>t.key==='strength').rows.slice(1).map(r=>[r[0],r.at(-1)]),[['①','65'],['②','125']]);assert.match(d.text,/载荷试验复核/);assert.ok(d.evidence.some(e=>e.locator==='提取表 1 列 2'));
});
test('same-named layers stay distinct, c never becomes compression modulus',()=>{
 const s=source(['物理力学参数'],[[['层号','土层名称','天然重度(kN/m3)','粘聚力C(kPa)','承载力特征值(kPa)'],['①','粉土','18','12','110'],['②','粉土','19','15','150']]], [{type:'p',index:0},{type:'table',index:0}]);
 const d=detailedGeotech(s),t=reportTable({parameters:{},document:{geotech:d}},'soil');
 assert.deepEqual(t.rows.slice(2).map(r=>r.values),[['① 粉土','18','110','','',''],['② 粉土','19','150','','','']]);assert.match(d.text,/粘聚力C\(kPa\)：12/);
});
test('explicit zones cannot supply complementary parameters to each other',()=>{
 const s=source(['物理力学参数'],[[['分区','层号','土层名称','天然重度(kN/m3)'],['东区','①','黏土','18']],[['分区','层号','土层名称','承载力特征值(kPa)'],['西区','①','黏土','130']]], [{type:'p',index:0},{type:'table',index:0},{type:'table',index:1}]);
 const rows=detailedGeotech(s).tables.find(t=>t.key==='strength').rows.slice(1);
 assert.deepEqual(rows.map(r=>[r[0],r[1],r.at(-1)]),[['东区 ① 黏土','18',''],['西区 ① 黏土','','130']]);
});
test('conflicting tests and multiple pile methods stay in source data without arbitrary selection',()=>{
 const s=source(['物理力学参数'],[[['层号','土层名称','压缩模量Es0.1-0.2(MPa)','承载力特征值(kPa)'],['①','黏土','5','100']],[['层号','土层名称','压缩模量Es0.1-0.2(MPa)'],['①','黏土','7']],[['层号','土层名称','预制桩极限侧阻力(kPa)','灌注桩极限侧阻力(kPa)'],['①','黏土','20','25']]], [{type:'p',index:0},{type:'table',index:0},{type:'table',index:1},{type:'table',index:2}]);
 const d=detailedGeotech(s);assert.equal(d.tables.find(t=>t.key==='strength').rows[1][4],'');assert.equal(d.tables.find(t=>t.key==='pile'),undefined);assert.match(d.text,/预制桩极限侧阻力\(kPa\)：20/);assert.match(d.text,/灌注桩极限侧阻力\(kPa\)：25/);
});
test('foundation and anti-float remain separate and keep zone/period conditions',()=>{
 const d=detailedGeotech(source(['4 基础方案','4.1 天然地基','东区建议采用独立基础。','4.2 桩基','西区建议采用灌注桩。','4.3 抗浮设防水位','施工期按3m，永久期东区按5m、西区按6m。','4.4 桩基施工建议','泥浆配置说明。']));
 assert.match(d.foundationText,/东区.*\n西区/s);assert.match(d.antifloatText,/施工期按3m.*永久期东区按5m、西区按6m/);assert.doesNotMatch(d.foundationText,/泥浆|永久期/);
});
test('stratum labels retain their sublayer identifiers and descriptions without leaking into the next chapter',()=>{
 const s=source(['2.6 地基土的构成与分布特征','（1）杂填土（mlQ4）','杂色，层厚0.5～2.0m。','（2）-1粉质黏土（alQ43）','灰黄色，层厚1.0～3.0m。','（2）-2黏质粉土（alQ43）','灰色，稍密。','2.7 场地类别','场地类别为Ⅱ类。']);
 s.blocks.paragraphMeta=[{headingLevel:1},{headingLevel:2},{},{},{},{},{},{headingLevel:1},{}];
 const d=detailedGeotech(s),strata=d.text.split('4.2 场地地层岩性构成\n')[1].split('\n\n4.3')[0];
 assert.match(strata,/（1）杂填土（mlQ4）\n杂色/);assert.match(strata,/（2）-1粉质黏土（alQ43）\n灰黄色/);assert.match(strata,/（2）-2黏质粉土（alQ43）\n灰色/);
 assert.doesNotMatch(strata,/Ⅱ类/);assert.ok(d.evidence.some(e=>e.locator==='提取段落 2'&&e.quote==='（1）杂填土（mlQ4）'));
 for(const f of s.fragments.filter(f=>['提取段落 2','提取段落 3'].includes(f.locator)))f.unit='乙楼';
 assert.doesNotMatch(detailedGeotech(s,'甲楼').text,/杂填土|杂色/);
});
test('strata overview and recommended soil parameters are recognized as sibling sections',()=>{
 const s=source(['二、场地工程地质条件','（四）地层概述','①层 素填土，厚0.9m-5.2m。','②层 淤泥质黏土，层顶标高21.40-25m。','（五）地基土参数建议值','承载力特征值及压缩模量综合成果表 表9'],[[['层号','土层名称','承载力特征值(kPa)'],['①','素填土','80']]], [{type:'p',index:0},{type:'p',index:1},{type:'p',index:2},{type:'p',index:3},{type:'p',index:4},{type:'p',index:5},{type:'table',index:0}]);
 const d=detailedGeotech(s);assert.match(d.text,/4.2 场地地层岩性构成\n①层 素填土/);assert.equal(d.tables.find(t=>t.key==='strength').rows[1].at(-1),'80');
});
test('all-header water schedules recover explicit building rows, units and source evidence without mutating input',()=>{
 const s=source(['7 地下室抗浮','抗浮水位建议表 表7-1'],[[['序号','建筑物名称','±0.00对应绝对标高(m)','地上/地下层数','建议抗浮水位(m)'],['1','1#教学楼','1908.50','8/-1','1907.500'],['2','1#食堂','1909.00','3/0','1908.00']]], [{type:'p',index:0},{type:'p',index:1},{type:'table',index:0}]);
 s.blocks.tableMeta=[{rows:s.blocks.tables[0].map(()=>({header:true}))}];const before=JSON.stringify(s);
 const d=detailedGeotech(s);assert.match(d.antifloatText,/建筑物名称：1#教学楼.*±0.00对应绝对标高\(m\)：1908.50.*建议抗浮水位\(m\)：1907.500/);
 assert.match(d.antifloatText,/建筑物名称：1#食堂.*建议抗浮水位\(m\)：1908.00/);assert.equal(d.tables.find(t=>t.key==='source-1').headerRecovery,true);
 assert.ok(d.evidence.some(e=>e.locator==='提取表 1 行 2'));assert.equal(JSON.stringify(s),before);
 const single=detailedGeotech(s,'1#食堂');assert.doesNotMatch(single.antifloatText,/1#教学楼/);assert.match(single.antifloatText,/1#食堂/);
 s.blocks.tables[0][1][4]='水位待定';assert.equal(detailedGeotech(s).tables.find(t=>t.key==='source-1'),undefined);
});
test('an explicit Word chapter ending in a colon closes the preceding parameter section',()=>{
 const s=source(['三、岩土测试','（四）地基土参数建议值','采用标准值。','四、岩土工程分析与评价：','（一）场地稳定性评价','场地稳定。']);
 s.blocks.paragraphMeta=[{headingLevel:0},{headingLevel:1},{},{headingLevel:0},{headingLevel:1},{}];
 const d=detailedGeotech(s);assert.match(d.text,/采用标准值/);assert.doesNotMatch(d.text,/四、岩土工程分析与评价/);assert.match(d.text,/4.5 岩土工程评价\n场地稳定/);
});
test('combined layer identifiers join explicit recommended bearing and double-hyphen compression columns',()=>{
 const tables=[
  [['土层名称及代号','天然重度(kN/m3)','压缩模量Es0.1--0.2(MPa)'],['①1黏土','18','6.5'],['①2黏土','19','7.5']],
  [['测试手段及指标值岩土代号及名称','室内试验承载力特征值fak(kPa)','标准贯入承载力特征值fak(kPa)','推荐地基承载力特征值fak(kPa)'],['①1黏土','100','150','120'],['①2黏土','160','190','170'],['②石灰岩','900','1100','1000']]
 ];
 const s=source(['4 地基承载力特征值'],tables,[{type:'p',index:0},{type:'table',index:0},{type:'table',index:1}]);
 const before=JSON.stringify(s),d=detailedGeotech(s);
 assert.deepEqual(d.tables.find(t=>t.key==='strength').rows.slice(1).map(r=>[r[0],r[1],r[4],r[5]]),[['①1黏土','18','6.5','120'],['①2黏土','19','7.5','170'],['②石灰岩','','','1000']]);
 assert.match(d.text,/标准贯入承载力特征值fak\(kPa\)：150/);assert.equal(JSON.stringify(s),before);
 assert.equal(d.tables.find(t=>t.key==='strength').rawRows,undefined);
});
test('competing recommendations and conflicting layer names cannot silently populate fixed parameter slots',()=>{
 const s=source(['4 地基承载力特征值'],[
  [['土层名称及代号','天然重度(kN/m3)','压缩模量Es0.1--0.2(MPa)'],['①黏土','18','6.5'],['②石灰岩','22','变形模量E0=130']],
  [['岩土代号及名称','推荐地基承载力特征值fak(kPa)'],['①粉质黏土','120']],
  [['层号','土层名称','推荐甲承载力特征值fak(kPa)','推荐乙承载力特征值fak(kPa)'],['②','石灰岩','1000','1100']]
 ],[{type:'p',index:0},{type:'table',index:0},{type:'table',index:1},{type:'table',index:2}]);
 const d=detailedGeotech(s),rows=d.tables.find(t=>t.key==='strength').rows.slice(1);
 assert.match(rows[0][0],/层名冲突：黏土／粉质黏土/);assert.deepEqual(rows[0].slice(1),['','','','','']);
 assert.deepEqual(rows[1].slice(1),['22','','','','']);assert.match(d.text,/120/);assert.match(d.text,/变形模量E0=130/);
});
test('engineering-index headings retain source pile conditions without relabelling rock MPa as pile kPa',()=>{
 const s=source(['2.5 地表水、地下水','地下水为潜水。','3.2 各地层工程性能评价','土层均匀性一般。','3.3 基础选型分析','（1）天然地基工程特性指标','各地层天然地基特性指标建议值 表3.3.1','（2）桩基工程特性指标','桩基础设计参数建议表 表3.3.2'],[
  [['指标地层','天然重度(kN/m3)','承载力特征值fak(kPa)'],['①黏土','18','120']],
  [['地层编号','土层名称','灌注桩','灌注桩'],['地层编号','土层名称','极限端阻力qpk(kPa) 15≤l<30m','极限侧阻力qsik(kPa)'],['①','黏土','1500','60'],['②','岩石','frk=20.26MPa','150']]
 ],[{type:'p',index:0},{type:'p',index:1},{type:'p',index:2},{type:'p',index:3},{type:'p',index:4},{type:'p',index:5},{type:'p',index:6},{type:'table',index:0},{type:'p',index:7},{type:'p',index:8},{type:'table',index:1}]);
 const d=detailedGeotech(s),strength=d.tables.find(t=>t.key==='strength'),pile=d.tables.find(t=>t.key==='pile');
 assert.match(d.text,/地下水为潜水/);assert.match(d.text,/土层均匀性一般/);assert.match(d.text,/15≤l<30m/);assert.match(d.text,/frk=20.26MPa/);
 assert.equal(strength.rows[1][0],'①黏土');assert.deepEqual(strength.rawRows,s.blocks.tables[0]);assert.equal(strength.rowSources[1].references[0].table,1);
 assert.equal(pile.rows.find(r=>r[0].includes('岩石'))[2],'');
 assert.equal(pile.rows.find(r=>r[0].includes('黏土'))[2],'');
});
test('orthographic 粘/黏 and wrapped soil names join without erasing their source wording',()=>{
 const s=source(['4 地基承载力特征值'],[
  [['土层名称及代号','天然重度(kN/m3)'],['①层粉质粘 土','18']],
  [['岩土代号及名称','推荐承载力特征值fak(kPa)'],['①粉质黏土','120']]
 ],[{type:'p',index:0},{type:'table',index:0},{type:'table',index:1}]);
 const d=detailedGeotech(s),t=d.tables.find(t=>t.key==='strength');
 assert.equal(t.rows.length,2);assert.equal(t.rows[1][5],'120');assert.equal(t.rowSources[1].conflict,false);
 assert.match(d.text,/①层粉质粘 土/);assert.match(d.text,/①粉质黏土/);
});
test('corrosion ranges with soil parentheses remain data and explicit continuation headers retain original row locators',()=>{
 const rows=[['腐蚀介质','水（土）中含量(mg/L)','腐蚀等级'],['腐蚀介质','水（土）中含量(mg/L)','混凝土'],['SO4','79.99～104.64（78.07～117.83）','微'],['Mg','37.85～40.24（32.06～44.02）','微']];
 const s=source(['4 水文地质','水和土的腐蚀性评价表 表4'],[rows,[['Cl','17.64～29.68（16.26～27.14）','微']]],[{type:'p',index:0},{type:'p',index:1},{type:'table',index:0},{type:'table',index:1}]);
 s.blocks.tableMeta=[{}, {continuationOf:0}];
 const before=JSON.stringify(s),d=detailedGeotech(s),t=d.tables.find(t=>t.key==='source-2');
 assert.equal(t.inheritedHeaders,2);assert.equal(t.records[0].index,0);assert.equal(t.records[0].fields[0].label,'腐蚀介质');
 assert.equal(d.tables.find(t=>t.key==='source-1').records.length,2);
 assert.match(d.text,/SO4.*79.99～104.64（78.07～117.83）/);assert.match(d.text,/Cl.*17.64～29.68/);
 assert.ok(d.evidence.some(e=>e.locator==='提取表 2 行 1'));assert.equal(JSON.stringify(s),before);
});
test('corrosion criterion inequalities remain body values rather than polluting measured sample headers',()=>{
 const rows=[['内容','内容','水对混凝土结构的腐蚀性评价','水对混凝土结构的腐蚀性评价'],
  ['内容','内容','SO4(mg/L)','Mg(mg/L)'],
  ['《规范》微腐蚀性规定','《规范》微腐蚀性规定','<300','<2000'],
  ['《规范》弱腐蚀性规定','《规范》弱腐蚀性规定','300-1500','2000-3000'],
  ['水样','ZK1','120.80','32.09'],['水样','腐蚀性评价','微','微']];
 const s=source(['4 水文地质','表4-2 环境水腐蚀性评价表'],[rows],[{type:'p',index:0},{type:'p',index:1},{type:'table',index:0}]);
 const before=JSON.stringify(s),d=detailedGeotech(s),t=d.tables.find(t=>t.key==='source-1');
 assert.equal(t.records[0].index,2);assert.equal(t.records.length,4);
 const measured=t.records.find(r=>r.cells.includes('ZK1'));
 assert.equal(measured.fields[2].value,'120.80');assert.doesNotMatch(measured.fields[2].label,/<300|规定/);
 assert.match(d.text,/SO4\(mg\/L\)：<300/);assert.ok(d.evidence.some(e=>e.locator==='提取表 1 行 3'));
 assert.equal(JSON.stringify(s),before);
});
test('result-only corrosion tables retain each sample and medium without numeric measurements',()=>{
 const rows=[['试样编号','类型','混凝土腐蚀性','混凝土腐蚀性','钢筋腐蚀性'],
  ['试样编号','类型','按环境类型','按地层渗透性','钢筋腐蚀性'],
  ['S-1','地表水','微','微','微'],['ZK45-S','上层滞水','弱','微','弱'],['ZK185-1','素填土①','微','微','微'],['备注：','','','','']];
 const s=source(['3 水文地质','场地水土腐蚀性评价表 表3-1'],[rows],[{type:'p',index:0},{type:'p',index:1},{type:'table',index:0}]);
 const before=JSON.stringify(s),d=detailedGeotech(s),t=d.tables.find(t=>t.key==='source-1');
 assert.ok(t);assert.equal(t.records.filter(r=>r.kind==='table_row').length,3);
 assert.match(d.text,/试样编号：ZK45-S；类型：上层滞水；混凝土腐蚀性\/按环境类型：弱/);
 assert.doesNotMatch(d.text,/备注：/);
 assert.ok(d.evidence.some(e=>e.locator==='提取表 1 行 3'));assert.equal(JSON.stringify(s),before);
 const task=source(['1 勘察任务','场地水土腐蚀性评价表 表1'],[rows],[{type:'p',index:0},{type:'p',index:1},{type:'table',index:0}]);
 assert.equal(detailedGeotech(task).tables.some(t=>t.key==='source-1'),false);
});
test('permeability ranges retain explicit velocity units and all strata without entering soil strength slots',()=>{
 const rows=[['岩土名称','渗透系数','渗透性'],['素填土','10～30m/d','强渗透'],['泥岩','0.001～0.01m/d','相对隔水层'],['注：系数为建议值','','']];
 const s=source(['3 水文地质','场地各岩土层渗透系数一览表 表3-2'],[rows],[{type:'p',index:0},{type:'p',index:1},{type:'table',index:0}]);
 const before=JSON.stringify(s),d=detailedGeotech(s),t=d.tables.find(t=>t.key==='source-1');
 assert.equal(t.records.filter(r=>r.kind==='table_row').length,2);assert.match(d.text,/10～30m\/d/);assert.match(d.text,/相对隔水层/);assert.match(d.text,/系数为建议值/);
 assert.equal(d.tables.some(t=>t.key==='strength'||t.key==='pile'),false);assert.equal(JSON.stringify(s),before);
});
test('horizontal pile estimates retain diameter and bearing stratum with each independent borehole scenario',()=>{
 const rows=[['桩径500mm，持力层⑧层细砂','桩径500mm，持力层⑧层细砂','桩径500mm，持力层⑧层细砂'],['孔号','K1','K26'],['单桩承载力Ra（KN）','1481.4','1465.4'],['有效桩长（m）','35.5','33.2'],['桩长（m）','36.0','35.0']];
 const s=source(['5 基础方案','预应力管桩单桩承载力特征值估算表 表19'],[rows],[{type:'p',index:0},{type:'p',index:1},{type:'table',index:0}]);
 const original=JSON.stringify(s),d=detailedGeotech(s),t=d.tables.find(t=>t.key==='source-1');
 assert.equal(t.estimateOnly,true);assert.equal(t.records.length,2);assert.equal(t.scenario,rows[0][0]);assert.deepEqual(t.rawRows,rows);
 assert.match(d.foundationText,/桩径500mm，持力层⑧层细砂/);assert.match(d.foundationText,/孔号：K1；单桩承载力Ra（KN）：1481.4；有效桩长（m）：35.5；桩长（m）：36.0/);
 assert.ok(d.evidence.some(e=>e.locator==='提取表 1 列 2'));assert.ok(d.evidence.some(e=>e.locator==='提取表 1 行 1'));
 assert.equal(d.tables.some(t=>['strength','pile'].includes(t.key)),false);assert.equal(JSON.stringify(s),original);
 s.blocks.paras[1]='工作量统计表 表19';assert.equal(detailedGeotech(s).tables.some(t=>t.key==='source-1'),false);
});
test('rock laboratory statistics and longitudinal wave integrity remain source results without becoming soil or shear-wave design values',()=>{
 const s=source(['4 岩土物理力学性质','泥岩室内试验成果统计表 表4-2','钻孔声波探测结果统计表 表4-7'],[
  [['岩样名称','统计值','单轴天然抗压强度(MPa)','单轴饱和抗压强度(MPa)'],['泥岩⑤2','平均值','7.63','5.38'],['泥岩⑤2','标准值','6.74','5.05']],
  [['钻孔编号','岩石名称','探测深度(m)','纵波平均波速(m/s)','完整性评价'],['ZK1','强风化泥岩','11.7-15.9','2155','较破碎'],['ZK1','中风化泥岩','15.9-27.1','2541','较完整']]
 ],[{type:'p',index:0},{type:'p',index:1},{type:'table',index:0},{type:'p',index:2},{type:'table',index:1}]);
 const before=JSON.stringify(s),d=detailedGeotech(s);
 assert.equal(d.tables.filter(t=>t.key.startsWith('source-')).length,2);
 assert.match(d.text,/统计值：标准值；单轴天然抗压强度\(MPa\)：6.74/);
 assert.match(d.text,/探测深度\(m\)：11.7-15.9；纵波平均波速\(m\/s\)：2155；完整性评价：较破碎/);
 assert.equal(d.tables.some(t=>['strength','pile','site'].includes(t.key)),false);assert.equal(JSON.stringify(s),before);
 s.blocks.paras[0]='1 勘察任务';assert.equal(detailedGeotech(s).tables.some(t=>t.key.startsWith('source-')),false);
});
test('karst and scoped foundation schedules enter their chapter while unrelated work quantities remain excluded',()=>{
 const s=source(['1 勘察工作量','完成工作量一览表 表1','2 不良地质作用','溶洞统计表 表2','3 基础方案','基础选型建议表 表3'],[
  [['工作项目','数量'],['钻孔','999']],
  [['钻孔编号','溶洞深度范围','岩溶稳定性'],['ZK1','10.0～12.0','不稳定']],
  [['建筑物名称','浅基础型式','深基础持力层'],['甲楼','不宜采用','⑨层泥岩']]
 ],[{type:'p',index:0},{type:'p',index:1},{type:'table',index:0},{type:'p',index:2},{type:'p',index:3},{type:'table',index:1},{type:'p',index:4},{type:'p',index:5},{type:'table',index:2}]);
 const d=detailedGeotech(s);assert.match(d.text,/ZK1.*10.0～12.0.*不稳定/);assert.match(d.foundationText,/甲楼.*不宜采用.*⑨层泥岩/);assert.doesNotMatch(JSON.stringify(d),/999/);
 const other=detailedGeotech(s,'乙楼');assert.doesNotMatch(other.foundationText,/甲楼/);
});
