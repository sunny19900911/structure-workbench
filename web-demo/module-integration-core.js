import {fingerprint} from './expansion-core.js';
import {FIELD_LABELS,PROJECT} from './intake-core.js';

// Topic taxonomy from the existing key-decisions prototype; its project-specific
// conclusions are deliberately not rules for a new project.
export const DECISION_TOPICS=[
  ['intensity','抗震判断','设防烈度'],['grade','抗震判断','抗震等级'],
  ['green','绿色与装配式','绿色建筑'],['prefab','绿色与装配式','装配式建筑'],
  ['performance','性能化目标','性能目标'],['damping','性能化目标','消能减震'],['isolation','性能化目标','隔震'],
  ['other','项目重难点','其他重难点'],
];
export const DECISION_GROUPS=[
  ['seismic','抗震判断','烈度＋等级',['intensity','grade']],
  ['green','绿色与装配式','绿建＋装配率',['green','prefab']],
  ['performance','性能化目标','性能＋减震＋隔震',['performance','damping','isolation']],
];

const compactDecision=s=>String(s??'').replace(/\s+/g,'');
const numeric=v=>{const n=Number(String(v??'').replace(/,/g,'').match(/[\d.]+/)?.[0]);return Number.isFinite(n)?n:null;};
function decisionInputs(context={}){
  const p=context.parameters||{},facts=context.facts||[];
  const factValue=key=>facts.find(f=>f.key===key||f.key==='bldg_'+key)?.value||'';
  const evidence=facts.map(f=>[f.value,f.quote,f.label].filter(Boolean).join(' ')).join(' ');
  return {
    location:p.region||factValue('region'),
    use:p.use||factValue('use'),
    structure:p.struct_sys||factValue('struct_sys'),
    height:numeric(p.height_m||factValue('height_m')||p.height_arch_m||factValue('height_arch_m')),
    floors:numeric(p.floors_above||factValue('floors_above')),
    area:numeric(p.bldg_total||factValue('bldg_total')),
    intensity:String(p.intensity||''),pga:String(p.pga||''),
    category:String(p.seismic_cat||p.seismic_cat_short||''),
    projectText:[p.project_name,p.project_nature,p.investment_type,evidence].filter(Boolean).join(' '),
  };
}
const guideRow=(level,rule,result,text,source_id,locator)=>({level,rule,result,text,source_id,locator});
function guideDraft(topic,input,rows,conclusion,note,ready){
  const scope=[input.location,input.use,input.structure,input.height!==null?'高度'+input.height+'m':''].filter(Boolean).join(' · ')||'当前项目／单体';
  return {topic,input,rows,conclusion,note,ready,draft:{conclusion,scope,source_title:'本页所列国家、云南及保山规范',source_id:'KD-RULESET-YN-BAOSHAN-20261001',locator:rows.map(r=>r.locator).join('；'),evidence:rows.map(r=>`${r.level}｜${r.rule}｜${r.text}｜判断：${r.result}`).join('\n')}};
}

