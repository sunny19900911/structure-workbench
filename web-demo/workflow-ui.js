import './integrated-modules.js';
import './portable-projects-ui.js';
import './workflow-ui.css';
import {isModelFile} from './design/parallel-review-20261109/ui/intake-routing.js';
const W=window.WorkbenchProjects,I=window.WorkbenchIntake,E=window.ExpansionWorkbench;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dialog=document.createElement('dialog');dialog.className='flow-dialog';
dialog.innerHTML='<div class="flow-heading"><h2>项目资料</h2><button data-close>关闭</button></div><div class="flow-upload"><input type="file" id="flow-files" multiple aria-label="选择项目资料"><span id="flow-replace"></span><button id="flow-cancel-replace" hidden>取消替换</button></div><div id="flow-jobs" role="status"></div><div id="flow-model"></div><button id="flow-result">查看扩初正文</button>';
document.body.append(dialog);
const q=s=>dialog.querySelector(s);let jobs=[],running=false,replacement=null;
const panel=document.querySelector('#intake-panel');dialog.append(panel);
// Remove redundant upload controls and their direct event paths; parser-bound labels remain optional.
panel.querySelector('#intake-files').remove();
const oldModel=document.querySelector('#box-yjk')?.closest('.panel-card');oldModel?.remove();
document.querySelector('.topbar #word-export-btn')?.remove();
const guide=document.querySelector('.side .flow');if(guide)guide.textContent='导入资料 → 编辑正文 → 生成成果';
const task=document.createElement('span');task.id='flow-task';task.setAttribute('role','status');document.querySelector('.wp-primary').append(task);
function controls(){const disabled=running||W.loading||I.busy||E.busy;dialog.querySelectorAll('.flow-upload input,.flow-upload button').forEach(e=>e.disabled=disabled);q('#flow-files').multiple=!replacement;q('#flow-files').accept=replacement?.slot==='yjk'?'.out,.txt,.dat':'.doc,.docx,.docm,.dot,.dotx,.dotm,.pdf,.txt,.md,.out,.dat';}
function render(){
 const current=jobs.filter(j=>j.project===W.id);
 q('#flow-jobs').innerHTML=current.map(j=>'<p>'+esc(({auto:'资料',bldg:'建筑',geo:'地勘',yjk:'模型'})[j.slot]+' · '+j.name)+' · '+esc(j.status)+(j.error?'：'+esc(j.error)+' <button data-retry="'+j.id+'">仅重试此项</button>':'')+'</p>').join('');
 const model=E.modelContext()?.model;q('#flow-model').innerHTML=model?'<h3>模型 · '+esc(E.unit)+'</h3><p>'+esc(model.files.join('、'))+' <button data-model-replace>替换批次</button> <button data-model-remove>移除批次</button></p>':'';
 q('#flow-replace').textContent=replacement?'正在替换：'+replacement.name:'';q('#flow-cancel-replace').hidden=!replacement;controls();
}
async function run(job){
 if(job.project!==W.id)throw Error('项目已切换，请在原项目重试');
 running=true;job.error='';job.status='读取中';task.textContent='读取中 · '+job.name;render();
 try{
  if(job.slot==='yjk'){if(E.unit!==job.unit)throw Error('当前单体已改变，请切回 '+job.unit+' 后重试');await E.importFiles('yjk',job.files);}
  else{const result=await I.readFiles(job.slot,job.files,{replaceSource:job.replaceSource});job.slot=result?.files?.[0]?.slot||job.slot;}
  job.status='已更新';task.textContent='已更新 · '+job.name;
  await W.flush('workflow');job.status='已更新 · 已保存';replacement=null;
 }catch(e){job.status='失败';job.error=e.message;task.textContent='处理失败 · '+e.message;}
 finally{running=false;render();}
}
q('#flow-files').onchange=async e=>{
 const files=[...e.target.files],project=W.id,unit=E.unit,target=replacement;e.target.value='';
 if(!files.length||running)return;
 running=true;controls();task.textContent='正在读取资料类型…';
 try{
  const classified=[];
  for(const file of files){const text=/\.(txt|md)$/i.test(file.name)?window.ExpansionHost.decode(await file.slice(0,32000).arrayBuffer()):'';classified.push({file,slot:target?.slot||(isModelFile(file.name,text)?'yjk':'auto')});}
  if(project!==W.id||unit!==E.unit)throw Error('项目或单体已切换，请重新选择文件');
  const models=classified.filter(item=>item.slot==='yjk').map(item=>item.file),groups=classified.filter(item=>item.slot!=='yjk').map(item=>({slot:item.slot,files:[item.file]}));if(models.length)groups.push({slot:'yjk',files:models});
  for(const group of groups){const job={id:crypto.randomUUID(),project,slot:group.slot,unit,files:group.files,name:group.files.map(f=>f.name).join('、'),replaceSource:target?.source_id,status:'等待读取'};jobs.push(job);await run(job);}
 }catch(error){task.textContent='导入失败 · '+error.message;q('#flow-jobs').textContent=error.message;}
 finally{running=false;controls();}
};
q('#flow-cancel-replace').onclick=()=>{replacement=null;render();};
q('[data-close]').onclick=()=>dialog.close();
q('#flow-result').onclick=()=>{dialog.close();window.WorkbenchLegacy.go(2);};
dialog.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.retry&&!running){const j=jobs.find(j=>j.id===b.dataset.retry);if(j)await run(j);}
 if(b.hasAttribute('data-model-replace')){replacement={slot:'yjk',name:'当前模型批次'};render();q('#flow-files').click();}
 if(b.hasAttribute('data-model-remove')&&!running){try{await E.removeModel();render();}catch(e){task.textContent=e.message;}}
});
W.register('workflow',{save:async()=>{},load:async()=>{replacement=null;task.textContent='';jobs=[];},busy:()=>running,capture:()=>({})});
// The importer is the current task, so flush it after work has finished, without blocking its own save.
window.WorkbenchFlow={open(){replacement=null;render();if(!dialog.open)dialog.showModal();},replace(sourceId){const s=I.capture().sources.find(s=>s.source_id===sourceId);if(!s)return;replacement=s;render();q('#flow-files').click();},export(){const stage=[...document.querySelectorAll('main>section')].find(s=>!s.hidden)?.id;const kind=stage==='stage1'?'measures':stage==='stage3'?'regulations':stage==='stage2'?'expansion':null;if(kind){window.WordDocumentView.export(kind);return;}const pick=document.createElement('dialog');pick.className='flow-dialog';pick.innerHTML='<h2>导出成果</h2><p>选择文稿；PPT、用钢量和计算书请使用当前模块的专用导出。</p><button data-kind="measures">统一措施 Word</button><button data-kind="expansion">扩初说明 Word</button><button data-kind="regulations">地方规范 Word</button><button data-close>关闭</button>';pick.onclick=e=>{const k=e.target.dataset.kind;if(k){pick.close();pick.remove();window.WordDocumentView.export(k);}else if(e.target.hasAttribute('data-close')){pick.close();pick.remove();}};document.body.append(pick);pick.showModal();}};
window.addEventListener('workbuddy:task-status',e=>{if(e.detail.projectId===W.id){if(!/^已保存/.test(e.detail.text))task.textContent=e.detail.text;else if(/浏览器恢复空间不足/.test(task.textContent))task.textContent='已保存到项目库（大文件依赖项目库恢复）';if(e.detail.phase){const job=jobs.findLast(j=>j.project===W.id&&!j.error&&j.status==='读取中');if(job){job.status=e.detail.phase;render();}}}});
window.addEventListener('workbuddy:project-changed',()=>{replacement=null;task.textContent='';if(dialog.open)render();});
