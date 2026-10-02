import {selectedRegulations} from './regulation-document.js';
import {referenceSections} from './reference-report.js';
import {defaultExpansion} from './default-expansion.js';
import {TEMPLATE_SOURCE,TEMPLATE_TEXT,TEMPLATE_TABLES} from './approved-template.js';
// Evidence and revision rules shared by the browser, API and regression tests.
export const VERSION = '2.0.0';
export const SECTIONS = [
  ['overview','1 工程概况','s2ch1','建筑用途、单体、层数、高度与周边条件；不补写不存在的地址。'],
  ['basis','2 设计依据','s2ch2','列出本项目确认的规范及资料版本；目录证据不能替代具体条文。'],
  ['criteria','3 设计标准与参数','s2ch3','引用统一技术措施参数，说明适用单体；不推算未经确认的等级。'],
  ['loads','4 主要荷载及作用取值','s2ch4','采用已确认荷载、材料及用途证据；缺少做法时列出缺项。'],
  ['ground','5 工程地质与场地条件','s2ch5','归纳地层、地下水及不良地质；区分地勘建议与采用值。'],
  ['foundation','5.3 地基基础设计','s2foundation','结合持力层、地下水与地勘建议组织；没有反力和验算不能宣称承载力满足。'],
  ['selection','6 结构方案与选型','s2ch6','按建筑需求、已定体系、适用依据、模型复核、未决项组织；不得虚构比选过程。'],
  ['materials','7 主要结构材料','s2ch7','按用户指定统一措施采用材料通用条款，项目有变化时调整。'],
  ['model','8 计算原则与主要结果','s2ch8','只引用当前单体已确认模型批次。结果、判据和判断分别说明。'],
  ['special','9 专项与加强措施','s2ch9','仅纳入当前证据支持的专项；关键词或历史案例不能确认不规则性。'],
  ['review','10 编制说明','s2ch10','归纳当前缺项、冲突及复核事项；不得把待核改成已完成。'],
].map(([id,title,anchor,rule])=>({id,title:referenceSections.find(x=>x[0]===id)?.[1]||title,anchor,rule})).sort((a,b)=>referenceSections.findIndex(x=>x[0]===a.id)-referenceSections.findIndex(x=>x[0]===b.id));
export const LABELS = {site_surround:'周边条件',bldg_total:'总建筑面积',bldg_above:'地上建筑面积',bldg_below:'地下建筑面积',bldg_civil:'人防面积',bldg_units:'建筑单体信息',geo_landform:'地形地貌',geo_strata:'地层',geo_water:'地下水',geo_corrosion:'腐蚀性',geo_vs_note:'场地类别依据',geo_liquefaction:'液化',geo_settlement:'沉降与震陷',geo_fault:'断裂影响',geo_foundation:'地勘基础建议',geo_foundation_note:'基础注意事项',geo_water_candidate:'抗浮水位建议',geo_soil:'岩土参数表',geo_bore:'钻孔信息'};
export const PARAMS = ['project_name','project_code','region','struct_sys','intensity','pga','eq_group','site_class','tg','wind','snow','safety_grade','gamma0','found_grade','anti_float','water_depth','g_frame','g_wall','fixed_end','has_basement','has_iso','has_convert','has_longspan','software','iso_pos','waterproof','damping'];
export function stable(value) { if(Array.isArray(value)) return '['+value.map(stable).join(',')+']'; if(value && typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}'; return JSON.stringify(value); }
export function fingerprint(value) { let h=2166136261; for(const c of stable(value)||'')h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0).toString(16); }
export function createState(identity) { return {schema:2,identity,revision:0,parameters:{},parametersConfirmed:false,facts:[],sources:[],model:null,regulations:[],sections:{},history:[],signed:null,criteria:[],reviewAcknowledged:null}; }
export function tokens(text) { return [...String(text).matchAll(/\{\{([pfmrt]):([^{}]+)\}\}/g)].map(m=>({raw:m[0],kind:m[1],key:m[2]})); }
export function textValue(v) { return typeof v==='object'?JSON.stringify(v):String(v??''); }
export function references(s) {
  const refs={p:{},f:{},m:{},r:{},t:{...TEMPLATE_TEXT,...s.templateText}};
  Object.assign(refs.p,Object.fromEntries(Object.entries(s.parameters).filter(([k,v])=>v!==''&&v!==null)));
  s.facts.filter(f=>f.status==='confirmed').forEach(f=>refs.f[f.id]=textValue(f.value));
  if(s.model?.confirmed)Object.entries(s.model.metrics||{}).forEach(([k,v])=>{if(typeof v!=='object')refs.m[k]=textValue(v);});
  s.regulations.filter(r=>r.selected&&r.review==='confirmed'&&r.status==='current').forEach(r=>refs.r[r.id]=`${r.title} ${r.code||''}${r.version?'（'+r.version+'）':''}`);
  return refs;
}
export function resolveText(text,s) { const refs=references(s); return String(text).replace(/\{\{([pfmrt]):([^{}]+)\}\}/g,(_,kind,key)=>refs[kind][key]??(kind==='f'&&s.facts.find(f=>f.id===key&&f.status==='candidate')?'【待核】'+textValue(s.facts.find(f=>f.id===key).value):'【待核引用】')); }
export function dependencies(s) { return fingerprint({identity:s.identity,measuresVersion:s.measuresVersion,parameters:s.parameters,confirmed:s.parametersConfirmed,templateText:s.templateText,templateTables:s.templateTables,regularity:s.regularity,unitTable:s.unitTable,referenceNorms:s.referenceNorms,reportImages:s.reportImages,unitParameters:s.unitParameters,document:s.document,facts:s.facts,model:s.model,regulations:s.regulations,regulationDocument:s.regulationDocument,criteria:s.criteria}); }
export function requestStamp(s,id) { const d=s.sections[id];return fingerprint({deps:dependencies(s),section:d?{text:d.text||'',hidden:!!d.hidden}:null}); }
export function isCurrent(s,id,stamp) { return requestStamp(s,id)===stamp; }
export function validateDraft(draft,s,original='') {
  const errors=[], warnings=[];const refs=references(s);
  if(!draft||typeof draft.text!=='string'||!draft.text.trim()||draft.text.length>24000)return {errors:['正文为空或超过长度限制'],warnings};
  if(/<\/?(?:script|iframe|object|style)\b/i.test(draft.text))errors.push('正文含不允许的标记');
  // Deterministic document composition already binds its extracted text to source fragments.
  // Regenerate to verify the whole draft; AI/manual text still uses the strict validator below.
  if(!original&&draft.kind==='template'&&(s.referenceTemplate||s.document?.sourceIds?.length)&&SECTIONS.some(x=>x.id===draft.sectionId)){
    const expected=defaultExpansion(s,draft.sectionId);
    if(draft.text===expected.text&&JSON.stringify(draft.evidence_ids)===JSON.stringify(expected.evidence_ids))return {errors,warnings};
  }
  tokens(draft.text).forEach(t=>{if(refs[t.kind][t.key]===undefined)errors.push('引用不存在或尚未确认：'+t.raw);});
  const allowed=new Set([...s.facts.filter(f=>f.status==='confirmed').map(f=>f.source_id),...s.regulations.filter(r=>r.selected&&r.review==='confirmed'&&r.status==='current').map(r=>r.source_id),...(s.model?.confirmed?s.model.sourceIds:[]),'MEASURES-CONFIRMED',TEMPLATE_SOURCE]);
  if(!Array.isArray(draft.evidence_ids))errors.push('缺少证据来源列表');
  for(const id of draft.evidence_ids||[])if(!allowed.has(id))errors.push('来源未确认：'+id);
  for(const t of tokens(original))if(!draft.text.includes(t.raw))errors.push('改写丢失受保护引用：'+t.raw);
  for(const t of original.match(/\[\[(?:table|image):[^\]]+\]\]/g)||[])if(!draft.text.includes(t))errors.push('改写丢失表格或图片位置：'+t);
  const unitNames=[...new Set(s.facts.map(f=>f.unit).filter(Boolean))];
  const body=unitNames.reduce((text,name)=>text.split(name).join(''),draft.text);
  const prose=body.replace(/\{\{[^{}]+\}\}/g,'').replace(/^\d+(?:\.\d+)*\s+[^\n]+$/gm,'');
  if(/\d/.test(prose))errors.push('正文中的数值须使用资料或参数引用，请把数字绑定到来源');
  if(/(?:框架结构|剪力墙结构|框架[—-]剪力墙|[一二三四特]级抗震|[甲乙丙丁]类|[一二三四]级|[六七八九]度)/.test(prose))errors.push('体系或等级须通过统一措施字段引用，不能复制为固定文字');
  if(/经(?:分析|计算|验算).*满足|满足(?:规范|承载力|净高)|无薄弱层|无需.*验算|已.*(?:加强|调整)|经济合理|最优/.test(prose))warnings.push('存在肯定判断，需核对其适用判据与证据');
  if(!draft.evidence_ids?.length&&tokens(draft.text).length)warnings.push('请补充证据来源');
  return {errors:[...new Set(errors)],warnings:[...new Set(warnings)]};
}
export function parseNumeric(raw) {
  const str=String(raw??'').trim();if(!str||str==='—')return null;
  const ratio=/^1\s*\/\s*(\d+(?:\.\d+)?)/.exec(str);if(ratio)return +ratio[1]>0?1/+ratio[1]:null;
  const m=/^[-+]?\d+(?:\.\d+)?(?:[Ee][-+]?\d+)?/.exec(str);return m&&Number.isFinite(+m[0])?+m[0]:null;
}
export function checkMetric(value,criterion,regulations=[]) {
  const num=parseNumeric(value),limit=parseNumeric(criterion?.limit);
  const reg=regulations.find(r=>r.id===criterion?.regulationId&&r.selected&&r.status==='current'&&r.review==='confirmed');
  if(num===null)return {status:'unknown',text:'未提供可解析结果'};
  if(!criterion?.confirmed||!reg||!criterion.clause||!criterion.scope||limit===null)return {status:'unknown',text:'适用条文、工况或限值待确认'};
  const ops={'<=':(a,b)=>a<=b,'>=':(a,b)=>a>=b,'<':(a,b)=>a<b,'>':(a,b)=>a>b};
  if(!ops[criterion.operator])return {status:'unknown',text:'比较方式待确认'};
  const pass=ops[criterion.operator](num,limit);return {status:pass?'pass':'fail',text:pass?'数值比较通过，待专业复核':'数值比较不通过'};
}
export function signalEvidence(text) {
  const groups={transfer:/转换梁|梁托柱|梁抬柱|转换柱|抽柱/,joint:/抗震缝|结构缝/,opening:/大洞口|楼板大开洞/,isolation:/隔震/};const out={};
  for(const [id,re] of Object.entries(groups)) {
    const hits=String(text).split(/[。；;\n，,]/).filter(x=>re.test(x)).map(x=>({text:x.trim(),status:/(?:无|不设|没有|不采用|未设置|未发现|无需)/.test(x)?'absent':/(?:建议|拟|待定|可能|参考|历史|相邻|不排除|尚未|未确定)/.test(x)?'pending':'candidate'}));
    out[id]=hits;
  }return out;
}
export function relevantFacts(s,id) {
  const prefix={overview:/^(bldg|site|arch)/,ground:/^geo/,foundation:/^geo.*(?:foundation|water|soil|settlement)/,selection:/^(arch|bldg|site)/,special:/^(arch|geo)/,loads:/^(arch|bldg)/};
  return s.facts.filter(f=>f.status==='confirmed'&&(!prefix[id]||prefix[id].test(f.key)));
}
export function scaffold(s,id) {
  const facts=relevantFacts(s,id);const lines=[];const ids=[];
  const add=(text,evidence)=>{lines.push(text);if(evidence)ids.push(evidence);};
  if(id==='overview'&&s.parametersConfirmed)add('本工程为{{p:project_name}}，建设地点为{{p:region}}。','MEASURES-CONFIRMED');
  if(id==='selection'&&s.parametersConfirmed&&s.parameters.struct_sys)add('统一技术措施确定本单体采用{{p:struct_sys}}。结构布置应结合以下建筑条件展开说明；尚未提供的方案比选和布置决定保留待核。','MEASURES-CONFIRMED');
  if(id==='criteria'&&s.parametersConfirmed)for(const k of ['seismic_cat','intensity','pga','eq_group','site_class','tg','safety_grade','found_grade'])if(s.parameters[k])add(`${({seismic_cat:'设防类别',intensity:'设防烈度',pga:'地震加速度',eq_group:'地震分组',site_class:'场地类别',tg:'特征周期',safety_grade:'安全等级',found_grade:'基础设计等级'})[k]}：{{p:${k}}}。`,'MEASURES-CONFIRMED');
  if(id==='loads'&&s.parametersConfirmed)for(const k of ['wind','snow'])if(s.parameters[k])add(`${k==='wind'?'基本风压':'基本雪压'}：{{p:${k}}}。`,'MEASURES-CONFIRMED');
  if(id==='basis')for(const r of s.regulations.filter(r=>r.selected&&r.review==='confirmed'&&r.status==='current'))add('{{r:'+r.id+'}}。',r.source_id);
  if(['overview','ground','foundation','selection','special','loads'].includes(id))for(const f of facts.slice(0,8))add(`${f.label}${f.statement==='作者观点'?'（资料建议）':''}：{{f:${f.id}}}。`,f.source_id);
  if(id==='model'&&s.model?.confirmed) {
    add('以下为本次确认的模型输出摘录，具体工况与楼层见结果表；数值比较与设计判断分开复核。');
    for(const [k,label] of Object.entries({mass:'总质量',T1:'第一振型周期',T2:'第二振型周期',T3:'第三振型周期',drift_env_x:'X向地震位移角包络',drift_env_y:'Y向地震位移角包络',ratio_tt:'周期比'}))if(s.model.metrics[k])add(`${label}：{{m:${k}}}。`,s.model.sourceIds[0]);
  }
  if(id==='review')add('当前资料、适用规范及生成正文仍需专业负责人复核；未完成事项见工作台校核清单。');
  if(!lines.length)add('本节所需资料尚未确认，暂不生成确定性结论。');
  return {text:lines.join('\n\n'),evidence_ids:[...new Set(ids)],warnings:['这是依据骨架，可直接编辑或调用 DeepSeek 组织成文。'],kind:'scaffold'};
}
export function issues(s) {
  const out=[];if(!s.parametersConfirmed)out.push('统一技术措施尚未确认用于本稿。');
  for(const [slot,label] of [['bldg','建筑'],['geo','地勘']])if(!s.facts.some(f=>f.slot===slot&&f.status==='confirmed'))out.push(label+'资料尚无已确认事实。');
  if(!s.model?.confirmed)out.push('当前单体模型批次尚未确认。');
  if(s.facts.some(f=>f.status==='candidate'))out.push('存在未确认的资料候选项。');
  if(s.regulations.some(r=>r.selected&&(r.status!=='current'||r.review!=='confirmed')))out.push('项目规范清单存在待核或非现行条目。');
  if(!s.regulations.some(r=>r.selected&&r.status==='current'&&r.review==='confirmed'))out.push('尚未确认本项目设计依据清单。');
  if(Object.values(s.sections).some(x=>x.stale))out.push('部分正文所用依据已变更，需要复核。');
  if(s.model?.confirmed&&s.model.warnings?.length)out.push(...s.model.warnings);
  if(!SECTIONS.every(sec=>s.sections[sec.id]?.text||s.sections[sec.id]?.hidden))out.push('部分章节尚未编写。');
  for(const sec of Object.values(s.sections)){if(sec.hidden)continue;const v=validateDraft(sec,s);out.push(...v.errors);}
  for(const [key,items] of Object.entries(Object.groupBy(s.facts.filter(f=>f.status==='confirmed'&&!/excerpt/.test(f.key)),f=>(f.unit||'项目整体')+' / '+f.key)))if(new Set(items.map(f=>textValue(f.value))).size>1)out.push('资料取值冲突：'+(LABELS[key]||key)+'，请撤销不采用项的确认状态并记录理由。');
  return [...new Set(out)];
}
export const METRIC_LABELS={mass:'总质量（t）',T1:'第一振型周期（s）',T2:'第二振型周期（s）',T3:'第三振型周期（s）',ratio_tt:'扭转/平动周期比',mass_coef_x:'X向质量参与系数（%）',mass_coef_y:'Y向质量参与系数（%）',drift_env_x:'X向地震位移角包络',drift_env_y:'Y向地震位移角包络',drift_wind_x:'X向风位移角',drift_wind_y:'Y向风位移角',stiff_x:'X向侧向刚度比',stiff_y:'Y向侧向刚度比',vcap_x:'X向受剪承载力比',vcap_y:'Y向受剪承载力比',gravity_ratio_x:'X向刚重比',gravity_ratio_y:'Y向刚重比'};
export function reportTables(s,id){
  if(id==='overview'&&s.document?.units?.length)return [{title:'建筑规模与主要功能',headers:['单体','建筑面积（㎡）','层数','规划高度（m）','消防高度（m）','主要功能'],rows:s.document.units.map(u=>[u.name,u.area+(u.belowArea?'（含地下'+u.belowArea+'）':''),u.floors||'—',u.planningHeight||'—',u.fireHeight||'—',u.use||'—'])}];
  if(id==='loads')return Object.entries(s.templateTables||TEMPLATE_TABLES).map(([key,rows])=>({title:({floor:'楼面均布活荷载',roof:'屋面均布活荷载',equipment:'机电设备楼屋面均布活荷载'})[key]||'',headers:rows[0],rows:rows.slice(1)}));
  if(id==='model'&&s.model?.confirmed)return [{headers:['计算项目','结果','适用判据与判断'],rows:Object.entries(METRIC_LABELS).map(([key,label])=>{const c=s.criteria.find(x=>x.key===key);return [label,textValue(s.model.metrics[key]??'未提取'),(c?`${c.operator} ${c.limit}；${c.clause}；${c.scope}。`:'')+checkMetric(s.model.metrics[key],c,s.regulations).text];})}];
  if(id==='basis')return ['national','local'].map(kind=>({title:kind==='local'?'表2.2 地方设计标准与规范':'表2.1 国家设计标准与规范',headers:['规范、规程和图集名称','编号'],rows:selectedRegulations(s,kind).map(r=>[r.title+(r.review==='confirmed'&&r.status==='current'?'':'（待核）'),[r.code,r.version&&!(r.code||'').includes(r.version)?'（'+r.version+'）':''].filter(Boolean).join('')])}));
  return [];
}
export function modelBatch(files) {
  const kinds=new Set(),warnings=[];
  for(const f of files){let k=/WMASS/i.test(f.name)?'WMASS':/WZQ/i.test(f.name)?'WZQ':/WDISP/i.test(f.name)?'WDISP':/结构总质量|恒载总质量/.test(f.text)?'WMASS':/振型|自振周期/.test(f.text)?'WZQ':/层间位移角|工况/.test(f.text)?'WDISP':'';
    if(!k)warnings.push('未识别文件格式：'+f.name);else if(kinds.has(k))warnings.push('同一批次存在重复类型：'+k);else kinds.add(k);
  }for(const k of ['WMASS','WZQ','WDISP'])if(!kinds.has(k))warnings.push('本批次缺少'+k+'，相关结果待补充');
  return {kinds:[...kinds],warnings,valid:!warnings.some(x=>/重复|未识别/.test(x))};
}
