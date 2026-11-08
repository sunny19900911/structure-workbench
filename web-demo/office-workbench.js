import './office-workbench.css';

export function mountOfficeWorkbench(){
 if(!window.WORKBENCH_PORTABLE||window.WorkbenchOffice)return;
 const W=window.WorkbenchProjects,E=window.ExpansionWorkbench;
 let busy=false,opening=false,commandPending=false,current=null,frame=null;
 const dialog=document.createElement('dialog');dialog.className='office-workspace';
 dialog.innerHTML='<header><strong>项目成果</strong><span class="office-project-label"></span><button data-office="generate">生成 Word · PPT · Excel</button><button data-office="import">打开文件</button><button data-office="close">关闭</button></header><p class="office-status" role="status"></p><div class="office-workspace-body"><aside class="office-file-list"></aside><div class="office-editor-host"></div></div><input type="file" accept=".docx,.pptx,.xlsx" hidden>';
 document.body.append(dialog);
 const note=text=>dialog.querySelector('.office-status').textContent=text;
 const api=async(path,options)=>{const r=await fetch('/api/office-documents/'+path,options),v=await r.json();if(!r.ok)throw Object.assign(Error(v.error||'文件操作未完成'),{status:r.status,code:v.code});return v;};
 const editor=()=>frame?.contentWindow?.WorkbenchOfficeEditor;
 async function save(){if(editor()?.busy)throw Error('正在保存文档');if(editor()?.dirty)await editor().save();if(editor()?.dirty)throw Error('文档有新修改，请保存后继续');}
 async function clear(){await save();editor()?.destroy?.();frame?.remove();frame=null;current=null;}
 async function list(){
  const projectId=W.id,{documents}=await api(projectId);if(projectId!==W.id)return;
  const aside=dialog.querySelector('aside');aside.replaceChildren();
  dialog.querySelector('.office-project-label').textContent=window.WorkbenchLegacy.params().project_name||'未命名项目';
  for(const file of documents){const item=document.createElement('div');item.className='office-file-item';
   const open=document.createElement('button');open.textContent=file.title.replace(/\.(docx|xlsx|pptx)$/i,'')+' · '+({docx:'Word',pptx:'PPT',xlsx:'Excel'})[file.type];open.title=file.unit+' · 版本 '+file.fileRevision;open.onclick=()=>run(()=>openDocument(file.documentId));
   const download=document.createElement('a');download.textContent='下载';download.href='/api/office-documents/'+projectId+'/'+file.documentId+'/content';download.download=file.filename||file.title+'.'+file.type;item.append(open,download);aside.append(item);
  }
  if(!documents.length){const p=document.createElement('p');p.textContent='生成成果，或打开已有文件。';aside.append(p);}return documents;
 }
 async function show(){if(!dialog.open)dialog.showModal();await list();}
 async function openDocument(documentId){
  if(busy||opening||commandPending)throw Error('正在处理文档');opening=true;
  try{await clear();const projectId=W.id;
  const {document:record}=await api(projectId+'/'+documentId);if(projectId!==W.id)throw Error('项目已切换');
  if(record.unit!==E.unit)throw Error('请先切换到 '+record.unit);
  current=record;frame=document.createElement('iframe');frame.title=record.title;frame.src='./office-editor.html?'+new URLSearchParams({project:projectId,document:documentId});dialog.querySelector('.office-editor-host').replaceChildren(frame);
  if(!dialog.open)dialog.showModal();note('');
  const target=frame,start=Date.now();while(!target.contentWindow?.WorkbenchOfficeEditor?.read){if(Date.now()-start>60000)throw Error('编辑器未能打开，请重试');await new Promise(resolve=>setTimeout(resolve,100));}
  if(frame!==target||W.id!==projectId)throw Error('文档已切换');const value=await target.contentWindow.WorkbenchOfficeEditor.read();
  if(value.document.projectId!==projectId||value.document.documentId!==documentId||value.document.unit!==E.unit)throw Error('文档与当前项目不一致');return value;
  }finally{opening=false;}
 }
 async function register(blob,type,title,identity){
  return (await api(identity.projectId+'?type='+type,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Workbench-Request':'office-documents','X-File-Name':encodeURIComponent(title),'X-Document-Unit':encodeURIComponent(identity.unit),'X-Parameter-Version':String(identity.version),'X-Batch-Id':identity.batchId||''},body:blob})).document;
 }
 async function generate(){
  if(busy||opening||commandPending)throw Error('正在生成或编辑文件，请稍后');
  busy=true;
  const selected={projectId:W.id,unit:E.unit},outputs=[],main=document.querySelector('main'),frozenFrame=frame;
  const previousMainInert=main?.inert,previousFrameInert=frozenFrame?.inert;
  const controls=[...dialog.querySelectorAll('header button')].map(button=>({button,disabled:button.disabled}));
  if(main)main.inert=true;if(frozenFrame)frozenFrame.inert=true;for(const {button} of controls)button.disabled=true;
  let exporting=false;
  try{
   note('正在整理当前项目…');await W.flush('office');
   if(W.id!==selected.projectId||E.unit!==selected.unit)throw Error('项目或单体已切换，请重新生成');
   if(!E.capture()?.signed){await E.mcp.generate();await W.flush('office');}
   const identity={...selected,version:W.parameterVersion,batchId:crypto.randomUUID().replaceAll('-','')};
   const snapshot=E.capture();
   if(snapshot?.measuresVersion!==identity.version)throw Object.assign(Error(snapshot?.signed?'扩初签发稿采用旧参数版本；请撤回签发并更新正文后再生成整套成果。':'扩初说明尚未同步当前参数，请更新正文后重试。'),{status:409,code:'SOURCE_VERSION_MISMATCH'});
   const signature=()=>JSON.stringify({projectId:W.id,unit:E.unit,version:W.parameterVersion,parameters:window.WorkbenchLegacy.params(),report:E.documentPackage()});
   const sourceSignature=signature();
   const ensureCurrent=()=>{if(signature()!==sourceSignature||E.capture()?.measuresVersion!==identity.version)throw Object.assign(Error('生成期间项目正文或参数发生变化，请重新生成。'),{status:409,code:'SOURCE_VERSION_MISMATCH'});};
   const spec=structuredClone(E.mcp.read()),params=structuredClone(window.WorkbenchLegacy.params()),M=window.WorkbenchModules;
   await M.mcp.openPpt(identity.unit);
   // Let the same-origin snapshot message enter the PPT queue before inspecting it.
   await new Promise(resolve=>setTimeout(resolve,0));
   const start=Date.now();let pptContext;
   while(true){
    ensureCurrent();pptContext=M.mcp.ppt.read();
    if(pptContext.projectId===identity.projectId&&pptContext.unit===identity.unit&&pptContext.parameterVersion===identity.version)break;
    if(Date.now()-start>20000)throw Object.assign(Error('PPT 尚未同步当前项目参数版本，请重试。'),{status:409,code:'PPT_VERSION_MISMATCH'});
    await new Promise(resolve=>setTimeout(resolve,100));
   }
   ensureCurrent();W.setExporting(true);exporting=true;note('正在生成 Word…');
   const word=await window.WordDocumentView.createBlob('expansion');ensureCurrent();
   note('正在生成 PPT…');const ppt=await M.mcp.ppt.export({projectId:identity.projectId,unit:identity.unit,parameterVersion:identity.version});
   if(ppt.projectId!==identity.projectId||ppt.unit!==identity.unit||ppt.parameterVersion!==identity.version)throw Object.assign(Error('PPT 导出采用的参数版本不一致，本批成果未登记。'),{status:409,code:'PPT_VERSION_MISMATCH'});
   ensureCurrent();
   outputs.push(await register(word,'docx','结构初步设计说明',identity));ensureCurrent();
   outputs.push(await register(ppt.blob,'pptx','结构设计汇报',identity));ensureCurrent();
   note('正在生成 Excel…');
   const parameters=Object.entries(params).filter(([,v])=>typeof v!=='object').map(([key,value])=>({name:[...document.querySelectorAll('[data-k]')].find(el=>el.dataset.k===key)?.closest('.fld')?.querySelector('label')?.textContent.trim()||key,value:String(value??''),source:'统一技术措施'}));
   const tables=Object.entries(spec.tables||{}).map(([key,t])=>({name:({units:'单体信息',analysis:'计算参数'})[key]||t.title||key,rows:(t.rows||[]).map(row=>row.values)})).filter(t=>t.rows.length);
   outputs.push((await api(identity.projectId+'/generate-xlsx',{method:'POST',headers:{'Content-Type':'application/json','X-Workbench-Request':'office-documents'},body:JSON.stringify({title:'结构参数与指标',unit:identity.unit,sourceParameterVersion:identity.version,batchId:identity.batchId,parameters,tables})})).document);
   ensureCurrent();
   note('已生成 Word、PPT、Excel');await list();return {batchId:identity.batchId,projectId:identity.projectId,unit:identity.unit,sourceParameterVersion:identity.version,documents:outputs};
  }catch(e){if(outputs.length)e.message='本批尚未完整完成，已保存 '+outputs.length+' 份文件；'+e.message;note(e.message);throw e;}
  finally{busy=false;if(exporting)W.setExporting(false);if(main)main.inert=previousMainInert;if(frozenFrame)frozenFrame.inert=previousFrameInert;for(const {button,disabled} of controls)button.disabled=disabled;}
 }
 async function run(action){try{return await action();}catch(e){note(e.message);}}
 const close=async()=>{if(opening||busy||commandPending)throw Error('正在处理文档');await clear();dialog.close();};
 dialog.querySelector('[data-office="close"]').onclick=()=>run(close);
 dialog.addEventListener('cancel',e=>{e.preventDefault();run(close);});
 dialog.querySelector('[data-office="generate"]').onclick=()=>run(generate);
 const input=dialog.querySelector('input[type=file]');dialog.querySelector('[data-office="import"]').onclick=()=>input.click();
 input.onchange=()=>run(async()=>{const file=input.files[0];if(!file)return;await W.flush();const type=file.name.split('.').at(-1).toLowerCase();const record=await register(file,type,file.name.replace(/\.[^.]+$/,''),{projectId:W.id,unit:E.unit,version:W.parameterVersion});await list();await openDocument(record.documentId);input.value='';});
 const entry=document.createElement('button');entry.id='office-workspace-open';entry.textContent='Word · PPT · Excel';entry.onclick=()=>run(show);document.getElementById('wp-export')?.after(entry);
 W.register('office',{save,load:async()=>{editor()?.destroy?.();frame?.remove();frame=null;current=null;if(dialog.open)dialog.close();},busy:()=>busy||opening||commandPending||Boolean(editor()?.busy),capture:()=>null});
 window.WorkbenchOffice={show,list,generate,open:openDocument,save,async read(documentId){if(opening||commandPending)throw Error('正在处理文档');if(current?.documentId!==documentId){if(editor()?.dirty)throw Object.assign(Error('页面有未保存修改，请先保存'),{status:409,code:'UNSAVED_EDITOR'});await openDocument(documentId);}return editor().read();},async command(documentId,command){if(opening||commandPending||busy)throw Error('正在处理文档');if(current?.documentId!==documentId)await openDocument(documentId);const target=editor(),before=await target.read();if(before.document.documentId!==documentId||before.document.projectId!==W.id||before.document.unit!==E.unit)throw Error('文档与当前项目不一致');if(target.dirty)throw Object.assign(Error('页面有未保存修改，请先保存'),{status:409,code:'UNSAVED_EDITOR'});commandPending=true;try{await target.executeCommand(command);await target.save();return target.read();}finally{commandPending=false;}},get busy(){return busy||opening||commandPending;}};
 window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===frame?.contentWindow&&event.data?.type==='workbench:office-saved')list().catch(()=>{});});
}
