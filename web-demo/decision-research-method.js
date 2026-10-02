import {regionalInputs} from './regional-decision-guide.js';

export const RESEARCH_VERSION='REGION-RESEARCH-20261002-1';
export const RESEARCH_TOPICS={intensity:'设防烈度',grade:'抗震等级',green:'绿色建筑',prefab:'装配式建筑',performance:'性能目标',damping:'消能减震',isolation:'隔震'};
export const RESEARCH_METHOD=[
  '先识别省、市、区县／园区；同名地区不得混用，开发区不能直接当作地震参数分区。',
  '检索顺序：已有官方入口与规范目录 → 国家基本要求 → 省级实施规定 → 市县及园区补充要求 → 项目规划、许可、合同。历史项目只提供检索方法，不能借用数值和结论。',
  '抗震：分别核对场地地震参数、设防分类、结构体系、高度与场地条件、查表范围及例外；隔震上部结构不能直接套常规等级。',
  '绿色与装配式：核对生效日期、过渡期、投资、用途、建设性质、规模和建筑高度。区分基本级与星级、建造比例与装配式建筑评价认定、混凝土与钢结构。',
  '性能目标：国家和地方触发条件独立核对；不得用地方层数面积门槛排除国家要求。分别列出隔震、减震路线、专项审查与当前模型待验事项。',
  '发布不等于持续现行。继续检索修订、替代、废止、复审和过渡安排；保留冲突值，未命中不等于没有要求。',
  '证据优先住建部、标准平台、省市政府和住建部门。摘要和转载只作线索；逐条记录来源、条文、适用范围、日期和原文摘录，原文未读到必须说明。',
  '输出按依据—项目条件—适用性—候选结论—缺项—落实要求组织。不得编造条文、地点烈度、验算结果、审批通过或最终选定方案。'
];
export function researchContext(context){
  const input=regionalInputs(context);
  return {unit:String(context.unit||'项目整体').slice(0,100),input,regulations:(context.regulations||[]).filter(r=>r.selected!==false).slice(0,40).map(r=>({title:r.title,code:r.code,status:r.status,review:r.review,source_id:r.source_id,source_url:r.source_url}))};
}
export function researchQueries(location,province=''){
  const place=String(location).replace(/[^\p{L}\p{N}（）()·\-\s]/gu,'').slice(0,100);
  return [
    {group:'抗震判断',query:`${province} ${place} 抗震设防 分类 等级 专项审查 现行 修订 废止 site:gov.cn`},
    {group:'绿色与装配式',query:`${province} ${place} 绿色建筑 星级 装配式 比例 政府投资 实施 过渡 修订 site:gov.cn`},
    {group:'性能化目标',query:`${province} ${place} 建设工程抗震管理条例 隔震 减震 正常使用 专项审查 现行 site:gov.cn`}
  ];
}
export function researchDraft(report,topic){
  const item=report.items.find(x=>x.topic===topic);if(!item)return null;
  const sources=new Map(report.sources.map(s=>[s.source_id,s]));
  return {conclusion:item.conclusion,scope:report.location+' · '+report.unit,source_title:'DeepSeek地区研判 · 官方依据待负责人复核',source_id:report.id+'-'+topic,ai_research_version:report.methodVersion,locator:item.citations.map(c=>c.locator).join('；'),evidence:[...item.citations.map(c=>{const s=sources.get(c.source_id);return `${s?.title}｜${s?.url}｜${s?.retrievedAt}｜${s?.kind}\n${c.locator}：${c.quote}`;}),'适用性：'+item.conditions.join('；'),'待核：'+[...item.missing,...report.warnings].join('；'),'落实：'+item.checks.join('；')].join('\n\n')};
}
