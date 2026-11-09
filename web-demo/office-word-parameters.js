import {combinedParameters, FIELD_LABELS} from './intake-core.js';
import {LABELS} from './expansion-core.js';

const labels={...LABELS,...FIELD_LABELS,project_name:'项目名称',project_code:'项目编号',designer:'设计单位',software:'计算软件与版本',pile:'建筑桩基设计等级',pile_safety:'桩基结构安全等级',pile_gamma:'桩基重要性系数',gamma0_found:'基础结构重要性系数'};
export function parameterItems(parameters={}) {
 return Object.entries(parameters).filter(([,v])=>['string','number','boolean'].includes(typeof v)&&String(v).trim()!=='').map(([key,value])=>({key,label:labels[key]||key,value:String(value).trim()}));
}
export function filterParameters(items,query='') {
 const words=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
 return items.filter(item=>words.every(word=>[item.label,item.key,item.value].join(' ').toLocaleLowerCase().includes(word)));
}
export async function documentParameters(metadata,{fetcher=fetch,parentWindow=globalThis.window?.parent}={}) {
 const {projectId,unit}=metadata;
 if(!/^[a-f0-9]{32}$/.test(projectId||'')||!unit)throw Error('文档缺少所属项目或单体');
 // A document keeps its own identity even when the containing workbench switches units.
 if(parentWindow&&parentWindow!==globalThis.window&&parentWindow.WorkbenchProjects?.id===projectId&&parentWindow.WorkbenchIntake)
  return parameterItems(parentWindow.WorkbenchIntake.parameters(unit));
 const get=async part=>{const response=await fetcher('/api/workbench-projects/'+projectId+'/'+part,{cache:'no-store'});if(!response.ok)throw Error('项目参数读取失败');return (await response.json()).record?.data;};
 const [main,intake]=await Promise.all([get('main'),get('intake')]);
 if(!main)throw Error('文档所属项目不存在');
 return parameterItems(intake?combinedParameters(intake,unit,main.parameters||{}):main.parameters||{});
}

export async function showWordParameters(body,{metadata,run,onError}) {
 body.innerHTML='<label>筛选参数<input id="word-parameter-filter" type="search" placeholder="名称、编号或取值"></label><div id="word-parameter-list" role="listbox" aria-label="项目参数"></div><button id="word-parameter-insert" disabled>插入所选参数</button><p id="word-parameter-state" role="status">正在读取…</p>';
 const filter=body.querySelector('input'),list=body.querySelector('[role=listbox]'),insert=body.querySelector('#word-parameter-insert'),status=body.querySelector('[role=status]');
 const items=await documentParameters(metadata);if(!body.isConnected)return;
 let selected=null;
 function render(){const matches=filterParameters(items,filter.value);selected=null;insert.disabled=true;list.replaceChildren();for(const item of matches){const button=document.createElement('button');button.type='button';button.role='option';button.setAttribute('aria-selected','false');button.textContent=item.label+'：'+item.value;button.onmousedown=e=>e.preventDefault();button.onclick=()=>{selected=item;insert.disabled=false;list.querySelectorAll('button').forEach(b=>b.setAttribute('aria-selected',String(b===button)));};list.append(button);}status.textContent=matches.length?`${matches.length} 项参数 · ${metadata.unit}`:'没有匹配参数';}
 filter.oninput=render;
 insert.onmousedown=e=>e.preventDefault();insert.onclick=async()=>{if(!selected)return;const item=selected;insert.disabled=true;try{await run({name:'text.insert',args:{text:item.value}});status.textContent='已插入 '+item.label;}catch(error){onError(error);}finally{insert.disabled=!selected;}};
 render();filter.focus();
}
