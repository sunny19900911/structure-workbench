/* 本机计算书 PDF 读取；文件仅引用，项目内保存路径及清单。 */
(() => {
 const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let state={path:'',files:[]},scanTicket=0,pageTicket=0,active='',page=1,blobUrl='',busy=false;
 const save=()=>window.WorkbenchProjects?.scheduleSave();
 const status=text=>{$('calcbook-pdf-status').textContent=text;};
 const groups=['荷载校核','上部','基础','施工图'];
 function setBusy(value){busy=value;$('calcbook-pdf-scan').disabled=value;$('calcbook-pdf-upload').disabled=value;$('calcbook-pdf-export').disabled=value||!state.files.length;}
 async function request(url,options={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),240000);
  try{const response=await fetch(url,{...options,signal:controller.signal});
   if(!response.ok){const error=await response.json().catch(()=>({}));throw Error(response.status===401?'登录已过期，请刷新后重新登录':error.error||`请求失败（HTTP ${response.status}）`);}
   return options.download?await response.blob():await response.json();
  }catch(e){throw Error(e.name==='AbortError'?'读取或生成超时，请重试':e.message);}finally{clearTimeout(timer);}
 }
 const post=(url,data)=>request(url,{method:'POST',headers:{'Content-Type':'application/json','X-Workbench-Request':'calculation-pdfs'},body:JSON.stringify(data)});
 function adopt(result){state={path:result.root,files:result.files};$('calcbook-pdf-path').value=state.path;render();save();$('calcbook-pdf-warnings').textContent=(result.warnings||[]).join('；');}
 function clearPreview(){
  ++pageTicket;if(blobUrl)URL.revokeObjectURL(blobUrl);blobUrl='';active='';page=1;
  $('calcbook-pdf-image').removeAttribute('src');$('calcbook-pdf-viewer').hidden=true;
 }
 function render(){
  $('calcbook-pdf-export').disabled=busy||!state.files.length;
  $('calcbook-pdf-count').textContent=state.files.length?`${state.files.length} 份 PDF`:'';
  $('calcbook-pdf-list').innerHTML=groups.map(group=>{
   const files=state.files.filter(f=>f.group===group);if(!files.length)return '';
   return `<section class="calcbook-pdf-group"><h4>${esc(group)}</h4>${files.map(f=>`<button type="button" class="calcbook-pdf-file ${active===f.id?'active':''}" data-pdf="${esc(f.id||'')}" ${f.id?'':'disabled'} title="${esc(f.relativePath)}"><span>${esc(f.name)}</span><em>${f.pages?f.pages+' 页':'页数待核'}</em></button>`).join('')}</section>`;
  }).join('')||'<p class="calcbook-pdf-empty">选择盈建科输出文件夹，读取荷载校核、上部、基础、施工图 PDF。</p>';
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
  if(busy)return;
  const path=$('calcbook-pdf-path').value.trim();if(!path){status('请填写输出文件夹路径');$('calcbook-pdf-path').focus();return;}
  const ticket=++scanTicket,project=window.WorkbenchProjects?.id;clearPreview();
  setBusy(true);status('正在读取 PDF…');
  try{
   const result=await post('/api/calculation-pdfs/scan',{path});if(ticket!==scanTicket||project!==window.WorkbenchProjects?.id)return;
   adopt(result);
   status(state.files.length?`已读取 ${state.files.length} 份 PDF`:'未找到 PDF，请检查荷载校核或计算书子目录');
   if(state.files.length)await show(state.files[0].id,1);
  }catch(e){if(ticket===scanTicket&&project===window.WorkbenchProjects?.id)status(e.message||'读取失败');}
  finally{if(ticket===scanTicket)setBusy(false);}
 }
 async function upload(){
  const input=$('calcbook-pdf-folder'),files=Array.from(input.files||[]).filter(file=>/\.pdf$/i.test(file.name)&&file.webkitRelativePath.split('/').slice(0,-1).some(p=>/^荷载校核/.test(p)||groups.includes(p))&&!file.webkitRelativePath.split('/').includes('03_盈建科参数导出样本'));input.value='';
  if(busy)return;
  if(!files.length){status('此目录未找到荷载校核、上部、基础或施工图 PDF，请选择盈建科输出目录。');return;}
  if(files.length>200||files.some(f=>f.size>64*1024*1024)||files.reduce((sum,f)=>sum+f.size,0)>512*1024*1024){status('最多选择 200 份 PDF，单份不超过 64 MB，总计不超过 512 MB。');return;}
  const project=window.WorkbenchProjects?.id;if(!project){status('请先打开一个项目');return;}
  const ticket=++scanTicket,batch=crypto.randomUUID().replaceAll('-','');clearPreview();setBusy(true);
  try{
   let root='';
   for(let index=0;index<files.length;index++){
    if(ticket!==scanTicket||project!==window.WorkbenchProjects?.id)return;
    const file=files[index];status(`正在上传 ${index+1}/${files.length}：${file.name}`);
    const result=await request('/api/calculation-pdfs/upload?'+new URLSearchParams({project,batch,path:file.webkitRelativePath}),{method:'POST',headers:{'Content-Type':'application/pdf','X-Workbench-Request':'calculation-pdfs'},body:file});root=result.root;
   }
   if(ticket!==scanTicket||project!==window.WorkbenchProjects?.id)return;
   status('正在读取 PDF 页数…');const result=await post('/api/calculation-pdfs/scan',{path:root});
   if(ticket!==scanTicket||project!==window.WorkbenchProjects?.id)return;
   adopt(result);status(`已读取 ${result.files.length} 份 PDF，可合并导出。`);
   if(result.files.length)await show(result.files[0].id,1);
  }catch(e){if(ticket===scanTicket)status(e.message);}finally{if(ticket===scanTicket)setBusy(false);}
 }
 async function exportPdf(){
  if(busy||!state.files.length)return;
  const ticket=++scanTicket,project=window.WorkbenchProjects?.id;setBusy(true);status('正在合并 PDF，完成后自动下载…');
  try{
   // Reauthorize after server restart or restoring a saved project; never mix projects.
   const result=await post('/api/calculation-pdfs/scan',{path:state.path});
   if(ticket!==scanTicket||project!==window.WorkbenchProjects?.id)return;
   const previous=state.files.map(f=>[f.relativePath,f.size,f.mtimeMs]);
   const current=result.files.map(f=>[f.relativePath,f.size,f.mtimeMs]);
   if(JSON.stringify(previous)!==JSON.stringify(current)){adopt(result);throw Error('目录内容已变化，已更新清单，请查看后再次导出。');}
   adopt(result);
   const blob=await request('/api/calculation-pdfs/export',{method:'POST',headers:{'Content-Type':'application/json','X-Workbench-Request':'calculation-pdfs'},body:JSON.stringify({ids:state.files.map(f=>f.id)}),download:true});
   if(ticket!==scanTicket||project!==window.WorkbenchProjects?.id)return;
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='结构计算书.pdf';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);status(`已合并 ${state.files.length} 份 PDF，下载已开始。`);
  }catch(e){if(ticket===scanTicket)status(e.message);}finally{if(ticket===scanTicket)setBusy(false);}
 }
 $('calcbook-pdf-upload').addEventListener('click',()=>$('calcbook-pdf-folder').click());
 $('calcbook-pdf-folder').addEventListener('change',upload);
 $('calcbook-pdf-export').addEventListener('click',exportPdf);
 $('calcbook-pdf-scan').addEventListener('click',scan);
 $('calcbook-pdf-path').addEventListener('keydown',e=>{if(e.key==='Enter')scan();});
 $('calcbook-pdf-prev').addEventListener('click',()=>show(active,page-1));
 $('calcbook-pdf-next').addEventListener('click',()=>show(active,page+1));
 function goToPage(){const input=$('calcbook-pdf-page'),value=Number(input.value),f=state.files.find(f=>f.id===active);if(f&&Number.isInteger(value)&&value>=1&&value<=f.pages){if(value!==page)show(active,value);}else input.value=String(page);}
 $('calcbook-pdf-page').addEventListener('change',goToPage);
 $('calcbook-pdf-page').addEventListener('keydown',e=>{if(e.key==='Enter')goToPage();});
 window.CalculationPDFs={
  busy:()=>busy,
  capture(){return {path:state.path,files:state.files.map(({id,...file})=>({...file}))};},
  load(saved){++scanTicket;clearPreview();state={path:typeof saved?.path==='string'?saved.path:'',files:Array.isArray(saved?.files)?saved.files.map(({id,...file})=>file):[]};$('calcbook-pdf-path').value=state.path;setBusy(false);$('calcbook-pdf-warnings').textContent='';render();status(state.files.length?'已恢复文件清单，可读取预览或合并导出':'');}
 };
 render();
})();