// This is a narrowly scoped, reviewed Baoshan guide. It proposes a draft only;
// it never writes project parameters or creates a confirmed decision.
export function decisionGuide(context,topic){
  const input=decisionInputs(context),location=compactDecision(input.location),all=compactDecision([input.use,input.projectText].join(' '));
  if(!/云南/.test(location)||!/保山/.test(location))return null;
  const longyang=/隆阳|兰城/.test(location),school=/学校|校舍|教学楼|幼儿园/.test(all),government=/政府投资|公共机构|公益性/.test(all),priority=/重点|乙类/.test(compactDecision(input.category)),frameWall=/框架.{0,4}(剪力墙|抗震墙)|框剪/.test(compactDecision(input.structure));
  const intensity8=/8/.test(input.intensity),height48=input.height!==null&&input.height>=25&&input.height<=50,largeEnough=input.area!==null&&input.area>1000,threeStoreys=input.floors!==null&&input.floors>=3;
  if(topic==='intensity'){
    const ready=longyang,conclusion=ready?'8度（0.20g）':'待明确到隆阳区具体街道／乡镇';
    return guideDraft(topic,input,[
      guideRow('国家标准','《中国地震动参数区划图》GB 18306—2015（含2026年第1号修改单）第6.1.1条及附录C表C.25',ready?'8度（0.20g）':'待定位乡镇','基本地震动峰值加速度按图A.1或表C.1～C.32取值；表C.25中隆阳区兰城街道为0.20g、特征周期0.45s。','SRC-GB18306-2015-XG1-2026-C25-LONGYANG','第6.1.1条、附录C表C.25'),
      guideRow('云南地方核对','《云南省建筑工程抗震设防专项审查管理办法》云建规〔2020〕5号第4条第（五）项','有安评成果时专项复核','经地震安全性评价、地震动参数复核或地震小区划的高层建筑工程，应进行抗震设防专项审查。','SRC-YN-YJG-2020-5-A4','第4条第（五）项'),
      guideRow('保山具体落实','《保山市住房和城乡建设局关于进一步规范建筑工程抗震设防专项审查工作的通知》保建发〔2017〕31号第一条','行政区基准仍按国标','做过设计地震动参数复核的高层建筑工程及规定范围学校项目，应按权限进行专项审查。','SRC-BS-BJF-2017-31-A1','第一条'),
    ],conclusion,'2026年第1号修改单未调整云南表C.25；有经审定的地震安全性评价成果时按审定成果执行。',ready);
  }
  if(topic==='grade'){
    const ready=longyang&&school&&priority&&frameWall&&height48&&intensity8,missing=[];
    if(!school)missing.push('建筑用途');if(!priority)missing.push('重点设防类');if(!frameWall)missing.push('结构体系');if(!height48)missing.push('25～50m结构高度');if(!intensity8)missing.push('已确认8度设防烈度');
    const conclusion=ready?'框架一级，剪力墙一级':'待补充：'+missing.join('、');
    return guideDraft(topic,input,[
      guideRow('国家分类要求','《建筑工程抗震设防分类标准》GB 50223—2008第3.0.3条第2款',priority?'抗震措施提高一度':'待确认设防类别','重点设防类按高于本地区抗震设防烈度一度加强抗震措施；地震作用仍按本地区烈度采用。','SRC-GB50223-2008-A3.0.3','第3.0.3条第2款'),
      guideRow('国家标准查表','《建筑抗震设计标准》GB/T 50011—2010（2016年版·2024年局部修订）第6.1.2条及表6.1.2',ready?'框架一级；剪力墙一级':'输入齐全后查表','本例若为重点设防类、8度、框架—抗震墙结构且高度25～50m，则提高一度按9度查表，框架和抗震墙均为一级。','SRC-GBT50011-2024-A6.1.2','第6.1.2条、表6.1.2'),
      guideRow('云南地方核对','《云南省建筑工程抗震设防专项审查管理办法》云建规〔2020〕5号第8条第（一）、（二）项','复核国家查表结果','专项审查复核抗震设防依据、标准、性能目标和结构布置；云南文件未另设抗震等级查表值。','SRC-YN-YJG-2020-5-A8','第8条第（一）、（二）项'),
    ],conclusion,'只有设防类别、烈度、结构体系和高度均已确认时，系统才给出查表建议。',ready);
  }
  if(topic==='green'){
    const ready=government&&school,conclusion=ready?'绿色建筑一星级及以上':'待确认是否属于政府投资公益性建筑／公共机构建筑';
    return guideDraft(topic,input,[
      guideRow('国家评价标准','《绿色建筑评价标准》GB/T 50378—2019（2024年版）第3.2.8条','一星级总得分≥60分','各星级均应满足控制项、各类评分项不低于其满分值30%并进行全装修；一星级总得分不低于60分。','SRC-GBT50378-2024-A3.2.8','第3.2.8条'),
      guideRow('云南地方规定','《云南省绿色建筑管理办法》云建规〔2026〕3号第6条第（二）项',ready?'一星级及以上':'待确认投资与建筑性质','新建公共机构建筑、政府投资公益性建筑和大型公共建筑应达到绿色建筑一星级及以上标准。','SRC-YN-YJG-2026-3-A6','第6条第（二）项'),
      guideRow('保山具体落实','《保山市住房和城乡建设局关于加快推进绿色建筑工作的通知》保建发〔2020〕37号第一条、第二条第（一）项','全过程执行绿色建筑标准','保山市新建建筑全面执行绿色建筑标准，并在设计、审图、施工许可、监理和验收备案等环节落实。','SRC-BS-BJF-2020-37-A1-A2','第一条、第二条第（一）项'),
    ],conclusion,'投资性质不是现有结构参数，必须由项目资料确认后才能确定星级。',ready);
  }
  if(topic==='prefab'){
    const ready=government&&school,conclusion=ready?'原则上采用装配式；单体装配率≥15%':'待确认是否属于新建政府投资公益性建筑';
    return guideDraft(topic,input,[
      guideRow('国家认定标准','《装配式建筑评价标准》GB/T 51129—2017第3.0.3条','认定门槛：装配率≥50%','主体结构评价分值不低于20分、围护墙和内隔墙不低于10分、采用全装修且装配率不低于50%。','SRC-GBT51129-2017-A3.0.3','第3.0.3条'),
      guideRow('云南采用要求','《云南省住房和城乡建设厅关于进一步促进装配式建筑产业健康发展的通知》云建科〔2021〕42号第一条',ready?'原则上采用装配式建造':'待确认投资性质','新建政府投资公益性建筑和市政设施原则上采用装配式建造；新建公共建筑优先采用钢结构。','SRC-YN-YJK-2021-42-A1','第一条'),
      guideRow('云南装配率要求','同通知第二条','保山单体装配率≥15%','采用装配式技术体系的混凝土建筑，昆明规定区域不低于20%，其他城市不低于15%；保山按其他城市执行。','SRC-YN-YJK-2021-42-A2','第二条'),
    ],conclusion,'15%是云南采用装配式技术体系的实施门槛；认定为装配式建筑仍须满足国家标准50%及主体结构20分等条件。',ready);
  }
  const performanceReady=school&&intensity8&&threeStoreys&&largeEnough;
  const perfMissing=[];if(!school)perfMissing.push('学校用途');if(!intensity8)perfMissing.push('8度设防烈度');if(!threeStoreys)perfMissing.push('地上3层及以上');if(!largeEnough)perfMissing.push('单体建筑面积＞1000㎡');
  if(topic==='performance'){
    const conclusion=performanceReady?'设防地震时正常使用；必须采用隔震或消能减震':'待补充：'+perfMissing.join('、');
    return guideDraft(topic,input,[
      guideRow('国家设计方法','《建筑抗震设计标准》GB/T 50011—2010（2016年版·2024年局部修订）第3.10.2条','选定明确性能目标','建筑性能目标宜采用不同地震动水准下的结构和非结构性能状态要求表征。','SRC-GBT50011-2024-A3.10.2','第3.10.2条'),
      guideRow('国家强制要求','《建设工程抗震管理条例》国务院令第744号第16条',school&&intensity8?'设防地震时正常使用':'待核对适用条件','高烈度设防地区的新建学校等建筑应采用隔震减震技术，保证设防地震时满足正常使用要求。','SRC-GWY-744-A16','第16条'),
      guideRow('云南地方落实','《云南省隔震减震建筑工程促进规定》云南省人民政府令第202号第3条第（一）项、第8条',performanceReady?'必须采用并专项审查':'待核对层数及面积','7度以上区域内三层以上且单体建筑面积1000㎡以上的学校校舍应采用隔震减震技术，并在初步设计后报专项审查。','SRC-YN-GOV-202-A3-A8','第3条第（一）项、第8条'),
    ],conclusion,'系统只判断是否触发强制条件；隔震或消能减震的方案选择必须人工比选。',performanceReady);
  }
  if(topic==='damping'||topic==='isolation'){
    const isDamping=topic==='damping',conclusion=performanceReady?(isDamping?'消能减震可选，须专项分析与专项审查':'隔震可选，须专项分析与专项审查'):'待补充：'+perfMissing.join('、');
    const national=isDamping
      ?guideRow('国家标准','《建筑抗震设计标准》GB/T 50011—2010（2016年版·2024年局部修订）第3.8.1条、第3.8.2条','可作为实现路径','隔震与消能减震可用于对抗震安全性和使用功能有较高要求的建筑，并可按高于基本设防目标设计。','SRC-GBT50011-2024-A3.8','第3.8.1条、第3.8.2条')
      :guideRow('国家标准','《建筑隔震设计标准》GB/T 51408—2021第1.0.3条','设防地震基本不损坏','设防地震时主体结构基本不受损坏或不需修理可继续使用；罕遇地震后经修复可继续使用。','SRC-GBT51408-2021-A1.0.3','第1.0.3条');
    return guideDraft(topic,input,[national,
      guideRow('云南地方规定','《云南省隔震减震建筑工程促进规定》云南省人民政府令第202号第3条、第8条、第9条',performanceReady?'法定可选方案':'待核对强制条件','设计单位应执行国家和云南省标准，并在设计文件中明确装置性能、检测、安装和维护要求；规定范围项目须专项审查。','SRC-YN-GOV-202-A3-A8-A9','第3条、第8条、第9条'),
      guideRow('保山具体落实','《保山市住房和城乡建设局关于进一步规范建筑工程抗震设防专项审查工作的通知》保建发〔2017〕31号第一条','须专项分析与专项审查','学校等规定范围项目及采用隔震减震新技术的高层建筑工程，应按权限进行专项审查。','SRC-BS-BJF-2017-31-A1','第一条'),
    ],conclusion,'系统不自动选择隔震或消能减震；由专业负责人结合建筑、设备、造价和结构分析确认。',performanceReady);
  }
  return null;
}
export function decisionSignature(context){return fingerprint(context);}
export function currentDecisions(records,unit,contextFor){return records.filter(r=>r.status==='confirmed'&&(r.unit===PROJECT||r.unit===unit)&&r.signature===decisionSignature(contextFor(r.unit)));}
export function confirmDecision(record,context,role){
  if(role!=='m')throw Error('由专业负责人确认判断');
  if(!record.conclusion?.trim()||!record.source_id?.trim()||!record.locator?.trim()||!record.scope?.trim())throw Error('请补齐结论、来源、原文定位和适用条件');
  if(!record.evidence?.trim())throw Error('请填写原文摘录或判断依据');
  return {...record,status:'confirmed',signature:decisionSignature(context),reviewedAt:new Date().toISOString(),reviewedBy:role};
}

