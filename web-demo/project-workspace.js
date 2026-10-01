import {projectPart,projectRequest,newProjectId,clone} from './project-store-client.js';

const legacy=window.WorkbenchLegacy;
const modules=new Map();
let id='',part,mode='blank',loading=true,timer,parameters={},parameterVersion=0,changes=[],busy=false;
const bar=document.createElement('section');
bar.className='wp-bar';
const barStyle=document.createElement('style');barStyle.textContent='.wp-bar button,.wp-bar input,.wp-bar select{font:inherit;padding:6px 9px;border:1px solid #b8c8d1;border-radius:5px;background:white;color:#263e50}.wp-bar button{cursor:pointer}.wp-bar select{max-width:320px}.wp-bar [role=status]{font-size:12px}.wp-bar #wp-changes{max-height:230px;overflow:auto}@media print{.wp-bar{display:none!important}}';document.head.append(barStyle);
bar.style.cssText='margin:12px 24px;padding:14px 18px;background:#eef3f6;border:1px solid #b8c8d1;border-radius:10px;color:#263e50;font-size:13px';
bar.innerHTML='<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b>当前项目</b><select id="wp-project" aria-label="切换项目"></select><span id="wp-mode"></span><input id="wp-name" placeholder="新项目名称" aria-label="新项目名称"><button id="wp-new">新建空白项目</button><button id="wp-sample">载入示例副本</button><button id="wp-save">保存全部</button><button id="wp-backup">下载项目备份</button><button id="wp-reload">载入最新保存</button><span id="wp-status" role="status">正在载入…</span></div><details style="margin-top:8px"><summary>参数变更与联动复核 <span id="wp-count"></span></summary><div id="wp-changes"></div></details>';
document.body.prepend(bar);
const q=s=>bar.querySelector(s);
const status=s=>q('#wp-status').textContent=s;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render(){q('#wp-mode').textContent=mode==='sample'?'示例项目 · 不作为实际工程依据':'独立项目';q('#wp-count').textContent=changes.length?'（'+changes.length+' 条）':'';q('#wp-changes').innerHTML=changes.length?'<p>蓝色引用字段自动更新。人工正文、图片、Excel 和已脱离联动的内容保留原稿，需重新核对。</p>'+changes.slice(-30).reverse().map(c=>'<p>'+esc(c.at)+' · '+esc(c.label)+'：'+esc(c.before||'空')+' → '+esc(c.after||'空')+'<br><small>影响：统一措施、扩初说明、PPT、反校核、计算书 · 参数版本 '+c.version+'</small></p>').join(''):'尚无参数变更。';}
async function list(){const {projects}=await projectRequest('/');q('#wp-project').innerHTML=projects.map(p=>'<option value="'+p.id+'">'+esc(p.name)+(p.mode==='sample'?'（示例）':'')+'</option>').join('');q('#wp-project').value=id;}
function capture(){return {...legacy.capture(),mode,parameterVersion,changes,calculation:window.CalculationBook?.capture()};}
function scheduleSave(){if(loading||!part)return;status('有修改 · 等待保存');clearTimeout(timer);timer=setTimeout(()=>save().catch(()=>{}),700);}
async function save(){clearTimeout(timer);if(loading||!part)return;await part.save(capture());}
async function flush(){if([...modules.values()].some(m=>m.busy?.())||window.CalculationBook?.busy?.())throw Error('正在生成或导入，请完成后再切换项目。');await save();for(const m of modules.values())await m.save();}
async function load(next,{data=null,remoteOnly=false}={}){loading=true;clearTimeout(timer);try{const nextPart=projectPart(next,'main',status);const value=data||await nextPart.load({remoteOnly});if(!value)throw Error('未找到该项目，请从列表选择或新建');id=next;part=nextPart;mode=value.mode||'blank';parameterVersion=value.parameterVersion||0;changes=value.changes||[];legacy.apply(value);await window.CalculationBook?.loadProject(value.calculation,mode);parameters=clone(legacy.params());for(const m of modules.values())await m.load({remoteOnly});sessionStorage.setItem('wb:active-project',id);localStorage.setItem('wb:last-project',id);const url=new URL(location.href);url.searchParams.set('project',id);history.replaceState(null,'',url);render();}finally{loading=false;}legacy.publish();if(data)await save();else status(part.blocked?'恢复稿有版本冲突，请先下载备份':'已载入项目 · 修订 '+part.revision);await list();}
async function create(sample=false){await flush();const data=sample?await legacy.sample():legacy.blank(q('#wp-name').value.trim()||'未命名项目');await load(newProjectId(),{data});q('#wp-name').value='';}
function contentChanged(label='统一措施正文变更'){if(loading)return;parameterVersion++;changes.push({at:new Date().toLocaleString('zh-CN'),label,before:'原稿',after:'待复核',version:parameterVersion});legacy.invalidate();render();legacy.publish();scheduleSave();}
async function download(){let archive;try{archive=await projectRequest('/'+id);}catch{archive={note:'项目库未连接，仅备份本页恢复稿'};}const data={schema:1,projectId:id,archive,main:capture(),modules:Object.fromEntries([...modules].map(([k,m])=>[k,m.capture()]))};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.download=(parameters.project_name||'项目')+'_恢复备份.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);}
async function action(fn){if(busy)return;busy=true;bar.querySelectorAll('button,select').forEach(e=>e.disabled=true);try{await fn();}catch(e){status(e.message);}finally{busy=false;bar.querySelectorAll('button,select').forEach(e=>e.disabled=false);q('#wp-project').value=id;}}
window.WorkbenchProjects={get id(){return id},get loading(){return loading},get parameterVersion(){return parameterVersion},get mode(){return mode},scheduleSave,contentChanged,flush,
 register(name,module){modules.set(name,module)},markReviewed(){scheduleSave()},
};
window.addEventListener('workbuddy:measures-changed',event=>{if(loading)return;const current=event.detail?.params||legacy.params();const keys=Object.keys({...parameters,...current}).filter(k=>String(parameters[k]??'')!==String(current[k]??''));if(keys.length){parameterVersion++;for(const k of keys)changes.push({at:new Date().toLocaleString('zh-CN'),label:document.querySelector('[data-k="'+k+'"]')?.closest('.fld')?.querySelector('label')?.textContent||k,before:parameters[k],after:current[k],version:parameterVersion});parameters=clone(current);legacy.invalidate(keys);render();scheduleSave();}if(event.detail){event.detail.project_id=id;event.detail.parameter_version=parameterVersion;}});
document.addEventListener('input',e=>{if(e.target.closest('#paper1'))contentChanged('统一措施人工内容变更');else if(!bar.contains(e.target))scheduleSave();});
document.addEventListener('change',e=>{if(!bar.contains(e.target))scheduleSave();});
document.addEventListener('click',e=>{if(!bar.contains(e.target))setTimeout(scheduleSave,0);});
q('#wp-project').onchange=e=>action(async()=>{await flush();await load(e.target.value);});
q('#wp-new').onclick=()=>action(()=>create());q('#wp-sample').onclick=()=>action(()=>create(true));q('#wp-save').onclick=()=>action(async()=>{await flush();await list();});q('#wp-backup').onclick=()=>action(download);
q('#wp-reload').onclick=()=>action(async()=>{await download();await load(id,{remoteOnly:true});status('已下载当前恢复备份，并载入最新保存。');});
window.addEventListener('beforeunload',()=>{save().catch(()=>{});for(const m of modules.values())m.save().catch(()=>{});});
// Initial setup keeps previous browser drafts untouched and never auto-loads sample facts.
await window.CalculationBook?.ready;
try{const active=new URL(location.href).searchParams.get('project')||sessionStorage.getItem('wb:active-project')||localStorage.getItem('wb:last-project');if(active&&/^[a-f0-9]{32}$/.test(active))await load(active);else await load(newProjectId(),{data:legacy.blank('未命名项目')});}catch(e){status('项目载入失败：'+e.message);loading=true;}
