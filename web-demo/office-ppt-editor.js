// Native PPTX editor. UI and office.command invoke the same revision-checked command path.

export async function mountPptEditor({element,document:initial,view:initialView,onSaved=()=>{}}){
 let record=initial,view=initialView,selectedSlide=0,selectedId=null,pending=null,busy=false,uncertain=false,destroyed=false,saveTimer=null;
 const undo=[],redo=[];
 let inFlight=null;
 const dom=element.ownerDocument;
 const make=(tag,className,text)=>{const e=dom.createElement(tag);if(className)e.className=className;if(text!=null)e.textContent=text;return e;};
 const root=make('section','office-ppt-editor'),tools=make('div','ppt-toolbar'),body=make('div','ppt-body'),rail=make('nav','ppt-thumbnails'),workspace=make('div','ppt-workspace'),properties=make('div','ppt-properties'),status=make('p','ppt-status');
 rail.setAttribute('aria-label','幻灯片缩略图');tools.setAttribute('aria-label','幻灯片工具栏');status.setAttribute('role','status');
 body.append(rail,workspace);root.append(tools,body,properties,status);element.append(root);
 const current=()=>view.slides[selectedSlide];
 const selected=()=>current()?.shapes.find(s=>s.id===selectedId);
 const base='/api/office-documents/'+encodeURIComponent(record.projectId)+'/'+encodeURIComponent(record.documentId);
 const report=e=>{status.textContent=e.message;};
 const autosave=()=>{clearTimeout(saveTimer);saveTimer=setTimeout(()=>save().catch(report),1200);};
 const button=(label,fn)=>{const b=make('button','',label);b.type='button';b.onclick=()=>Promise.resolve().then(fn).catch(report);return b;};
 dom.body.classList.add('ppt-editor-mounted');
 async function download(){await save();const response=await fetch(base+'/content');if(!response.ok)throw Error('下载失败，请重试');const url=URL.createObjectURL(await response.blob()),link=make('a');link.href=url;link.download=(record.title||'项目汇报').replace(/\.pptx$/i,'')+'.pptx';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
 async function present(){await save();root.classList.add('ppt-presenting');try{await root.requestFullscreen();}catch{/* Inline full-window presentation remains available. */}}
 function exitPresentation(){root.classList.remove('ppt-presenting');if(dom.fullscreenElement===root)dom.exitFullscreen().catch(()=>{});}
 const exit=button('退出放映',exitPresentation);exit.className='ppt-exit-presentation';root.append(exit);
 const ribbon=createPptRibbon({root,tools,properties,status,title:record.title,save,download,present,toggleThumbnails:()=>root.classList.toggle('ppt-hide-thumbnails'),selectFirst:()=>choose(0),addSlide:()=>action('slide.add',{slide:current().number})});
 function lock(value){busy=value;tools.inert=value;body.inert=value;properties.inert=value;root.setAttribute('aria-busy',String(value));}
 async function api(action,options){
  const url=action==='history-restore'?'/api/office-ppt-history/'+encodeURIComponent(record.projectId)+'/'+encodeURIComponent(record.documentId):base+'/'+action;
  const response=await fetch(url,{...options,signal:AbortSignal.timeout(65000)});
  let result;try{result=await response.json();}catch{throw Error('服务返回异常，请重新读取文件核对保存结果');}
  if(!response.ok)throw Object.assign(Error(result.error||'操作失败'),{status:response.status,code:result.code});
  return result;
 }
 function executeCommand(command,fromSave=false){
  if(busy)return Promise.reject(Error('正在保存，请稍后'));
  const operation=applyCommand(command,fromSave);inFlight=operation;
  operation.finally(()=>{if(inFlight===operation)inFlight=null;}).catch(()=>{});
  return operation;
 }
 async function applyCommand({name,args={},expectedRevision},fromSave=false){
  if(destroyed)throw Error('编辑器已关闭');
  if(busy)throw Error('正在保存，请稍后');
  if(uncertain)throw Error('上次保存结果待核对，请重新打开文件后再操作');
  if(pending&&!fromSave)throw Error('存在未保存文字，请先保存当前草稿');
  if(expectedRevision!==record.fileRevision)throw Object.assign(Error('文档版本已变化，请重新读取'),{status:409});
  const history=name==='history.undo'?undo:name==='history.redo'?redo:null;
  if(history&&!history.length)throw Error('没有可'+(name==='history.undo'?'撤销':'重做')+'的操作');
  const previousRevision=record.fileRevision,previousIds=new Set(current()?.shapes.map(s=>s.id));
  lock(true);status.textContent='正在保存…';let committed=false;
  try{
   const result=await api(history?'history-restore':'command',{method:'POST',headers:{'Content-Type':'application/json','X-Workbench-Request':'office-documents'},body:JSON.stringify(history?{expectedRevision,revision:history.at(-1)}:{expectedRevision,command:{...args,op:name}})});
   committed=true;record=result.document;if(fromSave)pending=null;
   if(history){history.pop();(name==='history.undo'?redo:undo).push(previousRevision);}else{undo.push(previousRevision);redo.length=0;}
   onSaved(record);
   const latest=await api('view');record=latest.document;view=latest.view;
   if(name==='slide.add'||name==='slide.duplicate')selectedSlide=args.slide;
   if(name==='slide.move')selectedSlide=args.to-1;
   selectedSlide=Math.min(selectedSlide,view.slides.length-1);
   if(name==='shape.addText'||name==='ppt.image.insert')selectedId=current()?.shapes.find(s=>!previousIds.has(s.id))?.id||null;
   if(!selected())selectedId=null;
   render();status.textContent='已保存 · 版本 '+record.fileRevision;return {document:record};
  }catch(e){
   // No blind replay after a lost response; retain unsaved text and require a fresh read.
   if(committed||!e.status||e.status===409)uncertain=true;
   status.textContent=(committed?'已保存，刷新失败：':'')+e.message+(uncertain?'；请重新打开文件核对。':'');throw e;
  }finally{lock(false);}
 }
 async function save(){
  clearTimeout(saveTimer);
  if(busy&&inFlight)await inFlight;
  if(uncertain)throw Error('保存结果待核对，请重新打开文件');
  if(pending)await executeCommand(pending,true);
  return {document:record};
 }
 async function action(name,args){await save();return executeCommand({name,args,expectedRevision:record.fileRevision});}
 async function choose(index,id=null){await save();selectedSlide=index;selectedId=id;render();}
 function geometry(shape){return Object.fromEntries(['x','y','width','height'].map(k=>[k,shape[k]]));}
 function surface(slide,thumbnail=false){
  const canvas=make('div','ppt-canvas');canvas.style.aspectRatio=slide.width+'/'+slide.height;
  canvas.style.background=/^#[\da-f]{6}$/i.test(slide.background)?slide.background:'#fff';
  for(const shape of slide.shapes||[]){
   if(!['x','y','width','height'].every(k=>Number.isFinite(shape[k])))continue;
   const box=make('div','ppt-object'+(!thumbnail&&shape.id===selectedId?' is-selected':''));
   for(const [k,dimension] of [['left','x'],['top','y'],['width','width'],['height','height']])box.style[k]=100*shape[dimension]/(['left','width'].includes(k)?slide.width:slide.height)+'%';
   if(shape.rotation)box.style.transform=`rotate(${shape.rotation}deg)`;
   if(shape.imageDataUrl&&/^data:image\/(png|jpeg|gif);base64,/.test(shape.imageDataUrl)){
    const img=make('img');img.src=shape.imageDataUrl;img.alt=shape.name||'图片';img.draggable=false;box.append(img);
   }else{
    box.textContent=shape.text||'';
    box.style.fontSize=(shape.fontSize||18)*12700/slide.width*100+'cqw';
    box.style.fontWeight=shape.bold?'700':'400';box.style.fontStyle=shape.italic?'italic':'normal';
    if(shape.fontFace)box.style.fontFamily=shape.fontFace;box.style.textDecoration=shape.underline?'underline':'none';
    box.style.textAlign=({l:'left',ctr:'center',r:'right',just:'justify'})[shape.align]||'left';
    if(/^#[\da-f]{6}$/i.test(shape.color))box.style.color=shape.color;
   }
   if(!thumbnail){
    if(shape.id===selectedId&&shape.editable){
     box.contentEditable='true';box.setAttribute('aria-label','画布文字');
     box.oninput=()=>{const text=box.innerText;pending=text===shape.text?null:{name:'shape.text',expectedRevision:record.fileRevision,args:{slide:slide.number,shapeId:shape.id,expectedText:shape.text,text}};const area=properties.querySelector('textarea');if(area)area.value=text;status.textContent='正在编辑…';autosave();};
    }
    box.tabIndex=0;box.setAttribute('role','button');box.setAttribute('aria-label','选择 '+(shape.name||shape.text||'对象'));
    let drag=null,moved=false;
    box.onclick=()=>{if(moved){moved=false;return;}if(shape.id!==selectedId)choose(selectedSlide,shape.id).catch(report);};
    box.onkeydown=e=>{if(e.key==='Enter'&&!box.isContentEditable){e.preventDefault();choose(selectedSlide,shape.id).catch(report);}};
    box.onpointerdown=e=>{if(busy||pending||uncertain||!shape.movable||e.button!==0||box.isContentEditable)return;drag={x:e.clientX,y:e.clientY};moved=false;box.setPointerCapture(e.pointerId);};
    box.onpointermove=e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>5)moved=true;if(moved)box.style.translate=dx+'px '+dy+'px';};
    box.onpointercancel=()=>{drag=null;box.style.translate='';};
    box.onpointerup=e=>{
     if(!drag)return;const start=drag;drag=null;box.style.translate='';if(!moved)return;
     const rect=canvas.getBoundingClientRect();selectedId=shape.id;
     action('shape.geometry',{slide:slide.number,shapeId:shape.id,expectedGeometry:geometry(shape),x:Math.round(shape.x+(e.clientX-start.x)*slide.width/rect.width),y:Math.round(shape.y+(e.clientY-start.y)*slide.height/rect.height)}).catch(report);
    };
   }
   canvas.append(box);
  }
  return canvas;
 }
 function field(label,value,type='number'){
  const wrap=make('label','',label),input=make('input');input.type=type;input.value=value;input.setAttribute('aria-label',label);wrap.append(input);return {wrap,input};
 }
 function render(){
  if(destroyed)return;
  tools.replaceChildren();rail.replaceChildren();workspace.replaceChildren();properties.replaceChildren();
  const slide=current();if(!slide){status.textContent='文件没有幻灯片';return;}
  const add=button('新建页',()=>action('slide.add',{slide:slide.number})),duplicate=button('复制页',()=>action('slide.duplicate',{slide:slide.number}));tools.append(add,duplicate);
  const undoButton=button('撤销',()=>action('history.undo',{})),redoButton=button('重做',()=>action('history.redo',{}));undoButton.disabled=!undo.length;redoButton.disabled=!redo.length;
  tools.append(undoButton,redoButton);
  const more=make('details','ppt-more'),moreTitle=make('summary','','更多');more.append(moreTitle);
  const remove=button('删除页',()=>action('slide.delete',{slide:slide.number}));remove.disabled=view.slides.length<=1;more.append(remove);
  const up=button('上移',()=>action('slide.move',{slide:slide.number,to:slide.number-1})),down=button('下移',()=>action('slide.move',{slide:slide.number,to:slide.number+1}));up.disabled=selectedSlide===0;down.disabled=selectedSlide===view.slides.length-1;tools.append(up,down);
  const addText=button('文本框',()=>action('shape.addText',{slide:slide.number,text:'输入文字',x:Math.round(slide.width*.25),y:Math.round(slide.height*.45),width:Math.round(slide.width*.5),height:Math.round(slide.height*.2)}));tools.append(addText);
  const upload=make('input');upload.type='file';upload.accept='image/png,image/jpeg';upload.hidden=true;
  upload.onchange=async()=>{const file=upload.files[0];if(!file)return;try{
   if(file.size>1300000)throw Error('请选择小于 1.3 MB 的 PNG / JPEG 图片');
   const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('图片读取失败'));reader.readAsDataURL(file);});
   const img=new Image();img.src=data;await img.decode();const width=Math.round(slide.width*.4),height=Math.round(width*img.naturalHeight/img.naturalWidth);
   await action('ppt.image.insert',{slide:slide.number,data,x:Math.round(slide.width*.1),y:Math.round(slide.height*.1),width,height});
  }catch(e){report(e);}finally{upload.value='';}};
  const addImage=button('图片',()=>upload.click());tools.append(addImage,upload,more);
  view.slides.forEach((item,i)=>{
   const thumb=button('',()=>choose(i));thumb.className='ppt-thumbnail'+(i===selectedSlide?' is-selected':'');thumb.setAttribute('aria-label','第 '+(i+1)+' 页');thumb.setAttribute('aria-current',String(i===selectedSlide));thumb.append(make('span','ppt-page-number',i+1),surface(item,true));rail.append(thumb);
  });
  workspace.append(surface(slide));
  const shape=selected();
  if(shape){
   if(shape.editable){
    const area=make('textarea');area.value=shape.text;area.setAttribute('aria-label','幻灯片文字');area.rows=3;
    area.oninput=()=>{pending=area.value===shape.text?null:{name:'shape.text',expectedRevision:record.fileRevision,args:{slide:slide.number,shapeId:shape.id,expectedText:shape.text,text:area.value}};status.textContent=pending?'文字尚未保存':'已保存';const box=workspace.querySelector('[contenteditable=true]');if(box)box.textContent=area.value;autosave();};
    properties.append(area,button('保存文字',save));
    const format=values=>action('shape.format',{slide:slide.number,shapeId:shape.id,...values});
    const font=make('select');font.setAttribute('aria-label','字体名称');for(const face of [...new Set([shape.fontFace||'微软雅黑','微软雅黑','宋体','黑体','等线','Arial','Times New Roman'])]){const option=make('option','',face);option.value=face;font.append(option);}font.onchange=()=>format({fontFace:font.value}).catch(report);properties.append(font);
    const size=field('字号',shape.fontSize||18);size.input.min='6';size.input.max='96';size.input.onchange=()=>format({fontSize:Number(size.input.value)}).catch(report);
    const color=field('颜色',/^#[\da-f]{6}$/i.test(shape.color)?shape.color:'#000000','color');color.input.onchange=()=>format({color:color.input.value}).catch(report);
    const bold=button('加粗',()=>format({bold:!shape.bold}));bold.setAttribute('aria-pressed',String(Boolean(shape.bold)));
    properties.append(size.wrap,color.wrap,bold,button('斜体',()=>format({italic:!shape.italic})),button('下划线',()=>format({underline:!shape.underline})),button('左对齐',()=>format({align:'l'})),button('居中',()=>format({align:'ctr'})),button('右对齐',()=>format({align:'r'})));
   }
   if(shape.movable){
    const dimensions=make('details','ppt-dimensions');dimensions.append(make('summary','','位置与大小'));const fields=make('div');dimensions.append(fields);
    const inputs={};for(const [key,label] of [['x','X (cm)'],['y','Y (cm)'],['width','宽 (cm)'],['height','高 (cm)']]){const f=field(label,Number((shape[key]/360000).toFixed(3)));f.input.step='0.1';inputs[key]=f.input;fields.append(f.wrap);}
    fields.append(button('应用位置尺寸',()=>action('shape.geometry',{slide:slide.number,shapeId:shape.id,expectedGeometry:geometry(shape),...Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,Math.round(Number(input.value)*360000)]))})));properties.append(dimensions);
   }
   if(['sp','pic'].includes(shape.type))properties.append(button('删除对象',()=>action('shape.delete',{slide:slide.number,shapeId:shape.id})));
  }
  const note=make('details','ppt-display-note'),summary=make('summary','','显示说明');note.append(summary,make('p','','基础预览显示明确坐标的文本和图片。母版、主题、图表和组合对象保留在原文件中，请在 PowerPoint 中核对完整效果。'));workspace.append(note);
  if(shape)properties.prepend(make('h2','ppt-inspector-title',shape.type==='pic'?'图片格式':'对象格式'));
  ribbon.update({add,duplicate,undo:undoButton,redo:redoButton,remove,up,down,text:addText,image:addImage,upload});
 }
 render();status.textContent='已打开 · '+view.slides.length+' 页';
 const shortcut=e=>{
  if(root.classList.contains('ppt-presenting')){
   if(e.key==='Escape'){exitPresentation();return;}
   if(['ArrowRight','ArrowDown','PageDown','ArrowLeft','ArrowUp','PageUp'].includes(e.key)){e.preventDefault();const delta=['ArrowRight','ArrowDown','PageDown'].includes(e.key)?1:-1;choose(Math.max(0,Math.min(view.slides.length-1,selectedSlide+delta))).catch(report);return;}
  }
  if(!(e.ctrlKey||e.metaKey))return;
  const key=e.key.toLowerCase();if(key==='s'){e.preventDefault();save().catch(report);}
  // Preserve the browser's native text undo while a text input is being edited.
  if(['INPUT','TEXTAREA'].includes(e.target.tagName)||e.target.isContentEditable)return;
  if(key==='z'||key==='y'){e.preventDefault();action(key==='y'||e.shiftKey?'history.redo':'history.undo',{}).catch(report);}
 };
 dom.addEventListener('keydown',shortcut);
 return {read:()=>({document:record,view,dirty:Boolean(pending),uncertain,canUndo:undo.length>0,canRedo:redo.length>0}),save,executeCommand:command=>executeCommand(command),get dirty(){return Boolean(pending)||uncertain;},get busy(){return busy;},destroy(){destroyed=true;clearTimeout(saveTimer);dom.removeEventListener('keydown',shortcut);ribbon.destroy();dom.body.classList.remove('ppt-editor-mounted');root.remove();}};
}

