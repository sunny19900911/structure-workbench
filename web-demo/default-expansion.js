import {referenceText} from './reference-report.js';
import {TEMPLATE_SOURCE,TEMPLATE_TEXT} from './approved-template.js';
// This is the user's reusable document baseline, not a historical project's results.
export function defaultExpansion(s,id){
 const evidence=new Set([TEMPLATE_SOURCE]);
 if(s.referenceTemplate)return {text:referenceText(s,id),evidence_ids:[TEMPLATE_SOURCE,...(s.document?.sourceIds||[])],kind:'template',sectionId:id,templateVersion:2,manual:false,warnings:[]};
 const p=(key,label)=>s.parameters[key]?`{{p:${key}}}`:s.document?.parameters?.[key]|| (facts.some(f=>f.key===key)?fact(facts.find(f=>f.key===key)):`【${label}待补充】`);
 const fact=f=>{evidence.add(f.source_id);return `{{f:${f.id}}}`;};
 const facts=s.facts.filter(f=>f.status!=='rejected');
 const key=(name,label)=>{const f=facts.find(f=>f.key===name||f.key==='bldg_'+name);return f?fact(f):`【${label}待补充】`;};
 const geo=pattern=>facts.filter(f=>pattern.test(f.key)).map(f=>f.label+'：'+fact(f)+'。').join('\n\n');
 let text='';
 if(id==='overview'){
  text=`1.1 工程建设地点\n本工程为${p('project_name','项目名称')}，建设地点为${p('region','工程地点')}。\n\n1.2 建筑设计概况\n`;
  const units=[...new Set(facts.filter(f=>/^bldg_|^arch/.test(f.key)).map(f=>f.unit))];
  text+=units.length?units.map(unit=>{const fs=facts.filter(f=>f.unit===unit&&/^(bldg_|arch)/.test(f.key));return (unit==='项目整体'?'':unit+'：')+fs.map(f=>f.label+'为'+fact(f)).join('，')+'。';}).join('\n\n'):'本工程的建筑用途、单体组成、层数、高度及建筑面积根据建筑专业提资填写；导入资料后在此自动汇总。';
  text+=`\n\n1.3 结构体系概况\n主体结构体系为${p('struct_sys','结构体系')}。结构布置结合建筑使用功能、柱网、层高及设备条件确定，具体设计见结构方案章节。`;
 }
 if(id==='basis')text='2.1 国家设计标准与规范\n本工程采用的国家设计标准与规范见设计依据清单。\n\n2.2 地方设计标准与规范\n地方设计标准与规范按项目所在地及适用范围选用，采用版本见设计依据清单。\n\n2.3 工程资料\n建筑专业提资、岩土工程勘察报告及本次结构模型输出作为本说明的工程资料依据；具体文件及版本见来源记录。';
 if(id==='criteria')text=`3.1 建筑结构分类等级\n抗震设防类别：${p('seismic_cat','设防类别')}；结构安全等级：${p('safety_grade','安全等级')}；结构重要性系数：${p('gamma0','重要性系数')}；地基基础设计等级：${p('found_grade','基础等级')}。\n\n3.2 结构耐久性\n混凝土结构耐久性根据环境类别、设计工作年限、材料强度、保护层厚度及裂缝控制要求确定，按统一技术措施执行。\n\n3.3 抗震设计控制标准\n抗震设防烈度为${p('intensity','烈度')}度，设计基本地震加速度为${p('pga','加速度')}，设计地震分组为${p('eq_group','地震分组')}，场地类别为${p('site_class','场地类别')}，设计特征周期为${p('tg','特征周期')}s。`;
 if(id==='loads')text=`4.1 楼（屋）面荷载\n{{t:permanent}}\n楼（屋）面附加恒载按建筑做法逐层计算，楼面、屋面及设备房活荷载默认按统一技术措施表采用，并结合实际使用功能调整。\n\n4.2 风荷载\n基本风压为${p('wind','基本风压')}kN/m²，地面粗糙度为${p('wind_rough','粗糙度')}，体型系数为${p('wind_shape','体型系数')}。\n\n4.3 雪荷载\n基本雪压为${p('snow','基本雪压')}kN/m²。\n\n4.4 温度作用\n基本气温最高值为${p('temp_high','最高气温')}℃，最低值为${p('temp_low','最低气温')}℃，施工闭合温度结合施工组织确定。\n\n4.5 地下水位与水浮力\n抗浮设计水位采用${p('water_depth','抗浮水位')}。\n\n4.6 填充墙荷载\n蒸压加气混凝土砌块平均干密度采用${p('wall_drydensity','干密度')}kg/m³，吸水放大系数采用${p('wall_abs','吸水系数')}；不同厚度墙体荷载按统一技术措施计算。`;
 if(id==='ground')text='5.1 场地地形地貌与工程地质\n'+(geo(/geo.*(?:landform|strata|soil|fault|liquefaction)/)||'【导入地勘后汇总地形地貌、地层分布及不良地质条件】')+'\n\n5.2 水文地质条件\n'+(geo(/geo.*(?:water|corrosion)/)||'【地下水类型、埋深及腐蚀性待地勘资料补充】');
 if(id==='foundation')text='5.3 地基基础设计方案\n'+(geo(/geo.*foundation/)||'基础型式结合上部结构荷载、地层分布、持力层及地下水条件选定。地勘建议导入后在本节汇总，基础采用方案及承载力由设计人员结合计算结果确定。')+'\n\n5.4 地基变形与抗浮\n地基变形、差异沉降及地下结构抗浮按本工程适用工况验算；尚未提供的计算结果保留待补。';
 if(id==='selection')text=`6.1 结构布置\n结构布置结合建筑平面及功能分区，协调竖向构件、楼盖、楼梯与机电设备条件。结构缝及分缝方案按各单体的具体布置确定。\n\n6.2 结构选型\n本单体采用${p('struct_sys','主体结构体系')}。${facts.some(f=>/bldg_use/.test(f.key))?'建筑使用功能为'+key('use','用途')+'。':''}梁、柱、墙及楼板的布置与截面尺寸在满足建筑功能的基础上，结合承载力、刚度、抗震构造及经济性确定。\n\n6.3 楼（屋）盖结构\n楼（屋）盖型式及开洞、降板、大跨部位的处理根据建筑提资和模型复核确定。\n\n6.4 单体设计\n${facts.filter(f=>/^bldg_(?:height|span|floors)/.test(f.key)).map(f=>f.label+'：'+fact(f)+'。').join('\n')||'【各单体层数、高度、跨度导入后自动汇总】'}`;
 if(id==='materials')text='7.1 混凝土\n混凝土强度等级、抗渗等级按统一技术措施中构件材料表采用，并结合各单体计算及耐久性要求调整。\n\n7.2 钢筋\n{{t:reinforcement}}\n\n7.3 钢材\n{{t:steel}}\n\n7.4 非承重砌体\n{{t:masonry}}';
 if(id==='model')text=`8.1 计算软件\n采用${p('software','计算软件及版本')}进行结构分析。\n\n8.2 计算模型与分析原则\n根据实际结构体系建立空间计算模型，荷载、质量、约束、刚度及抗震参数与统一技术措施核对。\n\n8.3 主要计算结果\n${s.model?.confirmed?'本次确认模型的主要计算指标见下表，结果与适用判据分别列示。':'【导入并确认当前单体的模型总信息后，自动填写周期、质量、位移角等结果】'}\n\n8.4 计算结果复核\n模型主要指标结合相应工况、适用规范和计算简图逐项复核。`;
 if(id==='special')text='9.1 结构规则性判断\n规则性根据当前建筑布置及结构模型结果判断，不以关键词直接下结论。\n\n9.2 关键技术问题及措施\n'+(facts.filter(f=>f.origin==='decisions').map(f=>fact(f)).join('\n\n')||'本工程确认的专项判断及加强措施在资料、模型和重难点模块核对后补充。');
 if(id==='review')text='本说明采用项目统一技术措施及当前资料编制。工程资料调整后，相关参数、计算结果及文字说明同步复核；未完成事项见校核清单。';
 evidence.add('MEASURES-CONFIRMED');
 const document=s.document;
 if(document?.sourceIds?.length){
  document.sourceIds.forEach(id=>evidence.add(id));
  if(id==='overview'&&document.overview)text=document.overview;
  if(id==='ground'&&document.ground)text=document.ground;
  if(id==='foundation'&&document.foundation)text=document.foundation;
  if(id==='loads'&&document.waterText)text=text.replace(/4\.5 地下水位与水浮力\n[^\n]*/, '4.5 地下水位与水浮力\n地下结构水浮力按第5章所列抗浮水位及相应工况计算。');
  if(id==='selection')text=text.replace(/\n\n6\.4 单体设计[\s\S]*$/,'');
  text=text.replace(/【[^】]*(?:待补|待核|导入)[^】]*】/g,'—');
 }
 return {text,evidence_ids:[...evidence],kind:'template',sectionId:id,templateVersion:1,manual:false,warnings:[]};
}
