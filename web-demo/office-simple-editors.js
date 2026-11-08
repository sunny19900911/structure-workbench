// Basic native-file operations share the same command path with MCP.
export async function mountSimpleEditor({element,document:initial,view:initialView,onSaved=()=>{}}){
 let record=initial,view=initialView,busy=false,selectedSheet=0,selectedSlide=0,pending=null;
 const root=document.createElement('div');root.className='office-simple-editor';element.append(root);
 const status=document.createElement('p');status.setAttribute('role','status');root.append(status);
 const navigation=document.createElement('div'),surface=document.createElement('div');navigation.className='office-sheet-tabs';surface.className='office-native-surface';root.append(navigation,surface);
 const url=action=>'/api/office-documents/'+record.projectId+'/'+record.documentId+'/'+action;
 const button=(label,action)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>Promise.resolve(action()).catch(e=>status.textContent=e.message);return b;};
 async function api(action,options){const response=await fetch(url(action),options);const value=await response.json();if(!response.ok)throw Object.assign(Error(value.error||'操作未完成'),{status:response.status,code:value.code});return value;}
 async function executeCommand(command){
  if(busy)throw Error('正在保存文档，请稍后');
  if(command.expectedRevision!==record.fileRevision)throw Object.assign(Error('文档版本已变化，请重新读取'),{status:409});
  busy=true;surface.inert=true;status.textContent='正在保存到本机…';
  try{
   const changed=await api('command',{method:'POST',headers:{'Content-Type':'application/json','X-Workbench-Request':'office-documents'},body:JSON.stringify({expectedRevision:command.expectedRevision,command:{op:command.name,...command.args}})});
   record=changed.document;if(pending===command)pending=null;const latest=await api('view');record=latest.document;view=latest.view;render();status.textContent='已保存 · 版本 '+record.fileRevision;onSaved(record);return {document:record};
  }catch(e){status.textContent=e.message;throw e;}finally{busy=false;surface.inert=false;}
 }
 function sheet(){
  const sheets=view.sheets||[];navigation.replaceChildren(...sheets.map((item,i)=>button(item.name,async()=>{await save();selectedSheet=i;render();})));
  const current=sheets[selectedSheet];if(!current)return;
  const table=document.createElement('table');table.className='office-spreadsheet';
  const parsed=(current.cells||[]).map(cell=>{const m=/^([A-Z]+)(\d+)$/.exec(cell.address);if(!m)return null;let column=0;for(const c of m[1])column=column*26+c.charCodeAt(0)-64;return {...cell,row:+m[2],column};}).filter(Boolean);
  const maxRow=Math.min(500,Math.max(20,...parsed.map(c=>c.row))),maxCol=Math.min(60,Math.max(8,...parsed.map(c=>c.column))),cells=new Map(parsed.map(c=>[c.address,c]));
  const letters=index=>{let s='';for(;index;index=Math.floor((index-1)/26))s=String.fromCharCode(65+(index-1)%26)+s;return s;};
  const head=document.createElement('tr');for(let c=0;c<=maxCol;c++){const th=document.createElement('th');th.textContent=c?letters(c):'';head.append(th);}table.append(head);
  for(let r=1;r<=maxRow;r++){const tr=document.createElement('tr'),th=document.createElement('th');th.textContent=r;tr.append(th);for(let c=1;c<=maxCol;c++){
   const address=letters(c)+r,cell=cells.get(address)||{address,text:''},td=document.createElement('td'),input=document.createElement('input');
   const original=cell.formula?'='+cell.formula:String(cell.text??cell.value??'');input.value=original;input.setAttribute('aria-label',current.name+' '+address);input.title=cell.formula?'公式；修改后须重新计算结果':address;
   input.oninput=()=>{pending=input.value===original?null:{name:'cell.set',expectedRevision:record.fileRevision,args:{sheet:current.name,address,expectedText:original,text:input.value}};for(const other of surface.querySelectorAll('input'))other.disabled=Boolean(pending)&&other!==input;};
   input.onchange=async()=>{const text=input.value;try{await save();}catch{input.value=text;input.style.outline='2px solid #b64646';}};
   const style=typeof cell.style==='number'?(view.styles?.[cell.style]||current.styles?.[cell.style]||{}):cell.style||{};if(style.bold)input.style.fontWeight='bold';const color=String(style.fontColor||'').slice(-6),fill=String(style.fillColor||'').slice(-6);if(/^[A-Fa-f0-9]{6}$/.test(color))input.style.color='#'+color;
   if(/^[A-Fa-f0-9]{6}$/.test(fill))td.style.background='#'+fill;
   if(style.fontSize)input.style.fontSize=style.fontSize+'pt';if(style.horizontal)input.style.textAlign=style.horizontal;
   td.append(input);tr.append(td);
  }table.append(tr);}surface.append(table);
  if(parsed.some(c=>c.row>maxRow||c.column>maxCol)){const note=document.createElement('p');note.textContent='当前页面显示前500行、60列，其余单元格仍保存在原文件中。';surface.append(note);}
 }
 function slides(){
  const all=view.slides||[],selector=document.createElement('select');selector.setAttribute('aria-label','幻灯片');all.forEach((s,i)=>selector.add(new Option('第 '+(s.number||i+1)+' 页 / '+all.length,i)));selector.value=selectedSlide;
  selector.onchange=()=>save().then(()=>{selectedSlide=Number(selector.value);render();}).catch(e=>status.textContent=e.message);
  navigation.replaceChildren(button('上一页',async()=>{await save();selectedSlide=Math.max(0,selectedSlide-1);render();}),selector,button('下一页',async()=>{await save();selectedSlide=Math.min(all.length-1,selectedSlide+1);render();}));
  const current=all[selectedSlide];if(!current)return;
  const canvas=document.createElement('div');canvas.className='office-slide';const width=current.width||9144000,height=current.height||5143500;canvas.style.aspectRatio=width+'/'+height;
  const background=current.background;if(typeof background==='string'&&/^#?[A-Fa-f0-9]{6}$/.test(background))canvas.style.background=background.startsWith('#')?background:'#'+background;
  const editor=document.createElement('div');editor.className='office-shape-editor';editor.textContent='点击文字框修改内容。';
  for(const shape of current.shapes||[]){
   const box=document.createElement('div');box.className='office-slide-shape';box.style.cssText=`left:${shape.x/width*100}%;top:${shape.y/height*100}%;width:${shape.width/width*100}%;height:${shape.height/height*100}%;`;
   if(shape.imageDataUrl&&/^data:image\/(png|jpeg|webp);base64,/.test(shape.imageDataUrl)){const img=document.createElement('img');img.src=shape.imageDataUrl;img.alt='幻灯片图片';box.append(img);}
   else{box.textContent=shape.text||'';if(shape.fontSize)box.style.fontSize=Math.max(7,shape.fontSize*0.75)+'px';if(/^#?[0-9A-Fa-f]{6}$/.test(shape.color||''))box.style.color=shape.color.startsWith('#')?shape.color:'#'+shape.color;}
   if(Number.isFinite(shape.x)&&Number.isFinite(shape.y)){
    let drag=null,moved=false;
    box.ondragstart=e=>e.preventDefault();box.onpointerdown=e=>{if(busy||pending)return;drag={x:e.clientX,y:e.clientY};moved=false;box.setPointerCapture(e.pointerId);};
    box.onpointermove=e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>5)moved=true;if(moved)box.style.transform=`translate(${dx}px,${dy}px)`;};
    box.onpointerup=e=>{if(!drag)return;const start=drag;drag=null;if(!moved)return;const rect=canvas.getBoundingClientRect();box.style.transform='';e.preventDefault();executeCommand({name:'shape.move',expectedRevision:record.fileRevision,args:{slide:current.number||selectedSlide+1,shapeId:shape.id,expectedX:shape.x,expectedY:shape.y,x:Math.round(shape.x+(e.clientX-start.x)*width/rect.width),y:Math.round(shape.y+(e.clientY-start.y)*height/rect.height)}}).catch(()=>{});};
    box.addEventListener('click',e=>{if(moved){e.stopImmediatePropagation();moved=false;}},true);
   }
   if(shape.text!=null&&shape.editable!==false){box.tabIndex=0;box.setAttribute('role','button');box.setAttribute('aria-label','编辑 '+String(shape.text).slice(0,40));box.onclick=()=>{
    if(pending){status.textContent='先保存当前文字';return;}editor.replaceChildren();const area=document.createElement('textarea');area.value=shape.text;area.setAttribute('aria-label','幻灯片文字');area.oninput=()=>{pending={name:'shape.text',expectedRevision:record.fileRevision,args:{slide:current.number||selectedSlide+1,shapeId:shape.id,expectedText:shape.text,text:area.value}};};editor.append(area,button('保存文字',save));
   };box.onkeydown=e=>{if(e.key==='Enter')box.click();};}canvas.append(box);
  }surface.append(canvas,editor);
 }
 function render(){surface.replaceChildren();if(record.type==='xlsx')sheet();else slides();if(view.warnings?.length){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='文件显示说明';details.append(summary);for(const warning of view.warnings){const p=document.createElement('p');p.textContent=typeof warning==='string'?warning:warning.message||JSON.stringify(warning);details.append(p);}surface.append(details);}}
 render();
 async function save(){if(busy)throw Error('文档正在保存');if(pending)await executeCommand(pending);return {document:record};}
 return {read:()=>({document:record,dirty:Boolean(pending),view}),save,executeCommand,get dirty(){return Boolean(pending);},get busy(){return busy;},destroy:()=>root.remove()};
}
