// The preview and download use the same Word layout engine and content snapshot.
const views=new Map();
function measuresHTML(){
 const root=document.querySelector('#paper1').cloneNode(true);
 root.querySelectorAll('.ptip,.op,.badge,button,details,.tblrow,.atools').forEach(n=>n.remove());
 root.querySelector('.ptitle')?.classList.add('document-title');
 root.querySelector('.psub')?.classList.add('document-subtitle');
 return root.innerHTML;
}
const labels={measures:'统一技术措施',expansion:'扩初说明',regulations:'地方规范目录'};
const content=kind=>kind==='measures'?measuresHTML():kind==='regulations'?window.ExpansionWorkbench.localRegulationHTML():window.ExpansionWorkbench.documentHTML();
async function request(html,kind,format,template){
 const r=await fetch('/api/expansion/document',{method:'POST',headers:{'Content-Type':'application/json','X-Workbench-Request':'expansion'},body:JSON.stringify({html:kind==='expansion'?'':html,kind,format,...(kind==='expansion'?{template:template||window.ExpansionWorkbench.documentPackage()}: {})})});
 if(!r.ok)throw Error((await r.json()).error||'Word 排版未完成');
 return format==='preview'?r.json():r.blob();
}
async function preview(v){
 const html=content(v.kind),ticket=++v.ticket;
 v.editor.hidden=true;v.frame.hidden=false;v.edit.disabled=false;v.show.disabled=true;
 if(v.html===html&&v.frame.childElementCount){v.status.textContent='与导出的 Word 使用同一版式';return;}
 v.frame.replaceChildren();v.status.textContent='正在使用本机 Word 排版…';
 try{
  const result=await request(html,v.kind,'preview');if(ticket!==v.ticket)return;
  v.pageText=result.pageText||[];for(const [i,url] of result.pages.entries()){const img=document.createElement('img');img.src=url;img.alt=labels[v.kind]+' · 第 '+(i+1)+' 页';img.loading='lazy';v.frame.append(img);}v.html=html;
  v.status.textContent='共 '+result.pages.length+' 页 · 与导出的 Word 使用同一版式';
 }catch(e){if(ticket===v.ticket){v.status.textContent='排版预览未完成：'+e.message+'。可继续编辑正文后重试。';v.show.disabled=false;}}
}
function edit(v){++v.ticket;v.frame.hidden=true;v.editor.hidden=false;v.edit.disabled=true;v.show.disabled=false;v.status.textContent='直接编辑正文；完成后点“Word 版式”查看分页';}
function mount(kind,stage,editor){
 const bar=document.createElement('div');bar.className='word-view-bar';if(kind==='expansion')bar.hidden=true;
 bar.innerHTML='<button type="button">Word 版式</button><button type="button">编辑正文</button><span role="status"></span>';
 const frame=document.createElement('div');frame.className='word-document-preview';frame.title=labels[kind]+' Word 版式预览';frame.hidden=true;
 editor.before(bar,frame);const [show,editButton]=bar.querySelectorAll('button');
 const v={kind,stage,editor,frame,show,edit:editButton,status:bar.querySelector('span'),ticket:0};views.set(kind,v);
 show.onclick=()=>preview(v);editButton.onclick=()=>edit(v);edit(v);
 const onOpen=()=>{if(!stage.hidden)edit(v);};
 new MutationObserver(onOpen).observe(stage,{attributes:true,attributeFilter:['hidden']});
 return v;
}
const expansion=mount('expansion',document.querySelector('#stage2'),document.querySelector('#paper2 .ev-layout'));
mount('regulations',document.querySelector('#stage3'),document.querySelector('#ev-shared-regs'));
const measures=mount('measures',document.querySelector('#stage1'),document.querySelector('#paper1'));
for(const [id,v] of [['toc1',measures],['toc2',expansion]])document.getElementById(id)?.addEventListener('click',e=>{const a=e.target.closest('a');if(!a||!v.editor.hidden)return;const target=document.querySelector(a.getAttribute('href'));const label=(target?.textContent||a.textContent).replace(/\s+/g,'');const index=v.pageText?.findIndex(text=>text.includes(label));if(index>=0){e.preventDefault();v.frame.children[index].scrollIntoView({block:'start'});}else{e.preventDefault();v.frame.scrollIntoView({block:'start'});}});
let refreshTimer,exportPending=false;
window.addEventListener('workbuddy:expansion-changed',()=>{
 clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{for(const v of views.values())if(!v.stage.hidden&&!v.frame.hidden)preview(v);},700);
});
window.addEventListener('workbuddy:project-changed',()=>{for(const v of views.values()){++v.ticket;v.frame.replaceChildren();v.html=null;}});
window.WordDocumentView={edit:kind=>edit(views.get(kind)),async export(kind,format='docx'){
 const W=window.WorkbenchProjects,v=views.get(kind);if(W.exporting||exportPending)return;exportPending=true;
 const notify=text=>{v.status.textContent=text;window.dispatchEvent(new CustomEvent('workbuddy:task-status',{detail:{projectId:W.id,text}}));};
 try{
  notify('正在保存当前内容，准备导出…');await W.flush();W.setExporting(true);
  const projectId=W.id,unit=window.ExpansionWorkbench.unit,html=content(kind),template=kind==='expansion'?window.ExpansionWorkbench.documentPackage():undefined;
  const name=window.WorkbenchLegacy.params().project_name||'未命名项目';notify('正在导出 '+(format==='pdf'?'PDF':'Word')+'…');
  const blob=await request(html,kind,format,template);
  if(W.id!==projectId||window.ExpansionWorkbench.unit!==unit)throw Error('项目或单体已切换，请在当前稿重新导出');
  await W.recordExport({at:new Date().toISOString(),projectId,unit,kind,format,parameterVersion:W.parameterVersion,...(template?{template}:{html})});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name+'_'+labels[kind]+'.'+format;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  notify('已导出并保存本次内容版本');
 }catch(e){notify('导出失败：'+e.message+'。可点击导出重试。');}finally{exportPending=false;W.setExporting(false);}
}};
