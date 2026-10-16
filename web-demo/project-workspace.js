import {openInitialProject} from './project-startup.js';
import {projectPart,projectRequest,newProjectId,clone} from './project-store-client.js';

const legacy=window.WorkbenchLegacy;
const modules=new Map();
let id='',part,mode='blank',loading=true,timer,parameters={},parameterVersion=0,changes=[],busy=false,exportHistory=[],exporting=false;
const bar=document.createElement('section');
bar.className='wp-bar';
const barStyle=document.createElement('style');barStyle.textContent='.wp-bar button,.wp-bar input,.wp-bar select{font:inherit;padding:6px 9px;border:1px solid #b8c8d1;border-radius:5px;background:white;color:#263e50}.wp-bar button{cursor:pointer}.wp-bar select{max-width:320px}.wp-bar [role=status]{font-size:12px}.wp-bar #wp-changes{max-height:230px;overflow:auto}@media print{.wp-bar{display:none!important}}';document.head.append(barStyle);
bar.style.cssText='margin:12px 24px;padding:14px 18px;background:#eef3f6;border:1px solid #b8c8d1;border-radius:10px;color:#263e50;font-size:13px';
bar.innerHTML='<div class="wp-primary"><b>当前项目</b><select id="wp-project" aria-label="切换项目"></select><span id="wp-status" role="status">正在载入…</span><button id="wp-intake">导入资料</button><button id="wp-export">导出</button><details class="wp-management"><summary>项目管理</summary><div><span id="wp-mode"></span><input id="wp-name" placeholder="新项目名称" aria-label="新项目名称"><button id="wp-new">新建空白项目</button><button id="wp-sample">载入示例副本</button><button id="wp-save">保存全部</button><button id="wp-delete">删除当前项目</button><button id="wp-restore" hidden>恢复刚删除项目</button><button id="wp-backup">下载项目备份</button><button id="wp-reload">载入最新保存</button></div></details><button id="wp-retry" hidden>重试保存</button></div><details style="margin-top:8px"><summary>参数变更与联动复核 <span id="wp-count"></span></summary><div id="wp-changes"></div></details>';

