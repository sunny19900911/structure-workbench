// Evidence-backed Kunming guide. Results are proposals, never adopted parameters.
export const REGIONAL_RULE_VERSION='KM-20261001-1';
export const DECISION_CONDITIONS=[
  ['project_nature','建设性质',['新建','改建','扩建','既有加固']],
  ['investment_type','投资性质',['政府投资','国企投资或主导','社会投资']],
  ['building_kind','建筑属性',['政府投资公益性建筑','公共机构建筑','一般公共建筑','居住建筑','保障性住房','工业建筑']],
  ['urban_scope','城镇范围',['是','否']],
  ['super_highrise','是否为超高层建筑（按建筑高度核定）',['是','否']],
  ['design_date','政策适用日期','date'],
  ['prefab_policy_2023','规划许可适用2023年装配式通知',['是','否']],
  ['regularity','结构规则性',['规则','不规则','超限']],
  ['seismic_scheme','抗震技术路线',['常规抗震','隔震','消能减震','待比选']],
];
export const REGIONAL_SOURCES={
  zone:{source_id:'KM-GB18306-2015',rule:'《中国地震动参数区划图》GB 18306—2015及修改单',locator:'附录C云南表；2026年修改单',url:'https://openstd.samr.gov.cn/bzgk/std/nd?no=2683',verification:'已核发布信息；本项目街道参数未核'},
  national:{source_id:'KM-GWY-744',rule:'《建设工程抗震管理条例》国务院令第744号',locator:'第16、49条',url:'https://www.mee.gov.cn/zcwj/gwywj/202108/t20210805_854111.shtml',verification:'已核官方正文'},
  grade:{source_id:'KM-GB55002-2021',rule:'《建筑与市政工程抗震通用规范》GB 55002—2021',locator:'第2.3.2、5.2.1条及表5.2.1（正文第20—21页）',url:'https://sjw.nanjing.gov.cn/gdzsj/zcfg/gfxwj/202402/P020240228543138060438.pdf',verification:'已核官方PDF表格；普通混凝土体系'},
  province:{source_id:'KM-YN-GOV-202',rule:'《云南省隔震减震建筑工程促进规定》省政府令第202号',locator:'第3、8、9条',url:'https://dnr.yn.gov.cn/html/2016/tongzhigonggao_0826/1150.html',verification:'已核政府发布正文及有效规章目录'},
  review:{source_id:'KM-YN-2020-5',rule:'《云南省建筑工程抗震设防专项审查管理办法》云建规〔2020〕5号',locator:'第3、4、7、8条',url:'https://zfcxjst.yn.gov.cn/zfxxgk/zcwj/xzgfxwj/202201/t20220119_1655735.html',verification:'已核官方正文'},
  green:{source_id:'KM-YN-2026-3',rule:'《云南省绿色建筑管理办法》云建规〔2026〕3号',locator:'第6、27、29条；2026-06-01施行',url:'https://zfcxjst.yn.gov.cn/zhengfuwenjian8655/491999.html',verification:'发布页已检索；正文按省政府网发布的转载交叉核对',crosscheck:'https://policy.yunnan.cn/system/2026/04/15/033967189.shtml'},
  prefab:{source_id:'KM-YN-2021-42',rule:'《关于进一步促进装配式建筑产业健康发展的通知》云建科〔2021〕42号',locator:'第二、五条',url:'https://zfcxjst.yn.gov.cn/gongzuodongtai2/gongshigonggao4/282891.html',verification:'已核官方正文'},
  prefabNew:{source_id:'KM-YN-PREFAB-2023',rule:'《关于加快装配式建筑发展促进新型建筑绿色发展的通知》',locator:'第一、二条及末段施行规定（政府网站2023-09-12发布）',url:'https://www.ynlx.gov.cn/zfxxgk_lxq_zfcxjsj/artview/258/144450.html',verification:'已核政府发布全文；项目规划许可时点须确认'},
  district:{source_id:'KM-NATIONAL-DEVELOPMENT-ZONE',rule:'《云南省推动重点产业园区高质量发展若干政策措施》',locator:'附件国家级开发区名单：昆明经济技术开发区',url:'https://swt.yn.gov.cn/gzdt/zwwj/szfwj/202202/t20220207_1893906.html',verification:'用于识别园区类型，不作为工程参数依据'},
};
const compact=v=>String(v??'').replace(/\s+/g,'');
const number=v=>{const s=compact(v).replace(/,/g,'');if(!/^\d+(?:\.\d+)?(?:m|米|层|㎡|平方米|m²|m2|度|g)?$/i.test(s))return null;return parseFloat(s);};
const canon=v=>compact(v).replace(/[—–－]/g,'-');
export function regionalInputs(context={}){
  const p=context.parameters||{},facts=(context.facts||[]).filter(f=>f.status==='confirmed'&&(!context.unit||!f.unit||f.unit==='项目整体'||f.unit===context.unit));
  const conflicts=[];
  const read=(key,parameterFirst=false)=>{
    const found=facts.filter(f=>f.key===key||f.key==='bldg_'+key);
    const local=found.filter(f=>f.unit===context.unit&&context.unit!=='项目整体');
    const selected=local.length?local:found,values=[...new Set(selected.map(f=>String(f.value)).filter(Boolean))];
    if(values.length>1){conflicts.push(key);return '';}
    return parameterFirst?(p[key]??values[0]??''):(values[0]??p[key]??'');
  };
  const out={location:read('region',true),use:read('use'),structure:read('struct_sys',true),height:number(read('height_m')),floors:number(read('floors_above')),area:number(read('bldg_total')),span:number(read('span_m')),intensity:read('intensity',true),pga:read('pga',true),category:read('seismic_cat',true)||read('seismic_cat_short',true),site:read('site_class',true),conflicts};
  for(const [key] of DECISION_CONDITIONS)out[key]=read(key);
  out.intensityValue=number(out.intensity);out.acceleration=number(out.pga);
  return out;
}
function locationScope(value){
  const s=compact(value);if(!/昆明/.test(s)||/上海|天津|北京|江苏|广东|浙江/.test(s))return null;
  const zone=/(?:经开区|经济技术开发区)/.test(s)&&!/嵩明|杨林|宜良/.test(s);
  const cityArea=zone||/五华|盘龙|官渡|西山|呈贡|晋宁|安宁|嵩明|宜良|高新|滇池.*度假/.test(s);
  return {name:zone?'云南 · 昆明经济技术开发区':'云南 · 昆明',zone,prefabRate:cityArea?20:null};
}
function row(key,level,result,text){return {...REGIONAL_SOURCES[key],level,result,text,statement:'原文事实（条文摘要）'};}
function step(label,value,result){return {label,value:String(value??'')||'待补充',result};}
const topicKeys={intensity:['zone','review'],grade:['grade','national','review'],green:['green'],prefab:['prefabNew','prefab','district'],performance:['national','province','review'],damping:['national','province','review'],isolation:['national','province','review']};
function projectRegulations(context,topic){
  const ids=topicKeys[topic]||[];
  return (context.regulations||[]).filter(r=>r.selected!==false&&ids.some(k=>r.source_id===REGIONAL_SOURCES[k].source_id||canon(r.code)&&canon(REGIONAL_SOURCES[k].rule).includes(canon(r.code))));
}
function finish(context,topic,input,scope,rows,steps,conclusion,missing=[],note='',actions=[]){
  const selected=projectRegulations(context,topic),blocked=selected.filter(r=>r.review!=='confirmed'||r.status!=='current');
  const warnings=[...input.conflicts.map(k=>'确认资料存在冲突：'+k),...blocked.map(r=>'项目规范需复核：'+r.title)];
  for(const r of selected)rows.push({level:'项目规范联动',rule:r.title,source_id:r.source_id,locator:r.locator||'待补条文定位',url:r.source_url||'',verification:r.review==='confirmed'&&r.status==='current'?'项目已确认适用':'待确认／非现行',result:r.review==='confirmed'&&r.status==='current'?'作为复核依据':'暂停按规则确认',text:r.note||'项目条文变化须人工复核；不从任意文本静默生成新规则。'});
  const ready=!missing.length&&!warnings.length;
  return {topic,input,region:scope.name,rows,steps,conclusion,missing,warnings,actions,ready,note,
    draft:{conclusion,scope:[scope.name,context.unit||'项目整体',input.project_nature,input.use,input.structure,input.height!==null?'结构高度'+input.height+'m':''].filter(Boolean).join(' · '),source_title:'本页国家、云南与昆明适用依据',source_id:REGIONAL_RULE_VERSION+'-'+topic,rule_version:REGIONAL_RULE_VERSION,locator:rows.map(r=>r.rule+'：'+r.locator).join('；'),evidence:rows.map(r=>r.level+'｜'+r.rule+'｜'+r.locator+'｜'+r.text+'｜本项目：'+r.result+'｜'+r.url).join('\n')+'\n判断过程：\n'+steps.map(s=>s.label+'：'+s.value+' → '+s.result).join('\n')+'\n待核：'+[...missing,...warnings,...actions].join('；')}};
}
// Visually checked against GB 55002 table 5.2.1, concrete systems only.
const TABLE={
  frame:{6:[[24,4],[60,3]],7:[[24,3],[50,2]],8:[[24,2],[40,1]],9:[[24,1]]},
  frameWall:{6:[[60,4,3],[130,3,3]],7:[[24,4,3],[60,3,2],[120,2,2]],8:[[24,3,2],[60,2,1],[100,1,1]],9:[[24,2,1],[50,1,1]]},
  wall:{6:[[80,null,4],[140,null,3]],7:[[24,null,4],[80,null,3],[120,null,2]],8:[[24,null,3],[80,null,2],[100,null,1]],9:[[24,null,2],[60,null,1]]},
};
const names=['','一级','二级','三级','四级'];
export function concreteGrade(input){
  const s=compact(input.structure),category=compact(input.category),base=input.intensityValue;
  const type=/钢结构|型钢|钢管|部分框支|核心筒|板柱|砌体/.test(s)?null:/框架.*(?:剪力墙|抗震墙)|框剪/.test(s)?'frameWall':/框架/.test(s)?'frame':/剪力墙|抗震墙/.test(s)?'wall':null;
  const priority=/^(重点设防类(?:[（(]乙类[）)])?|重点设防|乙类|乙)$/.test(category),standard=/^(标准设防类(?:[（(]丙类[）)])?|标准设防|丙类|丙)$/.test(category);
  const missing=[];
  if(!type)missing.push('可查表的混凝土结构体系');if(!priority&&!standard)missing.push('乙类或丙类设防类别（其他类别专项复核）');
  if(![6,7,8,9].includes(base))missing.push('6—9度设防烈度');if(!(input.height>0))missing.push('结构高度');
  if(!({6:[.05],7:[.1,.15],8:[.2,.3],9:[.4]}[base]?.includes(input.acceleration)))missing.push('地震加速度与烈度对应关系');
  const effective=base+(priority?1:0),bands=TABLE[type]?.[effective];
  const band=bands?.find(([max])=>input.height<=max);
  if(!missing.length&&!band)missing.push('超出本次普通查表范围，须专项复核');
  let result='待补充条件后查表';
  if(band&&input.height>0){let f=band[1],w=band[2];if(type==='frame'&&input.span>=18)f=Math.min(f,{6:3,7:2,8:1,9:1}[effective]);result=[f&&'框架'+names[f],w&&'抗震墙'+names[w]].filter(Boolean).join('，');}
  if(input.seismic_scheme!=='常规抗震')missing.push('常规抗震路线确认；隔震／消能减震须另核等级');
  if(input.regularity!=='规则')missing.push('结构规则性或超限情况确认');
  if(!input.site)missing.push('场地类别');
  if(type==='frame'&&input.span===null)missing.push('框架跨度');
  if(bands?.slice(0,-1).some(([max])=>Math.abs(input.height-max)<=1))missing.push('高度接近分界，结合场地与不规则性复核');
  return {result,effective,missing,priority,type};
}
export function regionalDecisionGuide(context={},topic){
  const input=regionalInputs(context),scope=locationScope(input.location);if(!scope||!topicKeys[topic])return null;
  const {intensityValue:i,acceleration:a}=input,newBuild=input.project_nature==='新建';
  const dateOK=/^\d{4}-\d{2}-\d{2}$/.test(input.design_date)&&Number.isFinite(Date.parse(input.design_date));
  const nationalUse=/学校|教学楼|校舍|幼儿园|医院|医疗|养老机构|儿童福利|应急指挥|应急避难|广播电视/.test(input.use)&&!/(?:非|不是|不属于|不含|无)(?:学校|医院|校舍)|历史|拟建/.test(input.use);
  const schoolMedical=/学校|教学楼|校舍|幼儿园|医院|医疗/.test(input.use)&&nationalUse;
  const priority=/重点|乙类|特殊|甲类/.test(input.category);
  const checkReview=priority&&input.area>=1000?'触发专项审查条件':'复核设防类别、面积及其他触发条件';
  if(topic==='intensity'){
    const validI=[6,7,8,9].includes(i),validA={6:[.05],7:[.1,.15],8:[.2,.3],9:[.4]}[i]?.includes(a),missing=[];
    if(!validI)missing.push('①设防烈度');if(!validA)missing.push('①加速度及其与烈度的一致性');
    const conclusion=validI&&validA?`沿用①：${i}度，${a.toFixed(2)}g（地点依据待核对）`:'已匹配昆明规则；设防参数待补充／核对';
    return finish(context,topic,input,scope,[row('zone','国家区划依据','按具体街道／场地核对','园区名称用于行政规则匹配；地震动参数须定位到场地并核对适用区划与审定安评成果。'),row('review','云南专项审查',checkReview,'已有安评、地震动复核或小区划的高层项目，以及规定类别项目，须核对专项审查条件。')],[step('识别地点',input.location,scope.name),step('统一措施取值',validI?i+'度 / '+input.pga:'未填写',validA?'数值对应关系一致':'待核对'),step('地点证据','街道、场地与安评成果','不自动把经开区映射成任一行政区参数')],conclusion,missing,'这里核对已有参数，不根据“经开区”三个字自动填入烈度、分组或特征周期。',['补充场地地址及地勘／安评依据；与③规范清单核对']);
  }
  if(topic==='grade'){
    const g=concreteGrade(input),conflict=nationalUse&&/丙|标准/.test(input.category);
    if(conflict)g.missing.push('用途与设防类别冲突：本用途应按不低于重点设防类核对');
    return finish(context,topic,input,scope,[row('national','国家设防分类',conflict?'用途与类别冲突':input.category||'待确认类别','规定的学校、幼儿园、医院等建筑，抗震设防措施不低于重点设防类；分类应先于等级查表。'),row('grade','国家等级查表',g.result,'按设防类别、烈度、普通混凝土结构类型和房屋高度查表；重点设防类加强抗震措施，地震作用不随之直接提高。'),row('review','云南审查要求',checkReview,'专项审查复核设防标准、体系、性能目标及计算结果，不能用查表建议代替审查。')],[step('类别与烈度',input.category+' / '+input.intensity,g.priority?'抗震措施按提高一度核对':'按本地区烈度核对'),step('查表路径',input.structure+' / '+(input.height??'待补')+'m',g.effective<=9?'按'+g.effective+'度栏：'+g.result:'超出9度普通查表范围'),step('例外检查',[input.site,input.regularity,input.seismic_scheme].filter(Boolean).join(' / '),g.missing.length?'尚有专项条件待核':'普通查表条件齐全')],g.result+(g.missing.length?'（候选，待核）':'（常规抗震查表建议）'),g.missing,'不把常规抗震查表值直接用于隔震上部结构；地震作用、内力调整和构造措施分别复核。',['核对现行配套标准的场地调整、大跨度、地下室与隔震专门要求']);
  }
  if(topic==='green'){
    const missing=[];if(!dateOK)missing.push('政策适用日期');else if(input.design_date<'2026-06-01')missing.push('适用日期早于本规则生效，核对当期政策');
    if(!input.project_nature)missing.push('建设性质');if(input.urban_scope!=='是')missing.push('城镇范围适用性');if(!input.building_kind)missing.push('建筑属性');
    let conclusion='省级基本要求：绿色建筑基本级；星级需按项目条件判断';
    if(newBuild&&['政府投资公益性建筑','公共机构建筑'].includes(input.building_kind))conclusion='省级下限：绿色建筑一星级及以上';
    if(newBuild&&input.building_kind==='一般公共建筑'){if(input.area===null)missing.push('单体建筑面积');else if(input.area>=20000)conclusion='省级下限：大型公共建筑一星级及以上';}
    if(newBuild&&input.super_highrise==='是')conclusion='省级下限：新建超高层建筑三星级';
    if(newBuild&&!['是','否'].includes(input.super_highrise))missing.push('是否属于超高层建筑（按建筑高度确认，不以结构高度替代）');
    if(input.project_nature==='既有加固')missing.push('既有加固项目的绿色建筑适用范围');
    if(['保障性住房','工业建筑'].includes(input.building_kind))missing.push('专项建筑类型政策');
    return finish(context,topic,input,scope,[row('green','云南星级下限',conclusion,'城镇新改扩建落实基本级；新建公共机构、政府投资公益性及大型公共建筑落实一星及以上；新建超高层另核三星要求。'),{level:'昆明／地块条件',rule:'项目规划条件、土地出让条件及设计任务书',result:'核对是否有更高要求',text:'本次未核实到可直接适用于所有经开区项目的统一更高星级；不得据此认定没有更高要求。',source_id:'KM-PROJECT-GREEN-PENDING',locator:'本项目规划、合同条款待提供',verification:'待核实'}],[step('政策时点',input.design_date,'2026-06-01起的省级办法'),step('建筑属性',[input.project_nature,input.building_kind,input.area!==null?input.area+'㎡':''].join(' / '),conclusion),step('地方与任务书','昆明经开区具体地块','如有更高要求，保留并人工核定')],conclusion,missing,'这里只判断省级设计下限；星级评价得分、地方更高要求和最终标识认定另行核查。',['核对③中昆明文件及本项目规划、合同约定']);
  }
  if(topic==='prefab'){
    const missing=[];if(!input.investment_type)missing.push('投资性质');if(input.prefab_policy_2023!=='是')missing.push('规划许可是否适用2023年通知');
    const publicInvestment=['政府投资','国企投资或主导'].includes(input.investment_type),concrete=/混凝土|框架|框剪|剪力墙/.test(input.structure)&&!/钢结构|钢管|型钢|木结构/.test(input.structure);
    const adoption=publicInvestment?'应采用装配式建筑或装配式建造方式':input.investment_type==='社会投资'?'省级政策鼓励采用；合同要求另核':'待确认是否必须采用';
    const rate=scope.prefabRate,rateText=concrete&&rate?`采用装配式建造方式时，混凝土单体装配率≥${rate}%`:'结构材料或具体区域未明确，暂不套用比例';
    if(!input.structure)missing.push('结构材料与体系');if(concrete&&!rate)missing.push('昆明具体区县／园区');
    return finish(context,topic,input,scope,[row('prefabNew','云南实施范围',adoption,'2023年通知覆盖政府和国企投资、主导建设项目；无法实施须经主管部门核实，不能自行视为豁免。'),row('prefab','地区比例',rateText,'2021年通知列出的昆明区县及三个国家级开发（度假）区，适用装配式混凝土建造比例20%；该比例不等同于装配式建筑评价认定。'),row('district','昆明经开区定位',scope.zone?'按国家级经开区匹配':'按已识别区县核对','该来源只确认园区类型；项目坐落和设计合同须同时对应。'),row('prefabNew','成果要求','设计专篇＋装配率计算＋审查登记','在设计、施工与验收环节落实装配式要求；装配式建筑认定另按国家或云南评价标准核查。')],[step('投资与许可',[input.investment_type,input.prefab_policy_2023].join(' / '),adoption),step('地区与材料',scope.name+' / '+input.structure,rateText),step('两种口径','建造方式比例 ≠ 装配式建筑评价','不以20%宣称已达到装配式建筑认定')],adoption+'；'+rateText,missing,'材料、投资或地点改变后重新判断；钢结构不套混凝土20%规则。',['对照项目合同和现行评价标准编制装配率计算书']);
  }
  const national=newBuild&&nationalUse&&i>=8;
  const provincial=newBuild&&((schoolMedical&&i>=7&&input.floors>=3&&input.area>=1000)||(priority&&i>=8&&input.area>=1000));
  const missing=[];if(!input.project_nature)missing.push('建设性质');if(!input.use)missing.push('建筑用途');if(![6,7,8,9].includes(i))missing.push('设防烈度');
  if(!national&&!provincial){if(input.floors===null)missing.push('地上层数');if(input.area===null)missing.push('单体建筑面积');missing.push('其他法定触发条件需主管部门／项目依据核对');}
  let conclusion=national?'国家条款触发：采用隔震减震等技术，设防地震时正常使用':provincial?'云南条款触发：应采用隔震减震技术；性能目标另行落实':'现有信息未形成完整强制性判断';
  const rows=[row('national','国家目标',national?'已触发（不附加层数、面积门槛）':'按已知用途与烈度核对；其他条件待核','高烈度地区的新建规定用途建筑落实正常使用目标；国家第16条还含其他适用地区条件，不能用省级面积门槛排除国家要求。'),row('province','云南采用条件',provincial?'已触发云南条件':'本项条件尚未齐全或未匹配','按新建、用途、烈度、层数与单体面积分别核对第3条各项；“以上”按包含边界值处理。'),row('review','专项审查',national||provincial?'选用隔震／减震须专项审查':checkReview,'采用隔震、减震技术以及规定类别项目，在初步设计阶段提交专项资料，结果供施工图设计与审查使用。')];
  const actions=topic==='isolation'?['比选隔震层位置、位移空间、管线柔性连接和支座检修条件','以当前模型核对隔震位移、支座及上下部结构性能，不生成虚构通过结论']:topic==='damping'?['比选阻尼器布置、连接节点、速度相关性和检修更换条件','以当前模型复核层间位移、阻尼器需求及非结构构件功能']:['落实结构、非结构构件和设备功能目标','比较常规、隔震及消能减震方案，明确选定路线和专项分析内容'];
  if(topic==='isolation'||topic==='damping')conclusion=(national||provincial?'可进入':'待条件明确后进入')+(topic==='isolation'?'隔震':'消能减震')+'方案比选；不能仅按地点自动选定';
  return finish(context,topic,input,scope,rows,[step('国家独立判断',[input.project_nature,input.use,i!==null?i+'度':''].join(' / '),national?'触发；不受省级层数和面积门槛限制':'未完整匹配，继续核对'),step('云南独立判断',[input.floors!==null?input.floors+'层':'层数缺失',input.area!==null?input.area+'㎡':'面积缺失',input.category].join(' / '),provincial?'触发':'未完整匹配'),step('成果与方案',input.seismic_scheme||'待比选','条件判断 → 方案比选 → 当前模型验证 → 负责人确认')],conclusion,missing,'没有触发当前已编码条件，不等于无需采用。具体性能等级和构件验算以当前模型及专项审查为准。',actions);
}
