/* 本机计算书 PDF 读取；文件仅引用，项目内保存路径及清单。 */
(() => {
 const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let state={path:'',files:[]},scanTicket=0,pageTicket=0,active='',page=1,blobUrl='';
 const save=()=>window.WorkbenchProjects?.scheduleSave();
 const status=text=>{$('calcbook-pdf-status').textContent=text;};
 function clearPreview(){
  ++pageTicket;if(blobUrl)URL.revokeObjectURL(blobUrl);blobUrl='';active='';page=1;
  $('calcbook-pdf-image').removeAttribute('src');$('calcbook-pdf-viewer').hidden=true;
 }
 function render(){
  const groups=['荷载校核','上部','基础','施工图'];
  $('calcbook-pdf-count').textContent=state.files.length?`${state.files.length} 份 PDF`:'';
  $('calcbook-pdf-list').innerHTML=groups.map(group=>{
   const files=state.files.filter(f=>f.group===group);if(!files.length)return '';
   return `<section class="calcbook-pdf-group"><h4>${esc(group)}</h4>${files.map(f=>`<button type="button" class="calcbook-pdf-file ${active===f.id?'active':''}" data-pdf="${esc(f.id||'')}" ${f.id?'':'disabled'} title="${esc(f.relativePath)}"><span>${esc(f.name)}</span><em>${f.pages?f.pages+' 页':'页数待核'}</em></button>`).join('')}</section>`;
  }).join('')||'<p class="calcbook-pdf-empty">输入输出路径，读取荷载校核及计算书子目录中的 PDF。</p>';
  $('calcbook-pdf-list').querySelectorAll('[data-pdf]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.pdf,1)));
 }
 async function show(id,requestedPage){
  const file=state.files.find(f=>f.id===id);if(!file)return;
  const ticket=++pageTicket,project=window.WorkbenchProjects?.id;
  active=id;page=requestedPage;render();
  $('calcbook-pdf-viewer').hidden=false;$('calcbook-pdf-title').textContent=file.name;
  $('calcbook-pdf-download').href='/api/calculation-pdfs/file?'+new URLSearchParams({id});
  $('calcbook-pdf-page').value=String(page);$('calcbook-pdf-page').max=String(file.pages||1);
  $('calcbook-pdf-total').textContent='/ '+(file.pages||'?')+' 页';
  $('calcbook-pdf-prev').disabled=page<=1;$('calcbook-pdf-next').disabled=page>=file.pages;
  $('calcbook-pdf-image').removeAttribute('src');
  if(!file.pages){status(file.error||'此文件无法预览，可下载原 PDF 核对');return;}
  status('正在读取 PDF 第 '+page+' 页…');
  try{
   const response=await fetch('/api/calculation-pdfs/page?'+new URLSearchParams({id,page:String(page)}),{cache:'no-store'});
   if(!response.ok)throw Error((await response.json()).error||'PDF 预览失败');
   const blob=await response.blob();if(ticket!==pageTicket||project!==window.WorkbenchProjects?.id)return;
   if(blobUrl)URL.revokeObjectURL(blobUrl);blobUrl=URL.createObjectURL(blob);
   $('calcbook-pdf-image').src=blobUrl;$('calcbook-pdf-image').alt=file.name+' 第 '+page+' 页';
   status(file.relativePath);
  }catch(e){if(ticket===pageTicket&&project===window.WorkbenchProjects?.id)status(e.message||'PDF 预览失败');}
 }
 async function scan(){
  const path=$('calcbook-pdf-path').value.trim();if(!path){status('请填写输出文件夹路径');$('calcbook-pdf-path').focus();return;}
  const ticket=++scanTicket,project=window.WorkbenchProjects?.id;clearPreview();
  state={path,files:[]};render();save();$('calcbook-pdf-warnings').textContent='';$('calcbook-pdf-scan').disabled=true;status('正在读取 PDF…');
  try{
   const response=await fetch('/api/calculation-pdfs/scan',{method:'POST',headers:{'Content-Type':'application/json','X-Workbench-Request':'calculation-pdfs'},body:JSON.stringify({path})});
   const result=await response.json();if(ticket!==scanTicket||project!==window.WorkbenchProjects?.id)return;
   if(!response.ok)throw Error(result.error||'读取失败');
   state={path:result.root,files:result.files};$('calcbook-pdf-path').value=state.path;render();save();
   $('calcbook-pdf-warnings').textContent=(result.warnings||[]).join('；');
   status(state.files.length?`已读取 ${state.files.length} 份 PDF`:'未找到 PDF，请检查荷载校核或计算书子目录');
   if(state.files.length)await show(state.files[0].id,1);
  }catch(e){if(ticket===scanTicket&&project===window.WorkbenchProjects?.id)status(e.message||'读取失败');}
  finally{if(ticket===scanTicket)$('calcbook-pdf-scan').disabled=false;}
 }
 $('calcbook-pdf-scan').addEventListener('click',scan);
 $('calcbook-pdf-path').addEventListener('keydown',e=>{if(e.key==='Enter')scan();});
 $('calcbook-pdf-prev').addEventListener('click',()=>show(active,page-1));
 $('calcbook-pdf-next').addEventListener('click',()=>show(active,page+1));
 function goToPage(){const input=$('calcbook-pdf-page'),value=Number(input.value),f=state.files.find(f=>f.id===active);if(f&&Number.isInteger(value)&&value>=1&&value<=f.pages){if(value!==page)show(active,value);}else input.value=String(page);}
 $('calcbook-pdf-page').addEventListener('change',goToPage);
 $('calcbook-pdf-page').addEventListener('keydown',e=>{if(e.key==='Enter')goToPage();});
 window.CalculationPDFs={
  capture(){return {path:state.path,files:state.files.map(({id,...file})=>({...file}))};},
  load(saved){++scanTicket;clearPreview();state={path:typeof saved?.path==='string'?saved.path:'',files:Array.isArray(saved?.files)?saved.files.map(({id,...file})=>file):[]};$('calcbook-pdf-path').value=state.path;$('calcbook-pdf-scan').disabled=false;$('calcbook-pdf-warnings').textContent='';render();status(state.files.length?'已恢复文件清单，点击“读取 PDF”后可预览':'');}
 };
 render();
})();