const sum=a=>a.reduce((n,v)=>n+Number(v||0),0);
const ratio=(v,a)=>a>0?v/a:null;
export function materialSummary(input={}){
  const rebar=input.rebar||[],concrete=input.up?.floors||[],base=(input.base?.rows||[]).filter(r=>!r.isSum&&!/合计|小计|总计/.test(r.name));
  const warnings=[];
  const floors=[...new Set([...rebar,...concrete].map(r=>r.floor))].sort((a,b)=>a-b).map(floor=>{
    const r=rebar.find(r=>r.floor===floor),c=concrete.find(r=>r.floor===floor);
    const components=(r?.rows||[]).filter(x=>!/^(合计|小计|总计)$/.test(x.cat));
    const kg=r?sum(components.map(x=>x.total)):null,volume=c?sum(c.comp.map(x=>x.sum)):null;
    const areaR=r?.area||0,areaC=c?.area||0;
    if(r&&!areaR)warnings.push(`${floor}层钢筋面积缺失`);
    if(c&&!areaC)warnings.push(`${floor}层混凝土面积缺失`);
    if(r&&c&&Math.abs(areaR-areaC)>0.01)warnings.push(`${floor}层两份资料的楼面面积不同`);
    if(components.some(x=>x.totalConflict))warnings.push(`${floor}层钢筋合计存在冲突`);
    if(c&&Math.abs(volume-c.total)>0.01)warnings.push(`${floor}层混凝土分项与文件合计不同`);
    return {floor,areaR,areaC,kg,volume,steelRate:r?ratio(kg,areaR):null,concreteRate:c?ratio(volume,areaC):null,components,concreteComponents:c?.comp||[]};
  });
  if(rebar.length&&concrete.length&&floors.some(f=>f.kg===null||f.volume===null))warnings.push('钢筋与混凝土资料楼层范围不同');
  const kg=rebar.length?sum(floors.map(f=>f.kg)):null,volume=concrete.length?sum(floors.map(f=>f.volume)):null;
  const areaR=sum(floors.map(f=>f.areaR)),areaC=sum(floors.map(f=>f.areaC));
  const foundation=input.base?sum(base.map(r=>r.sum)):null;
  const firstAreas=[...rebar,...concrete].filter(r=>/^(1|1层|首层|1F|F1)$/i.test(String(r.floor).trim())).map(r=>Number(r.area)).filter(a=>Number.isFinite(a)&&a>0);
  const manualArea=input.firstFloorArea!==undefined&&input.firstFloorArea!==null&&input.firstFloorArea!=='';
  const areaConflict=firstAreas.some(a=>Math.abs(a-firstAreas[0])>0.01);
  const firstFloorArea=manualArea?(Number.isFinite(Number(input.firstFloorArea))&&Number(input.firstFloorArea)>0?Number(input.firstFloorArea):null):firstAreas.length&&!areaConflict?firstAreas[0]:null;
  if(foundation!==null&&!firstFloorArea)warnings.push(areaConflict&&!manualArea?'首层面积不一致，请补填首层面积':'请补填首层面积');
  return {floors,base,kg,tonnes:kg===null?null:kg/1000,volume,areaR,areaC,firstFloorArea,foundationRate:foundation===null?null:ratio(foundation,firstFloorArea),steelRate:rebar.length&&rebar.every(r=>r.area>0)?ratio(kg,areaR):null,concreteRate:concrete.length&&concrete.every(c=>c.area>0)?ratio(volume,areaC):null,foundation,warnings};
}
export function steelSignature(unit,params){return fingerprint({input:unit.input,sources:unit.sources,scope:unit.scope,params});}
export function reviewSteel(unit,params,role){
  if(role!=='m')throw Error('由专业负责人审核用量');
  const totals=materialSummary(unit.input);
  if(totals.kg===null&&totals.volume===null&&totals.foundation===null)throw Error('请先导入当前单体的工程量');
  if(totals.warnings.length)throw Error('请先解决口径问题：'+totals.warnings.join('；'));
  if(!unit.scope?.trim())throw Error('请填写统计范围，注明地下室、基础和后浇带的计入方式');
  return {at:new Date().toISOString(),by:role,signature:steelSignature(unit,params),totals,scope:unit.scope,params};
}

