import {paragraphKinds,blockTableRecords,sourceParagraphs,usable,projectName} from './intake-structure.js';
// Current-project evidence only. Historical retrieval never writes these facts.
import {fingerprint} from './expansion-core.js';
import {gradeParameters} from './seismic-grade-core.js';

export const PROJECT='项目整体';
export const FIELD_LABELS={geo_corrosivity:'腐蚀性评价',geo_seismic_site:'场地地震参数',bldg_area:'建筑面积（㎡）',height_planning_m:'规划高度（m）',height_fire_m:'消防高度（m）',project_name:'项目名称',project_code:'项目编号',region:'工程地点',unit_name:'单体名称',use:'建筑用途',floors_above:'地上层数',floors_below:'地下层数',height_m:'结构高度（m）',height_arch_m:'建筑高度（m）',span_m:'主要跨度（m）',struct_sys:'结构体系',site_class:'场地类别',geo_water:'地下水描述',water_depth:'抗浮水位采用值',geo_water_candidate:'抗浮水位建议',geo_foundation:'基础建议',geo_strata:'地层描述',geo_liquefaction:'液化情况',bldg_total:'总建筑面积（㎡）'};
export const GLOBAL_KEYS=new Set(['project_name','project_code','region','site_class','water_depth']);
export const UNIT_KEYS=new Set(['bldg_area','height_planning_m','height_fire_m','unit_name','use','floors_above','floors_below','height_m','height_arch_m','span_m','struct_sys']);
export function freshIntake(){return {schema:1,sources:[],facts:[],history:[],suggestions:{},locationQueries:[],revision:0};}
const compact=s=>String(s??'').replace(/\s+/g,'').replace(/Ⅲ/g,'III').replace(/Ⅱ/g,'II').replace(/Ⅳ/g,'IV').replace(/Ⅰ/g,'I');
export function fragments(blocks){
  const result=[];let context='';
  const kinds=paragraphKinds(blocks.paras||[]);
  const tables=(blocks.tables||[]).map((rows,t)=>blockTableRecords(blocks,t));
  const knownUnits=[...new Set(tables.flat().filter(usable).map(r=>r.unit).filter(Boolean))];
  (blocks.paras||[]).forEach((p,i)=>{
    const text=String(p).trim();if(!text)return;
    const name=/(?:单体名称|建筑名称|单体)\s*[:：]\s*([^，。；;\n]+)/.exec(text);
    const namedUnit=knownUnits.find(unit=>text.startsWith(unit+'：')||text.startsWith(unit+':'));
    if(name)context=name[1].trim();else if(namedUnit)context=namedUnit;else if(kinds[i]==='heading'||kinds[i]==='requirement')context='';
    result.push({id:'F'+(result.length+1),text,locator:'提取段落 '+(i+1),unit:context,kind:kinds[i]});
  });
  (blocks.tables||[]).forEach((rows,t)=>{
    for(const row of tables[t])if(row.text)result.push({...row,id:'F'+(result.length+1),locator:'提取表 '+(t+1)+' 行 '+(row.index+1)});
  });
  return result;
}
export function factId(f){return 'IN-'+fingerprint([f.source_id,f.fragment_id,f.key,f.unit,f.value]);}
export function validateExtraction(payload,source,{maxFacts=400}={}){
  const facts=[],warnings=[];const classified=new Map(sourceParagraphs(source).map(f=>[f.id,f]));const byId=new Map(source.fragments.filter(f=>/表\s*\d+/.test(f.locator||'')||classified.has(f.id)).map(f=>[f.id,classified.get(f.id)||f]));
  for(const item of (Array.isArray(payload?.facts)?payload.facts:[]).slice(0,maxFacts)){
    if(!item||typeof item!=='object')continue;
    const f=byId.get(item.fragment_id),key=item.key,value=String(item.value??'').trim(),quote=String(item.quote??'').trim(),unit=String(item.unit||PROJECT).trim();
    if(!Object.hasOwn(FIELD_LABELS,key)||!f||!usable(f)||!value||value.length>1800||!quote||!compact(f.text).includes(compact(quote))||!compact(quote).includes(compact(value))){warnings.push('已拦截一项缺少原文支持的提取结果');continue;}
    if(key==='project_name'&&projectName(value)!==value){warnings.push('项目名称包含标签或证书字段');continue;}
    if(UNIT_KEYS.has(key)&&(unit===PROJECT||!(compact(f.text).includes(compact(unit))||f.unit===unit))){warnings.push('单体归属不明确：'+FIELD_LABELS[key]);continue;}
    if(unit!==PROJECT&&f.unit&&f.unit!==unit){warnings.push('提取单体与来源单体不符');continue;}
    // A project's identity is global; geotechnical facts may be scoped to a unit.
    if(['project_name','project_code','region'].includes(key)&&unit!==PROJECT){warnings.push('项目公共信息不能归入单个单体');continue;}
    const fact={key,value,quote,unit,fragment_id:f.id,locator:f.locator,source_id:source.source_id,filename:source.name,slot:source.slot,category:key.startsWith('geo_')||['site_class','water_depth'].includes(key)?'geo':'bldg',label:FIELD_LABELS[key],statement:/建议|拟采用|宜采用|推荐/.test(quote)?'作者观点':'原文事实',status:'candidate'};
    fact.id=factId(fact);if(!facts.some(x=>x.id===fact.id))facts.push(fact);
  }
  return {facts,warnings:[...new Set([...warnings,...(Array.isArray(payload?.warnings)?payload.warnings:[]).filter(x=>typeof x==='string').slice(0,20)])]};
}
export function extractLocal(source){
  const facts=[];const patterns={project_name:/(?:项目名称|工程名称|组团名称)\s*[:：]\s*([^。；;\n]+)/,project_code:/(?:项目编号|工程编号|设计编号)\s*[:：]\s*([\w-]+)/,region:/(?:工程地点|建设地点|项目地点|项目用地位于|工程位于)\s*[:：]?\s*([^。；;\n]+)/,unit_name:/(?:单体名称|建筑名称|单体)\s*[:：]\s*([^，。；;\n]+)/,use:/(?:建筑用途|使用功能|用途)\s*[:：]\s*([^，。；;\n]+)/,floors_above:/地上(?:层数)?\s*[:：]?\s*(\d+)\s*(?:层|(?=[；;，,]|$))/,floors_below:/地下(?:层数)?\s*[:：]?\s*(\d+)\s*(?:层|(?=[；;，,]|$))/,height_m:/(?:结构高度|结构总高)\s*(?:为|约|是|[:：])?\s*([\d.]+)\s*(?:m(?![a-z²2])|米)/i,height_arch_m:/(?:建筑高度)\s*(?:为|约|是|[:：])?\s*([\d.]+)\s*(?:m(?![a-z²2])|米)/i,span_m:/(?:主要跨度|最大跨度)\s*(?:为|约|[:：])?\s*([\d.]+)\s*(?:m(?![a-z²2])|米)/i,struct_sys:/(?:结构体系|结构形式)\s*(?:采用|为|[:：])?\s*([^，。；;\n]+)/,site_class:/场地类别\s*(?:为|[:：])?\s*((?:[ⅠⅡⅢⅣ]+|I[0-4V]*|III|II|IV)\s*类)/i,bldg_total:/总建筑面积\s*(?:为|[:：])?\s*([\d,.]+)\s*(?:m|㎡|平方米)/i};
  for(const f of [...sourceParagraphs(source),...source.fragments.filter(f=>/表\s*\d+/.test(f.locator||''))].filter(usable)){
    for(const [key,re] of Object.entries(patterns)){const m=re.exec(f.text);if(m)facts.push({key,value:key==='project_name'?projectName(m[1]):m[1].trim(),quote:f.text,fragment_id:f.id,unit:UNIT_KEYS.has(key)?(key==='unit_name'?m[1].trim():f.unit||PROJECT):PROJECT});}
    for(const cell of f.fields||[]){
      const label=cell.label,value=cell.value;if(!cell.mapped||!value)continue;
      const mappings={floors_above:/^地上层数$/,floors_below:/^地下层数$/,height_m:/^结构(?:高度|总高)(?:[（(]m[）)])?$/i,height_arch_m:/^建筑高度(?:[（(](?:米|m)[）)])?$/i,height_planning_m:/规划高度/,height_fire_m:/消防高度/,bldg_area:/^建筑面积/,use:/主要功能|使用功能|建筑用途/,struct_sys:/结构类型|结构形式/};
      for(const [key,re] of Object.entries(mappings))if(cell.path.some(p=>re.test(p))&&!(/height/.test(key)&&/mm|cm|毫米|厘米/i.test(label))&&!(/area/.test(key)&&/公顷|亩|万/.test(label))&&(!/height|area|floors/.test(key)||/^\d+(?:\.\d+)?$/.test(value)))facts.push({key,value,quote:f.text,fragment_id:f.id,unit:f.unit||PROJECT});
      if(/地上\s*[/／]\s*地下层数/.test(label)&&/^\d+\s*[/／]\s*\d+$/.test(value))value.split(/[/／]/).forEach((v,i)=>facts.push({key:i?'floors_below':'floors_above',value:v.trim(),quote:f.text,fragment_id:f.id,unit:f.unit||PROJECT}));
    }
    if(source.slot==='geo'){
      // Keep distinct sentences; identical prose is not broadcast into three chapters.
      for(const text of (f.kind==='table_row'?[f.text]:f.text.split(/(?<=[。])/).filter(t=>t.trim()))){
        const matches=Object.entries({geo_water_candidate:/抗浮水位/,geo_corrosivity:/腐蚀性/,geo_seismic_site:/等效剪切波速|覆盖层厚度|场地类别/,geo_liquefaction:/液化/,geo_foundation:/基础.*建议|建议.*基础|持力层|桩长/,geo_water:/地下水|水位埋深/,geo_strata:/地层|粉质黏土|砂岩|填土层/}).filter(([,re])=>re.test(text));
        if(matches.length)facts.push({key:matches[0][0],value:text.trim(),quote:f.text,fragment_id:f.id,unit:f.unit||PROJECT});
      }
    }
  }
  return validateExtraction({facts},source,{maxFacts:Infinity});
}
export function conflicts(facts){const groups=new Map();for(const f of facts.filter(f=>f.status!=='rejected')){const k=f.unit+'|'+f.key;const arr=groups.get(k)||[];arr.push(f);groups.set(k,arr);}return [...groups.values()].filter(a=>new Set(a.map(f=>compact(f.value))).size>1);}
export function mergeCandidates(state,source,incoming){
  if(!state.sources.some(s=>s.source_id===source.source_id))state.sources.push(source);
  for(const f of incoming)if(!state.facts.some(x=>x.id===f.id))state.facts.push(f);
}
export function sourceRemoval(state,sourceId,parameters={}){
  const source=state.sources.find(s=>s.source_id===sourceId);if(!source)throw Error('资料不存在或已移除');
  const ids=new Set([sourceId]);
  // A location lookup is shared if another document still supports that location.
  const removedLabels=new Set((state.locationQueries||[]).filter(q=>q.source_id===sourceId).flatMap(q=>q.matches.map(m=>m.label)));
  const keptLabels=new Set((state.locationQueries||[]).filter(q=>q.source_id!==sourceId).flatMap(q=>q.matches.map(m=>m.label)));
  for(const s of state.sources)if(s.slot==='lookup'&&s.fragments.some(f=>removedLabels.has(f.locator)&&!keptLabels.has(f.locator)))ids.add(s.source_id);
  const facts=state.facts.filter(f=>ids.has(f.source_id)),remaining=state.facts.filter(f=>!ids.has(f.source_id)),clear={},retained=[];
  for(const f of facts.filter(f=>f.status==='confirmed'&&f.unit===PROJECT&&(GLOBAL_KEYS.has(f.key)||f.slot==='lookup'))){
    if(remaining.some(r=>r.status==='confirmed'&&r.unit===PROJECT&&r.key===f.key&&compact(r.value)===compact(parameters[f.key])))continue;
    if(compact(parameters[f.key])===compact(f.value))clear[f.key]='';
    else if(parameters[f.key])retained.push(f.key);
  }
  return {source,sources:state.sources.filter(s=>ids.has(s.source_id)),facts,clear,retained:[...new Set(retained)]};
}
export function removeSource(state,plan){
  const ids=new Set(plan.sources.map(s=>s.source_id));
  state.removedSources??=[];
  const record={id:plan.source.source_id+'-'+Date.now(),name:plan.source.name,at:new Date().toISOString(),sources:plan.sources,facts:plan.facts};
  state.removedSources.push(record);
  state.sources=state.sources.filter(s=>!ids.has(s.source_id));state.facts=state.facts.filter(f=>!ids.has(f.source_id));
  const affected=new Set(plan.facts.map(f=>f.unit));
  for(const f of state.facts)if(f.source_id.startsWith('DECISION-')&&f.status==='confirmed'&&(affected.has(PROJECT)||affected.has(f.unit))){f.status='candidate';f.reason='输入资料已移除，方案需重新确认';}
  state.suggestions={};state.locationQueries=(state.locationQueries||[]).filter(q=>!ids.has(q.source_id));
  state.history.push({event:'移除资料',source_id:plan.source.source_id,archive_id:record.id,clearedKeys:Object.keys(plan.clear),retainedKeys:plan.retained,at:record.at});state.revision++;
  return record;
}
export function restoreSource(state,id){
  const record=(state.removedSources||[]).find(r=>r.id===id);if(!record)throw Error('未找到已移除资料');
  for(const s of record.sources)mergeCandidates(state,s,record.facts.filter(f=>f.source_id===s.source_id).map(f=>({...f,status:'candidate',confirmedAt:undefined,reason:'从已移除资料恢复，请重新核对采用'})));
  state.removedSources=state.removedSources.filter(r=>r.id!==id);state.history.push({event:'恢复资料为候选',archive_id:id,at:new Date().toISOString()});state.revision++;
}
export function adoptFact(state,id,{value,reason='',resolve=false}={}){
  const f=state.facts.find(x=>x.id===id);if(!f)throw Error('候选项不存在');
  const next=String(value??f.value).trim();if(!next)throw Error('采用值不能为空');
  if(f.key==='unit_name'&&next!==f.unit)throw Error('单体归属来自原文，请修正单体名称后重新导入资料');
  const peers=state.facts.filter(x=>x.id!==id&&x.unit===f.unit&&x.key===f.key&&x.status!=='rejected'&&compact(x.value)!==compact(next));
  if(peers.length&&(!resolve||!reason.trim()))throw Error('存在不同取值，请填写采用理由后解决冲突');
  if(next!==f.value&&!reason.trim())throw Error('更正提取值时请填写原因');
  state.history.push({at:new Date().toISOString(),event:'采用资料候选',id,before:f.value,after:next,reason,otherCandidates:peers.map(x=>x.id)});
  for(const p of peers){p.status='rejected';p.rejectionReason=reason;}
  if(!f.original_value)f.original_value=f.value;if(next!==f.value){f.original_statement=f.original_statement||f.statement;f.statement='我的观点（人工更正，原文保留）';}f.value=next;f.status='confirmed';f.reason=reason;f.confirmedAt=new Date().toISOString();state.revision++;
  return f;
}
export function unitNames(state){return [...new Set([...state.facts.filter(f=>f.status==='confirmed'&&UNIT_KEYS.has(f.key)).map(f=>f.unit),...Object.keys(state.seismicGrades||{})])];}
export function unitParameters(state,unit){return Object.fromEntries(state.facts.filter(f=>f.status==='confirmed'&&f.unit===unit&&['struct_sys','site_class','water_depth'].includes(f.key)).map(f=>[f.key,f.value]));}
export function combinedParameters(state,unit,global){
  const local=unitParameters(state,unit),result={...global,...local};
  if(local.struct_sys&&local.struct_sys!==global.struct_sys)for(const key of ['g_frame','g_wall','g_frame_m','g_wall_m'])result[key]='';
  if(local.site_class&&compact(local.site_class)!==compact(global.site_class))result.tg='';
  Object.assign(result,gradeParameters(state.seismicGrades?.[unit],result));
  return result;
}
export function expansionEvidence(state,unit,parameters=null,includeCandidates=false){
  const selected=state.facts.filter(f=>(f.status==='confirmed'||(includeCandidates&&f.status==='candidate'))&&((includeCandidates&&unit===PROJECT)||f.unit===PROJECT||f.unit===unit)&&!(parameters&&f.status==='confirmed'&&f.unit===PROJECT&&(GLOBAL_KEYS.has(f.key)||f.slot==='lookup')&&compact(parameters[f.key])!==compact(f.value)));
  const facts=selected.map(f=>({...f,id:'INTAKE-'+f.id,key:UNIT_KEYS.has(f.key)?'bldg_'+f.key:f.key,origin:'intake'}));
  const ids=new Set(facts.map(f=>f.source_id));return {facts,sources:state.sources.filter(s=>ids.has(s.source_id)).map(s=>({source_id:s.source_id,name:s.name,hash:s.hash,slot:s.slot,origin:'intake',text:s.fragments.map(f=>f.text).join('\n')}))};
}
export function matchLocation(text,locations){
  const result=[];for(const [province,data] of Object.entries(locations))for(const county of data.counties||[]){if(!text.includes(county.n))continue;const score=1+(text.includes(province)?4:0)+(text.includes(county.c)?2:0);result.push({province,county,score,label:province+(county.c===province?'':county.c)+county.n});}
  result.sort((a,b)=>b.score-a.score);return result.length?result.filter(r=>r.score===result[0].score):[];
}
