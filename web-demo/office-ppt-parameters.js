const labels={project_name:'项目名称',project_code:'项目编号',region:'工程地点',struct_sys:'结构体系',intensity:'设防烈度',pga:'地震加速度',eq_group:'地震分组',site_class:'场地类别',tg:'特征周期',wind:'基本风压',snow:'基本雪压',safety_grade:'安全等级',gamma0:'结构重要性系数',found_grade:'地基基础设计等级',anti_float:'抗浮设计等级',water_depth:'地下水位',g_frame:'框架抗震等级',g_wall:'剪力墙抗震等级',fixed_end:'嵌固端',software:'计算软件',design_life:'设计工作年限',damping:'阻尼比',height_m:'结构高度',seismic_height:'抗震计算高度'};
import {combinedParameters,freshIntake} from './intake-core.js';
const overrides=(common,current)=>Object.fromEntries(Object.entries(current).filter(([key,value])=>value!==common[key]));
export function parameterRows(common={},unit={}){
 return Object.entries({...common,...unit}).filter(([,v])=>v!=null&&typeof v!=='object'&&String(v).trim()!=='').map(([key,value])=>({key,label:labels[key]||key,value:String(value).trim(),source:Object.hasOwn(unit,key)?'当前单体':'统一措施'}));
}
export function filterParameters(rows,query){const words=String(query||'').trim().toLowerCase().split(/\s+/).filter(Boolean);return rows.filter(r=>words.every(w=>[r.label,r.key,r.value,r.source].join(' ').toLowerCase().includes(w)));}
export async function loadPptParameters(record,host=window.parent){
 // Only consume the open project's exact unit. Never follow a newly selected project.
 try{const W=host.WorkbenchProjects,E=host.ExpansionWorkbench;if(W?.id===record.projectId&&E?.unit===record.unit){const common=host.WorkbenchLegacy.params();return parameterRows(common,overrides(common,host.WorkbenchIntake.unitParameters(record.unit)));}}catch{}
 const read=async path=>{const r=await fetch('/api/workbench-projects/'+record.projectId+path);if(!r.ok)throw Error('读取项目参数失败');return r.json();};
 const main=await read('/main');
 const intake=await read('/intake'),common=main.record?.data?.parameters||{};
 return parameterRows(common,overrides(common,combinedParameters({...freshIntake(),...intake.record?.data},record.unit,common)));
}