const bundleFields={'project.name':'project_name','project.code':'project_code','project.location':'region','building.name':'unit_name','building.function':'use','structure.system':'struct_sys','seismic.site_class':'site_class','site.site_class':'site_class','site.groundwater_type':'geo_water','site.groundwater_level':'geo_water','site.strata':'geo_strata','site.liquefaction':'geo_liquefaction','foundation.type':'geo_foundation'};
// All previous confirmations remain provenance, never authorization in a new project.
export function convertCleaningBundle(bundle,targetUnit,bundleId){
  if(!Array.isArray(bundle?.candidates)||!Array.isArray(bundle?.sources))throw Error('不是可识别的 task2 清洗成果包');
  if(bundle.candidates.length>2000)throw Error('成果包过大，请分批导入');
  const facts=[],sources=[],unmapped=[];
  for(const s of bundle.sources){sources.push({source_id:bundleId+':'+s.source_id,original_source_id:s.source_id,name:s.file_name||s.source_id,slot:s.domain==='地勘'?'geo':'bldg',hash:s.sha256||'',fragments:[],bundle_id:bundleId});}
  for(const c of bundle.candidates){
    const key=bundleFields[c.field_id],src=sources.find(s=>s.original_source_id===c.source_id);
    if(!key||!src||!c.locator||!c.evidence){unmapped.push(c);continue;}
    const global=/全项目|全场地/.test(c.scope)||key.startsWith('project_')||key==='region';
    const unit=global?PROJECT:targetUnit;
    if(!unit||unit===PROJECT&&['unit_name','use','struct_sys'].includes(key)){unmapped.push(c);continue;}
    const value=String(c.normalized_value??c.raw_value??'');
    // Renaming a unit is not a string replacement of its source evidence.
    if(key==='unit_name'&&value!==unit){unmapped.push(c);continue;}
    const id=bundleId+':'+c.candidate_id;
    src.fragments.push({id,text:String(c.evidence),locator:String(c.locator),unit});
    facts.push({id,key,value,unit,label:FIELD_LABELS[key],slot:src.slot,source_id:src.source_id,filename:src.name,locator:String(c.locator),quote:String(c.evidence),statement:c.claim_type||'待核实',status:'candidate',previous_status:c.status,original_source_id:c.source_id,bundle_id:bundleId});
  }
  return {facts,sources,unmapped,issues:bundle.issues||[],confirmations:bundle.confirmations||[]};
}
