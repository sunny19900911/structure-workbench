import './integrated-modules.js';
import './workflow-ui.css';
const W=window.WorkbenchProjects,I=window.WorkbenchIntake,E=window.ExpansionWorkbench;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dialog=document.createElement('dialog');dialog.className='flow-dialog';
dialog.innerHTML='<div class="flow-heading"><h2>项目资料</h2><button data-close>关闭</button></div><p>建筑与地勘供本项目共用；模型归入所选单体。上传后自动整理正文。</p><div class="flow-upload"><label>资料类型 <select id="flow-kind"><option value="auto">自动识别（可改）</option><option value="bldg">建筑说明</option><option value="geo">地勘报告</option><option value="yjk">结构模型总信息</option></select></label><label>模型单体 <input id="flow-unit" list="flow-units" aria-label="模型资料所属单体"><datalist id="flow-units"></datalist></label><input type="file" id="flow-files" multiple aria-label="选择项目资料"><span id="flow-replace"></span><button id="flow-cancel-replace" hidden>取消替换</button></div><div id="flow-jobs" role="status"></div><div id="flow-model"></div><button id="flow-result">查看扩初正文</button>';
document.body.append(dialog);
const q=s=>dialog.querySelector(s);let jobs=[],running=false,replacement=null;
const panel=document.querySelector('#intake-panel');dialog.append(panel);
// Remove redundant upload controls and their direct event paths; parser-bound labels remain optional.
panel.querySelector('#intake-files').remove();
const oldModel=document.querySelector('#box-yjk')?.closest('.panel-card');oldModel?.remove();
document.querySelector('.topbar #word-export-btn')?.remove();
for(const button of document.querySelectorAll('.topbar .act'))if(['打印 / 存 PDF','复制全文'].includes(button.textContent.trim()))document.querySelector('.wp-management>div').append(button);
const guide=document.querySelector('.side .flow');if(guide)guide.textContent='导入资料 → 自动生成草稿 → 处理问题 → 导出成果';
const task=document.createElement('span');task.id='flow-task';task.setAttribute('role','status');document.querySelector('.wp-primary').append(task);
function controls(){const disabled=running||W.loading||I.busy||E.busy;dialog.querySelectorAll('.flow-upload input,.flow-upload select,.flow-upload button').forEach(e=>e.disabled=disabled);q('#flow-kind').disabled=disabled||Boolean(replacement);q('#flow-files').multiple=!replacement;q('#flow-files').accept=q('#flow-kind').value==='yjk'?'.out,.txt,.dat':'.doc,.docx,.pdf,.txt,.md,.out,.dat';q('#flow-unit').parentElement.hidden=!['yjk','auto'].includes(q('#flow-kind').value);}
function render(){
 const current=jobs.filter(j=>j.project===W.id);
 q('#flow-jobs').innerHTML=current.map(j=>'<p>'+esc(({bldg:'建筑',geo:'地勘',yjk:'模型'})[j.slot]+' · '+j.name)+' · '+esc(j.status)+(j.error?'：'+esc(j.error)+' <button data-retry="'+j.id+'">仅重试此项</button>':'')+'</p>').join('');
 const model=E.modelContext()?.model;q('#flow-model').innerHTML=model?'<h3>模型 · '+esc(E.unit)+'</h3><p>'+esc(model.files.join('、'))+' <button data-model-replace>替换批次</button> <button data-model-remove>移除批次</button></p>':'';
 q('#flow-unit').value=E.unit;q('#flow-units').innerHTML=I.units.map(n=>'<option value="'+esc(n)+'"></option>').join('');
 q('#flow-replace').textContent=replacement?'正在替换：'+replacement.name:'';q('#flow-cancel-replace').hidden=!replacement;controls();
}
async function run(job){
 if(job.project!==W.id)throw Error('项目已切换，请在原项目重试');
 running=true;job.error='';job.status='读取中';task.textContent='读取中 · '+job.name;render();
 try{
  if(job.slot==='yjk'){if(E.unit!==job.unit)await E.selectUnit(job.unit);await E.importFiles('yjk',job.files);}
  else await I.readFiles(job.slot,job.files,{replaceSource:job.replaceSource});
  job.status='已更新';task.textContent='已更新 · '+job.name;
  await W.flush('workflow');job.status='已更新 · 已保存';replacement=null;
 }catch(e){job.status='失败';job.error=e.message;task.textContent='处理失败 · '+e.message;}
 finally{running=false;render();}
}
q('#flow-files').onchange=async e=>{
 const files=[...e.target.files],slot=q('#flow-kind').value,unit=q('#flow-unit').value.trim()||E.unit;e.target.value='';
 if(!files.length||running)return;
 const detected=f=>slot!=='auto'?slot:/\.(out|dat)$/i.test(f.name)?'yjk':/地勘|勘察|岩土/.test(f.name)?'geo':'bldg';
 const models=files.filter(f=>detected(f)==='yjk'),groups=files.filter(f=>detected(f)!=='yjk').map(f=>({slot:detected(f),files:[f]}));if(models.length)groups.push({slot:'yjk',files:models});
 for(const group of groups){const job={id:crypto.randomUUID(),project:W.id,slot:group.slot,unit,files:group.files,name:group.files.map(f=>f.name).join('、'),replaceSource:replacement?.source_id,status:'等待读取'};jobs.push(job);await run(job);}
};
q('#flow-kind').onchange=controls;
q('#flow-cancel-replace').onclick=()=>{replacement=null;render();};
q('[data-close]').onclick=()=>dialog.close();
q('#flow-result').onclick=()=>{dialog.close();window.WorkbenchLegacy.go(2);};
dialog.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.retry&&!running){const j=jobs.find(j=>j.id===b.dataset.retry);if(j)await run(j);}
 if(b.hasAttribute('data-model-replace')){replacement=null;q('#flow-kind').value='yjk';render();q('#flow-files').click();}
 if(b.hasAttribute('data-model-remove')&&!running){try{await E.removeModel();render();}catch(e){task.textContent=e.message;}}
});
W.register('workflow',{save:async()=>{},load:async()=>{replacement=null;task.textContent='';jobs=[];},busy:()=>running,capture:()=>({})});
// The importer is the current task, so flush it after work has finished, without blocking its own save.
window.WorkbenchFlow={open(){render();if(!dialog.open)dialog.showModal();},replace(sourceId){const s=I.capture().sources.find(s=>s.source_id===sourceId);if(!s)return;replacement=s;q('#flow-kind').value=s.slot;render();q('#flow-files').click();},export(){const stage=[...document.querySelectorAll('main>section')].find(s=>!s.hidden)?.id;const kind=stage==='stage1'?'measures':stage==='stage3'?'regulations':stage==='stage2'?'expansion':null;if(kind){window.WordDocumentView.export(kind);return;}const pick=document.createElement('dialog');pick.className='flow-dialog';pick.innerHTML='<h2>导出成果</h2><p>选择文稿；PPT、用钢量和计算书请使用当前模块的专用导出。</p><button data-kind="measures">统一措施 Word</button><button data-kind="expansion">扩初说明 Word</button><button data-kind="regulations">地方规范 Word</button><button data-close>关闭</button>';pick.onclick=e=>{const k=e.target.dataset.kind;if(k){pick.close();pick.remove();window.WordDocumentView.export(k);}else if(e.target.hasAttribute('data-close')){pick.close();pick.remove();}};document.body.append(pick);pick.showModal();}};
window.addEventListener('workbuddy:task-status',e=>{if(e.detail.projectId===W.id){if(!/^已保存/.test(e.detail.text))task.textContent=e.detail.text;else if(/浏览器恢复空间不足/.test(task.textContent))task.textContent='已保存到项目库（大文件依赖项目库恢复）';if(e.detail.phase){const job=jobs.findLast(j=>j.project===W.id&&!j.error&&j.status==='读取中');if(job){job.status=e.detail.phase;render();}}}});
window.addEventListener('workbuddy:project-changed',()=>{replacement=null;task.textContent='';if(dialog.open)render();});