document.body.prepend(bar);
const q=s=>bar.querySelector(s);
bar.querySelectorAll('button,select,input').forEach(e=>e.disabled=true);
const status=s=>{q('#wp-status').textContent=s;q('#wp-retry').hidden=!/失败|未保存|未连接|载入未完成/.test(s);q('#wp-retry').textContent=loading||!modules.has('workflow')?'重试载入':'重试保存';if(!q('#wp-retry').hidden&&!busy)q('#wp-retry').disabled=false;};
const startupReadyTimer=setTimeout(()=>{if(!modules.has('workflow'))status('资料模块载入未完成，请点击重试载入。');},20000);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render(){q('#wp-mode').textContent=mode==='sample'?'示例项目 · 不作为实际工程依据':'独立项目';q('#wp-count').textContent=changes.length?'（'+changes.length+' 条）':'';q('#wp-changes').innerHTML=changes.length?'<p>蓝色引用字段自动更新。人工正文、图片、Excel 和已脱离联动的内容保留原稿，需重新核对。</p>'+changes.slice(-30).reverse().map(c=>'<p>'+esc(c.at)+' · '+esc(c.label)+'：'+esc(c.before||'空')+' → '+esc(c.after||'空')+'<br><small>影响：统一措施、扩初说明、PPT、反校核、计算书 · 参数版本 '+c.version+'</small></p>').join(''):'尚无参数变更。';}
async function list(projects=null){q('#wp-restore').hidden=!localStorage.getItem('wb:last-deleted-project');if(!projects)({projects}=await projectRequest('/'));q('#wp-project').innerHTML=projects.map(p=>'<option value="'+p.id+'">'+esc(p.name)+(p.mode==='sample'?'（示例）':'')+'</option>').join('');q('#wp-project').value=id;}
function capture(){return {...legacy.capture(),mode,parameterVersion,changes,exportHistory,calculation:window.CalculationBook?.capture()};}
function scheduleSave(){if(loading||!part)return;status('有修改 · 等待保存');clearTimeout(timer);timer=setTimeout(()=>save().catch(()=>{}),700);}
async function save(){clearTimeout(timer);if(loading||!part)return;await part.save(capture());}
async function flush(exclude=null,{preserveConflicts=false}={}){if(loading)throw Error('项目载入尚未完成，请重试载入');if(exporting)throw Error('正在导出，请完成后再切换项目。');if([...modules.entries()].some(([name,m])=>name!==exclude&&m.busy?.())||window.CalculationBook?.busy?.())throw Error('正在生成或导入，请完成后再切换项目。');let conflict=false;for(const persist of [save,...[...modules.values()].map(m=>()=>m.save()),save]){try{await persist();}catch(e){if(!preserveConflicts||e.status!==409)throw e;conflict=true;}}return conflict;}
async function load(next,{data=null,remoteOnly=false,projects=null}={}){
 loading=true;document.querySelector('main').inert=true;clearTimeout(timer);progress('正在载入项目…');
 try{
  const nextPart=projectPart(next,'main',text=>{if(id===next&&!busy)status(text);});
  const value=data||await nextPart.load({remoteOnly});if(!value){const error=Error('未找到该项目，请从列表选择或新建');error.status=404;throw error;}
  id=next;part=nextPart;mode=value.mode||'blank';parameterVersion=value.parameterVersion||0;changes=value.changes||[];exportHistory=value.exportHistory||[];
  legacy.apply(value);await window.CalculationBook?.loadProject(value.calculation,mode);parameters=clone(legacy.params());
  // Apply intake before expansion, then dependent modules. New IDs have no remote partitions.
  for(const [name,m] of modules){progress('正在载入'+({intake:'资料',expansion:'扩初说明',modules:'专项模块',workflow:'项目操作'}[name]||'项目内容')+'…');await m.load({remoteOnly,fresh:!!data});}
  sessionStorage.setItem('wb:active-project',id);localStorage.setItem('wb:last-project',id);const url=new URL(location.href);url.searchParams.set('project',id);history.replaceState(null,'',url);render();loading=false;document.querySelector('main').inert=busy;
  window.dispatchEvent(new CustomEvent('workbuddy:project-changed',{detail:{projectId:id}}));
 }catch(e){loading=true;throw e;}
 legacy.publish();
 if(data){progress('正在保存新项目…');await save();q('#wp-project').add(new Option((parameters.project_name||'未命名项目')+(mode==='sample'?'（示例）':''),id));q('#wp-project').value=id;q('#wp-restore').hidden=!localStorage.getItem('wb:last-deleted-project');}
 else{if(projects||![...q('#wp-project').options].some(p=>p.value===id))await list(projects);else{const option=[...q('#wp-project').options].find(p=>p.value===id);option.textContent=(parameters.project_name||'未命名项目')+(mode==='sample'?'（示例）':'');q('#wp-project').value=id;}status(part.blocked?'恢复稿有版本冲突，请先下载备份':'已载入项目 · 修订 '+part.revision);}
}
async function create(sample=false){
 progress('正在保存当前项目…');
 const backedUp=await flush(null,{preserveConflicts:true});
 if(backedUp){progress('正在备份冲突稿…');await download();}
 progress(sample?'正在读取示例资料…':'正在建立空白项目…');
 const data=sample?await legacy.sample():legacy.blank(q('#wp-name').value.trim()||'未命名项目');
 await load(newProjectId(),{data});q('#wp-name').value='';
 if(backedUp)status('新项目已创建 · 旧项目冲突稿已下载备份，原保存版本保留');
 else status(sample?'示例副本已载入':'空白项目已创建');
}
async function removeCurrent(){
 if(!confirm('删除当前项目？项目资料和历史版本仍保留，可通过“恢复刚删除项目”撤销。')){status('已取消删除');return;}
 operationStarted=Date.now();
 // Soft deletion retains every server revision. Persist edits first; a failed or
 // conflicting save must leave this project open instead of discarding its draft.
 progress('正在保存当前修改…');await flush();
 progress('正在删除项目…');
 const removed=id,lifecycle=projectPart(removed,'lifecycle');await lifecycle.load();
 await lifecycle.save({deleted:true,deletedAt:new Date().toISOString()});
 localStorage.setItem('wb:last-deleted-project',removed);
 const {projects}=await projectRequest('/');
 if(projects.length)await load(projects[0].id,{projects});
 else{q('#wp-project').replaceChildren();await load(newProjectId(),{data:legacy.blank('未命名项目')});}
 status('项目已删除，资料与历史版本保留，可恢复刚删除项目');
}
async function restoreRemoved(){
 const removed=localStorage.getItem('wb:last-deleted-project');if(!removed)return;
 const lifecycle=projectPart(removed,'lifecycle');await lifecycle.load();await lifecycle.save({deleted:false});
 localStorage.removeItem('wb:last-deleted-project');await list();status('项目已恢复，可从项目列表选择');
}
function contentChanged(label='统一措施正文变更'){if(loading)return;parameterVersion++;changes.push({at:new Date().toLocaleString('zh-CN'),label,before:'原稿',after:'待复核',version:parameterVersion});legacy.invalidate();render();legacy.publish();scheduleSave();}
async function download(){let archive;try{archive=await projectRequest('/'+id);}catch{archive={note:'项目库未连接，仅备份本页恢复稿'};}const browserRecovery={};for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith('wb:recovery:v1:'+id+':')){const cached=JSON.parse(localStorage.getItem(key));if(cached?.dirty||!archive.records)browserRecovery[key]=cached;}}const data={schema:1,projectId:id,archive,browserRecovery,main:capture(),modules:Object.fromEntries([...modules].map(([k,m])=>[k,m.capture()]))};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));a.download=(parameters.project_name||'项目')+'_恢复备份.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);}
let operation='',operationStarted=0;
function progress(text){operation=text;status(text);}
async function action(fn,button=null){
 if(!modules.has('workflow')){status('资料模块正在载入，请稍候');return;}
 if(busy)return;busy=true;operationStarted=Date.now();const label=button?.textContent;
 progress(label?label+'…':'正在处理项目…');document.querySelector('main').inert=true;bar.setAttribute('aria-busy','true');bar.querySelectorAll('button,select,input').forEach(e=>e.disabled=true);
 if(button)button.textContent=label+'…';
 const ticking=setInterval(()=>{if(operation)status(operation+' '+Math.floor((Date.now()-operationStarted)/1000)+'秒');},1000);
 try{await new Promise(resolve=>setTimeout(resolve,0));await fn();}
 catch(e){status((loading?'项目载入失败：':'操作失败：')+e.message);}
 finally{clearInterval(ticking);operation='';busy=false;bar.removeAttribute('aria-busy');bar.querySelectorAll('button,select,input').forEach(e=>e.disabled=false);if(button)button.textContent=label;q('#wp-project').value=id;document.querySelector('main').inert=loading;}
}
window.WorkbenchProjects={get id(){return id},get loading(){return loading},get parameterVersion(){return parameterVersion},get mode(){return mode},get exporting(){return exporting},setExporting(v){exporting=v;},async recordExport(record){const name='export-'+newProjectId();await projectPart(id,name).save(record);const {html,template,...metadata}=record;exportHistory.push({...metadata,part:name});await save();},scheduleSave,contentChanged,flush,
 register(name,module){modules.set(name,module);if(name==='workflow'){clearTimeout(startupReadyTimer);if(!busy)bar.querySelectorAll('button,select,input').forEach(e=>e.disabled=false);}},markReviewed(){scheduleSave()},
};
window.addEventListener('workbuddy:measures-changed',event=>{if(loading)return;const current=event.detail?.params||legacy.params();const keys=Object.keys({...parameters,...current}).filter(k=>String(parameters[k]??'')!==String(current[k]??''));if(keys.length){parameterVersion++;for(const k of keys)changes.push({at:new Date().toLocaleString('zh-CN'),label:document.querySelector('[data-k="'+k+'"]')?.closest('.fld')?.querySelector('label')?.textContent||k,before:parameters[k],after:current[k],version:parameterVersion});parameters=clone(current);legacy.invalidate(keys);render();scheduleSave();}if(event.detail){event.detail.project_id=id;event.detail.parameter_version=parameterVersion;}});
document.addEventListener('input',e=>{if(e.target.closest('#paper1'))contentChanged('统一措施人工内容变更');else if(e.target.matches('[data-k],#spec-ta,#steel-ta'))scheduleSave();});
document.addEventListener('change',e=>{if(e.target.matches('[data-k],#pstage-sel'))scheduleSave();});
// Navigation and disclosure clicks are not data mutations.
q('#wp-project').onchange=e=>action(async()=>{await flush();await load(e.target.value);});
q('#wp-retry').onclick=()=>{if(!modules.has('workflow')){location.reload();return;}return action(async()=>{if(loading){await load(id||new URL(location.href).searchParams.get('project'));}else{await flush();status('项目已保存');}});};
q('#wp-intake').onclick=()=>window.WorkbenchFlow?.open();q('#wp-export').onclick=()=>window.WorkbenchFlow?.export();
q('#wp-delete').onclick=e=>action(removeCurrent,e.currentTarget);q('#wp-restore').onclick=e=>action(restoreRemoved,e.currentTarget);
q('#wp-new').onclick=e=>action(()=>create(),e.currentTarget);q('#wp-sample').onclick=e=>action(()=>create(true),e.currentTarget);q('#wp-save').onclick=e=>action(async()=>{progress('正在保存项目…');await flush();await list();status('项目已保存');},e.currentTarget);q('#wp-backup').onclick=e=>action(async()=>{await download();status('项目备份已下载');},e.currentTarget);
q('#wp-reload').onclick=()=>action(async()=>{await download();await load(id,{remoteOnly:true});status('已下载当前恢复备份，并载入最新保存。');});
window.addEventListener('beforeunload',()=>{save().catch(()=>{});for(const m of modules.values())m.save().catch(()=>{});});
// Initial setup keeps previous browser drafts untouched and never auto-loads sample facts.
await window.CalculationBook?.ready;
try{const active=new URL(location.href).searchParams.get('project')||sessionStorage.getItem('wb:active-project')||localStorage.getItem('wb:last-project');await openInitialProject(active,{load,list:()=>projectRequest('/'),create:()=>load(newProjectId(),{data:legacy.blank('未命名项目')})});}catch(e){status('项目载入失败：'+e.message);loading=true;}
