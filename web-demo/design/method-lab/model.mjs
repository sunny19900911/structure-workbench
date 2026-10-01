export const SOURCE = 'AI-METHOD-LAB-20260930';
export const methods = [
 {id:'expansion',name:'扩初说明',icon:'FileText',module:'② 扩初说明',summary:'把项目条件、设计判断和计算证据组织成可审查的叙述；先确认事实，再组织表达。',input:'已确认的统一参数、建筑提资、地勘来源、经复核的计算结果。',boundary:'只复用编排方法；抗震专项、超限等适用条件由负责人另行判断。',output:'章节清单、来源索引、待补问题和说明草稿。',gate:'参数版本一致；引用可定位；历史结果标识清楚；缺项不编造。',example:'例如：我会先锁定结构体系与基础方案的依据，再写选型理由；资料冲突时先列问题，不靠改文字掩盖。'},
 {id:'measures',name:'统一技术措施',icon:'Layers',module:'① 统一技术措施',summary:'一次确认公共参数，用版本快照服务全套成果，减少反复粘贴和口径漂移。',input:'建筑与地勘条件、有效规范来源、负责人确认记录。',boundary:'外部项目措施仅为参考模板，不能直接带入当前项目数值。',output:'统一参数快照、适用条件开关、变更影响清单。',gate:'每个取值有来源；冲突保留；人工确认后才允许下游采用。',example:'例如：荷载变更要记录原因、范围和下游影响，不只改技术措施中的一张表。'},
 {id:'ppt',name:'汇报 PPT',icon:'Presentation',module:'② 扩初说明 → PPT 专项',summary:'从经确认的参数和设计判断中，编排“问题—方案—证据—结论”的汇报。',input:'统一参数版本、审查重点、获准使用的图纸与结果图片。',boundary:'PPT 单向读取参数；图表缺少来源时保留待补槽位。',output:'汇报提纲、逐页要点、图文对应清单。',gate:'页内数字与文档一致；结论有证据；图片版本可追踪。',example:'例如：先列院内审查最关心的三个问题，每页只回答其中一个，再放支持这一判断的图。'},
 {id:'codes',name:'规范查询',icon:'BookOpen',module:'③ 整理地方规范',summary:'把“搜到一段话”变成“有适用条件、有有效性记录、有人工确认的依据”。',input:'项目地点、阶段、结构特征、候选文件与正式来源。',boundary:'搜索摘要、AI 回答和旧项目引用都不能自动升级为正式依据。',output:'候选条文、版本与适用范围、冲突问题单。',gate:'核对正式文本和现行状态；冲突并列保留，交负责人处理。',example:'例如：每次引用同时记录文件版本、条款位置和适用条件，不能只复制一句结论。'},
 {id:'notes',name:'施工图总说明',icon:'ClipboardList',module:'⑦ 施工图结构总说明',summary:'从公共母版筛选适用条款，把保留、删减和人工覆盖变成可审查的决定。',input:'603 参数快照、604 母版版本、项目特征与审签记录。',boundary:'隐藏条款不删除原始内容；建议删减须由人确认。',output:'可见条款集、连续编号、差异记录和 Word 草稿。',gate:'参数与条款适用条件一致；输出与网页消费同一可见集。',example:'例如：先判断条款是否适用，再调整表达和编号；每一项人工覆盖都留下原因。'},
 {id:'calc',name:'结构计算书',icon:'Calculator',module:'现有计算书入口',summary:'把目录、计算输入、结果和复核说明编排成可追溯的计算链。',input:'经复核的模型结果、Excel 计算内容、参数版本与计算依据。',boundary:'不在这里替代工程计算；历史评审结果只作复算对照。',output:'分级目录、计算块清单、引用索引和待复核草稿。',gate:'输入单位、公式来源、结果版本与适用条件逐项复核。',example:'例如：每一计算块保留输入、方法、结果、判断四部分；只有结果截图还不够。'}
];
export const initialEconomics = {people:8,adoption:75,hours:1.5,weeks:8,maintenance:5,onboarding:16,rate:180,ai:800,infra:400,recognition:0,share:0};
export function economics(p) {
 const grossHours=p.people*p.adoption/100*p.hours*p.weeks;
 const maintenanceHours=p.maintenance*p.weeks;
 const netHours=grossHours-maintenanceHours-p.onboarding;
 const netValue=netHours*p.rate-p.ai-p.infra;
 const recognized=Math.max(0,netValue)*p.recognition/100;
 return {grossHours,maintenanceHours,netHours,netValue,recognized,personal:recognized*p.share/100};
}
export function tokenCost(input,output,inputRate,outputRate) {return (input*inputRate+output*outputRate)/1e6;}
export function download(name, data, mime='application/json') {
 const blob=new Blob([typeof data==='string'?data:JSON.stringify(data,null,2)],{type:mime+';charset=utf-8'});
 const url=URL.createObjectURL(blob); const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