// Screenshot-led Office ribbon. Every enabled control uses an existing editor action.
const paths={
 home:'M3 11 12 3l9 8v10h-6v-7H9v7H3Z',plus:'M12 3v18M3 12h18',check:'M8 12l3 3 6-7M22 12a10 10 0 1 1-4-8',
 star:'m12 2 3 6.6 7 1-5 5 1.2 7.4L12 18.5 5.8 22 7 14.6l-5-5 7-1Z',folder:'M3 6h7l2 3h9v12H3Z',
 undo:'M8 5 3 10l5 5M3 10h11a7 7 0 0 1 0 14',redo:'m16 5 5 5-5 5m5-5H10a7 7 0 0 0 0 14',
 text:'M3 3h18v18H3ZM7 17l5-11 5 11M9 13h6',shapes:'M14 8h8v14H8v-8M12 7A5 5 0 1 1 2 7a5 5 0 0 1 10 0',
 image:'M3 3h18v18H3ZM3 17l6-6 5 5 3-3 4 4M16 7h.01',paragraph:'M3 4h18M3 9h14M3 14h18M3 19h14',
 pen:'M14 4H3v17h17V10M9 16l1-5L19 2l3 3-9 9Z',animation:'M2 6h6M1 11h5M3 16h4m9-14 2.5 6 6.5.5-5 4.5 1.5 6.5L16 16l-5.5 3.5L12 13 7 8.5l6.5-.5Z',
 magic:'M3 5h5M1 10h5M3 15h5m8-13-7 11h6l-1 9 8-12h-7Z',page:'M4 2h16v20H4ZM8 6h8M8 17h8',
 copy:'M8 8h14v14H8ZM16 8V2H2v14h6',plug:'M7 2v5m10-5v5M4 7h16v9a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4ZM12 20v4',
 print:'M6 8V2h12v6M6 18H2V8h20v10h-4M6 14h12v8H6Z',download:'M12 2v14m-6-6 6 6 6-6M3 15v7h18v-7',
 play:'M2 3h20v15H2Zm7 3 7 4.5L9 15ZM8 22h8m-4-4v4',menu:'M3 5h18M3 12h18M3 19h18',
 up:'m6 14 6-6 6 6',down:'m6 10 6 6 6-6',trash:'M3 5h18M9 5V2h6v3M6 5l1 17h10l1-17M10 9v8m4-8v8',
 save:'M3 2h15l4 4v16H2V2ZM6 2v7h11V2M6 22V13h12v9',grid:'M3 3h18v18H3ZM9 3v18M3 9h18M3 15h18',search:'M16 16l6 6M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0'
};
function icon(doc,name){
 const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.6');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');
 const path=doc.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[name]||paths.page);svg.append(path);return svg;
}
export function createPptRibbon({root,tools,properties,status,title,save,download,present,toggleThumbnails,selectFirst,addSlide}){
 const doc=root.ownerDocument;
 const el=(tag,cls,text)=>{const n=doc.createElement(tag);n.className=cls||'';if(text)n.textContent=text;return n;};
 const invoke=fn=>()=>Promise.resolve().then(fn).catch(e=>{status.textContent=e.message;});
 const btn=(label,name,fn,disabled=false)=>{const b=el('button','ppt-ribbon-button');b.type='button';b.title=disabled?label+'（当前版本暂未支持）':label;b.setAttribute('aria-label',label);b.disabled=disabled;b.append(icon(doc,name),el('span','',label));if(fn)b.onclick=invoke(fn);return b;};
 const header=el('header','ppt-filebar'),tabs=el('nav','ppt-ribbon-tabs');tabs.setAttribute('aria-label','PPT 功能选项卡');
 const home=btn('第一页','home',selectFirst);home.classList.add('ppt-icon-button');
 const add=btn('新建幻灯片','plus',addSlide);add.classList.add('ppt-icon-button');
 const name=el('h1','ppt-filename',title||'项目汇报');
 const saved=el('div','ppt-file-status');saved.append(icon(doc,'check'),el('span','','所有编辑内容自动保存到本机'));
 const favorite=btn('收藏','star',null,true),folder=btn('项目文件','folder',null,true);favorite.classList.add('ppt-icon-button');folder.classList.add('ppt-icon-button');
 const right=el('div','ppt-file-actions'),show=btn('放映','play',present),saveButton=btn('保存到本机','save',save),exportButton=btn('下载副本','download',download);show.classList.add('ppt-icon-button');saveButton.classList.add('ppt-icon-button');exportButton.classList.add('ppt-primary');
 right.append(show,saveButton,exportButton);header.append(home,add,el('i','ppt-file-divider'),name,favorite,folder,saved,right);root.prepend(header,tabs);
 let active='开始';let sources=null;
 function selectTab(label){active=label;render();}
 const tabSpecs=[['开始',true],['插入',true],['美化',false],['切换',false],['动画',false],['放映',true],['审阅',false],['视图',true],['效率工具',false]];
 for(const [label,enabled] of tabSpecs){const b=el('button','',label);b.type='button';b.dataset.tab=label;b.setAttribute('role','tab');b.disabled=!enabled;b.title=enabled?label:label+'（当前版本暂未支持）';b.onclick=()=>selectTab(label);tabs.append(b);}
 tabs.setAttribute('role','tablist');
 function decorate(button,name,label){button.classList.add('ppt-ribbon-button');button.setAttribute('aria-label',label);button.title=label;button.replaceChildren(icon(doc,name),el('span','',label));return button;}
 function group(...children){const g=el('div','ppt-ribbon-group');g.append(...children);return g;}
 function focusProperty(label){const input=properties.querySelector(`[aria-label="${label}"]`);input?.focus();}
 function render(){
  if(!sources)return;
  tabs.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('is-active',b.dataset.tab===active);b.setAttribute('aria-selected',String(b.dataset.tab===active));});
  tools.replaceChildren();
  const history=group(decorate(sources.undo,'undo','撤销'),decorate(sources.redo,'redo','重做'));history.classList.add('ppt-history-group');
  const pageMenu=el('details','ppt-ribbon-menu');const summary=el('summary','ppt-ribbon-button');summary.append(icon(doc,'plus'),el('span','','插入'));pageMenu.append(summary);
  const popup=el('div','ppt-ribbon-popup');popup.append(sources.add,sources.duplicate,sources.up,sources.down,sources.remove);pageMenu.append(popup);
  const hasText=Boolean(properties.querySelector('textarea'));
  if(active==='开始'){
   tools.append(history,group(pageMenu,decorate(sources.text,'text','文本框'),btn('形状','shapes',null,true)),group(btn('字体','text',()=>focusProperty('字体名称'),!hasText),btn('段落','paragraph',()=>properties.querySelector('textarea')?.focus(),!hasText)),group(btn('绘图','pen',null,true)),group(btn('动画','animation',null,true),btn('快捷美化','magic',null,true)),group(btn('页面设置','page',null,true)),group(btn('格式转换','copy',null,true)),group(btn('插件','plug',null,true)),group(decorate(sources.image,'image','图片'),btn('下载','download',download)));
  }else if(active==='插入'){
   tools.append(group(decorate(sources.add,'plus','空白页面'),btn('模板页面','page',null,true),btn('AI页面','magic',null,true)),group(decorate(sources.text,'text','文本框'),btn('形状','shapes',null,true),decorate(sources.image,'image','图片')),group(btn('音频','play',null,true),btn('视频','play',null,true)),group(btn('表格','grid',null,true),btn('链接','plug',null,true),btn('图表','grid',null,true)),group(btn('页脚','page',null,true)),group(decorate(sources.duplicate,'copy','复制页')));
  }else if(active==='放映'){
   tools.append(group(btn('从头演示','play',async()=>{await selectFirst();await present();}),btn('从当前页演示','play',present),btn('演讲者视图','page',null,true)),group(btn('下载','download',download)));
  }else{
   const grid=el('label','ppt-view-checkbox'),checkbox=el('input');checkbox.type='checkbox';checkbox.checked=root.classList.contains('ppt-gridlines');checkbox.onchange=()=>root.classList.toggle('ppt-gridlines',checkbox.checked);grid.append(checkbox,doc.createTextNode('网格线'));
   tools.append(group(btn('普通视图','page',()=>root.classList.remove('ppt-hide-thumbnails')),btn('幻灯片母版','page',null,true)),group(grid),group(btn('缩略图','grid',toggleThumbnails),btn('适应窗口','page',()=>{root.classList.remove('ppt-hide-thumbnails');})),group(btn('放映','play',present)));
  }
  const compact=btn('工具栏切换','down',()=>root.classList.toggle('ppt-compact-ribbon'));compact.classList.add('ppt-toolbar-toggle');tools.append(compact);
  if(!hasText)for(const label of ['字体','段落']){const control=tools.querySelector(`[aria-label="${label}"]`);if(control)control.title='请先选择文本框';}
  tools.append(sources.upload);root.classList.toggle('ppt-has-selection',properties.childElementCount>0);
 }
 const observer=new MutationObserver(()=>{saved.lastChild.textContent=/正在保存/.test(status.textContent)?'正在保存到本机…':/尚未保存|正在编辑/.test(status.textContent)?'正在编辑，稍后自动保存':/失败|错误|核对|未完成/.test(status.textContent)?status.textContent:'所有编辑内容自动保存到本机';});observer.observe(status,{childList:true,characterData:true,subtree:true});
 return {update(next){sources=next;render();},destroy(){observer.disconnect();header.remove();tabs.remove();}};
}
