import './office-excel-editor.css';
import {EXCEL_COMMANDS} from './office-excel-commands.js';
import {mountExcelRibbon} from './office-excel-ribbon.js';
import {workbookParameters,parameterInput} from './office-excel-parameters.js';

export function columnName(n){let out='';for(;n;n=Math.floor((n-1)/26))out=String.fromCharCode(65+(n-1)%26)+out;return out;}
export function coordinate(address){const m=/^([A-Z]{1,3})([1-9][0-9]{0,6})$/.exec(address||'');if(!m)throw Error('单元格地址无效');let c=0;for(const s of m[1])c=c*26+s.charCodeAt(0)-64;const r=Number(m[2]);if(c>16384||r>1048576)throw Error('单元格地址越界');return [r,c];}
export function rectangle(range){const parts=String(range).split(':');if(parts.length>2)throw Error('选区无效');const [r1,c1]=coordinate(parts[0]),[r2,c2]=coordinate(parts.at(-1));if((Math.abs(r2-r1)+1)*(Math.abs(c2-c1)+1)>10000)throw Error('选区不能超过 10000 格');return [Math.min(r1,r2),Math.min(c1,c2),Math.max(r1,r2),Math.max(c1,c2)];}
export function parseTSV(text){
 // Spreadsheet clipboard uses quoted fields for tabs/newlines; support CRLF and quotes.
 const rows=[[]];let cell='',quoted=false,start=true;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;}
  else if(c==='"'&&start){quoted=true;start=false;}else if(c==='\t'){rows.at(-1).push(cell);cell='';start=true;}else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;rows.at(-1).push(cell);rows.push([]);cell='';start=true;}else{cell+=c;start=false;}}
 if(quoted)throw Error('粘贴文字引号不完整');rows.at(-1).push(cell);if(rows.length>1&&rows.at(-1).length===1&&rows.at(-1)[0]===''&&/[\r\n]$/.test(text))rows.pop();
 const width=Math.max(...rows.map(row=>row.length));if(rows.length*width>10000)throw Error('一次粘贴不能超过 10000 格');return rows.map(row=>Array.from({length:width},(_,i)=>row[i]??''));
}
export const toTSV=rows=>rows.map(row=>row.map(value=>/[\t\r\n"]/.test(value)?'"'+value.replaceAll('"','""')+'"':value).join('\t')).join('\r\n');

export function displayCell(cell,styles=[],date1904=false){
 if(!cell)return '';
 if(cell.calculationStatus==='unsupported')return '未计算';
 let value=cell.formula!=null?cell.value:cell.valueType==='n'&&cell.value!==''?Number(cell.value):cell.value;
 if(value==null)return '';if(typeof value==='boolean')return value?'TRUE':'FALSE';if(typeof value!=='number'||!Number.isFinite(value))return String(value);
 const fmt=styles[cell.style]?.numberFormat||'General';
 if(fmt==='0')return value.toFixed(0);if(fmt==='0.00')return value.toFixed(2);if(fmt==='#,##0.00')return value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});if(fmt==='0.00%')return (value*100).toFixed(2)+'%';if(fmt==='0.00E+00')return value.toExponential(2);
 if(fmt==='yyyy-mm-dd'){
  if(value<0||value>2958465)return String(value);
  if(!date1904&&Math.floor(value)===60)return '1900-02-29';
  const epoch=Date.UTC(date1904?1904:1899,date1904?0:11,date1904?1:31);
  return new Date(epoch+(Math.floor(value)-(date1904||value<60?0:1))*86400000).toISOString().slice(0,10);
 }
 return String(value);
}

export async function mountExcelEditor({element,document:initial,view:initialView,onSaved=()=>{},request=fetch,autosaveDelay=700}){
 let record=initial,view=initialView,sheetName=view.sheets.find(s=>s.state==='visible')?.name||view.sheets[0]?.name;
 let anchor='A1',focus='A1',busy=false,destroyed=false,timer=null,savePromise=null,mutationPromise=null,editing=false,composing=false,clipboard=null;
 let pageRow=1,pageColumn=1,dragSelecting=false;const drafts=new Map(),undo=[],redo=[];
 let activeTab='开始',ribbon=null,brush=null;
 const options={gridlines:true,showZeros:true,showFormulas:false,highlight:false,dark:false,zoom:100};
 const root=document.createElement('section');root.className='office-excel';element.append(root);
 const tools=document.createElement('div');tools.className='office-excel-tools';
 const ribbonTabs=document.createElement('div');ribbonTabs.className='excel-ribbon-tabs';
 const formulaRow=document.createElement('div');formulaRow.className='office-excel-formula';
 const position=document.createElement('input');position.className='excel-address';position.setAttribute('aria-label','单元格或选区');
 const formula=document.createElement('input');formula.className='excel-expression';formula.setAttribute('aria-label','公式或内容');
 const scroll=document.createElement('div');scroll.className='office-excel-scroll';
 const tabs=document.createElement('div');tabs.className='office-excel-tabs';
 const status=document.createElement('p');status.setAttribute('role','status');root.append(ribbonTabs,tools,formulaRow,scroll,tabs,status);formulaRow.append(position,formula);
 const base=()=>'/api/office-documents/'+encodeURIComponent(record.projectId)+'/'+encodeURIComponent(record.documentId);
 const current=()=>view.sheets.find(s=>s.name===sheetName);
 const map=()=>new Map((current()?.cells||[]).map(c=>[c.address,c]));
 const raw=address=>drafts.get(address)?.text??map().get(address)?.text??'';
 const range=()=>{const [r1,c1,r2,c2]=rectangle(anchor+':'+focus);return columnName(c1)+r1+':'+columnName(c2)+r2;};
 const fail=e=>{status.textContent=e.message||String(e);status.className='excel-error';};
 const button=(label,action)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>Promise.resolve().then(action).catch(fail);return b;};
 async function api(action,options={}){const r=await request(base()+'/'+action,options);if(!r.ok){let e={};try{e=await r.json();}catch{}throw Object.assign(Error(e.error||'文件操作失败'),{status:r.status,code:e.code});}return r;}
 function updateState(text){status.className='';status.textContent=text;}
 function stage(address,text){if(busy||destroyed)return;const original=map().get(address)?.text??'';if(original===text)drafts.delete(address);else drafts.set(address,{address,expectedText:original,text});updateState(drafts.size?'有修改 · 等待保存':'已保存 · 版本 '+record.fileRevision);clearTimeout(timer);if(drafts.size&&!composing)timer=setTimeout(()=>save().catch(fail),autosaveDelay);}
 function select(address,extend=false){coordinate(address);rectangle((extend?anchor:address)+':'+address);if(!extend)anchor=address;focus=address;position.value=range();formula.value=raw(focus);editing=false;paintSelection();const cell=map().get(address);if(cell?.calculationMessage)fail(Error(address+'：'+cell.calculationMessage));}
 function paintSelection(){const [r1,c1,r2,c2]=rectangle(range()),[fr,fc]=coordinate(focus);for(const td of scroll.querySelectorAll('td[data-address]')){const [r,c]=coordinate(td.dataset.address);td.classList.toggle('selected',r>=r1&&r<=r2&&c>=c1&&c<=c2);td.classList.toggle('active',td.dataset.address===focus);td.classList.toggle('highlight',options.highlight&&(r===fr||c===fc));}ribbon?.sync();}
 async function refresh(){const latest=await(await api('view')).json();record=latest.document;view=latest.view;if(!view.sheets.some(s=>s.name===sheetName))sheetName=view.sheets.find(s=>s.state==='visible')?.name||view.sheets[0].name;render();}
 function trackMutation(promise){mutationPromise=promise;return promise.finally(()=>{if(mutationPromise===promise)mutationPromise=null;});}
 const mutate=(command,options)=>trackMutation(performMutation(command,options));
 async function performMutation(command,{history=true}={}){
  if(busy)throw Error('正在保存，请稍后');
  const active=document.activeElement,restoreInput=command.op==='cells.set'&&active?.matches?.('textarea[data-address]')?{address:active.dataset.address,start:active.selectionStart,end:active.selectionEnd,editing}:null;
  const restoreFormula=command.op==='cells.set'&&active===formula?{start:formula.selectionStart,end:formula.selectionEnd}:null;
  busy=true;root.inert=true;clearTimeout(timer);const before=record.fileRevision;updateState('正在保存到本机…');
  try{
   const changed=await(await api('command',{method:'POST',headers:{'Content-Type':'application/json','X-Workbench-Request':'office-documents'},body:JSON.stringify({expectedRevision:before,command})})).json();
   record=changed.document;if(history){undo.push(before);if(undo.length>30)undo.shift();redo.length=0;}drafts.clear();onSaved(record);
   // A committed save is acknowledged before reloading its view. Read failure must not
   // turn a committed command into a pending draft that could be replayed.
   try{await refresh();updateState('已保存 · 版本 '+record.fileRevision);}catch(e){fail(Error('已保存，但显示未刷新：'+e.message));throw e;}
   return {document:record,dirty:false};
  }finally{busy=false;root.inert=false;
   if(restoreInput){const input=scroll.querySelector(`textarea[data-address="${restoreInput.address}"]`);if(input){input.focus();if(restoreInput.editing){editing=true;input.readOnly=false;input.value=raw(restoreInput.address);input.setSelectionRange(restoreInput.start,restoreInput.end);}}}
   if(restoreFormula){formula.focus();formula.setSelectionRange(restoreFormula.start,restoreFormula.end);}
  }
 }
 async function save(){if(composing)throw Error('请完成当前文字输入');if(savePromise)return savePromise;if(mutationPromise)return mutationPromise;if(!drafts.size)return {document:record,dirty:false};savePromise=mutate({op:'cells.set',sheet:sheetName,cells:[...drafts.values()]}).finally(()=>savePromise=null);return savePromise;}
 const restore=direction=>trackMutation(performRestore(direction));
 async function performRestore(direction){
  const from=direction==='undo'?undo:redo,to=direction==='undo'?redo:undo;
  if(!from.length)throw Error(direction==='undo'?'没有可撤销操作':'没有可重做操作');
  busy=true;root.inert=true;const revision=from.at(-1),before=record.fileRevision;
  try{const bytes=await(await api('content?revision='+revision)).blob();const result=await(await api('save?expectedRevision='+before,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Workbench-Request':'office-documents'},body:bytes})).json();record=result.document;from.pop();to.push(before);onSaved(record);await refresh();updateState('已保存 · 版本 '+record.fileRevision);return {document:record,dirty:false};}
  finally{busy=false;root.inert=false;}
 }
 async function executeCommand({name,args={},expectedRevision}){
  if(destroyed)throw Error('编辑器已关闭');if(busy)throw Error('正在保存，请稍后');
  if(!Number.isInteger(expectedRevision)||expectedRevision!==record.fileRevision)throw Object.assign(Error('文件修订已改变，请重新读取'),{status:409});
  if(!EXCEL_COMMANDS.includes(name))throw Error('不支持的 Excel 命令');
  if(name==='selection.copy')return {text:copyText(),range:range(),sheet:sheetName,document:record};
  // Never silently mix an external MCP edit with a user's unsaved input.
  if(drafts.size)throw Error('当前输入尚未保存，请先保存后再执行命令');
  if(name==='sheet.select'||name==='selection.set'){
   if(!view.sheets.some(s=>s.name===args.sheet&&s.state==='visible'))throw Error('可见工作表不存在');const switched=sheetName!==args.sheet;sheetName=args.sheet;
   const [r1,c1,r2,c2]=rectangle(name==='selection.set'?args.range:'A1');anchor=columnName(c1)+r1;focus=columnName(c2)+r2;if(switched||r1<pageRow||r2>=pageRow+80)pageRow=r1;if(switched||c1<pageColumn||c2>=pageColumn+16)pageColumn=c1;render();return read();
  }
  if(name==='history.undo'||name==='history.redo')return restore(name.split('.')[1]);
  if(name==='view.options'){Object.assign(options,args);render();return read();}
  if(name==='selection.formatPainter'){brush={sheet:sheetName,source:focus};updateState('格式刷已启用 · 点击目标单元格应用');return read();}
  if(name==='selection.formula'){formula.value=args.formula;formula.focus();formula.select();updateState('请修改公式引用，再按 Enter 应用');return read();}
  if(name==='selection.aggregate'){
   const [r1,c1,r2,c2]=rectangle(range()),cells=[];
   for(let c=c1;c<=c2;c++){const address=columnName(c)+(r2+1);coordinate(address);if(raw(address)!=='')throw Error('选区下方已有内容，请先留出空白行');cells.push({address,expectedText:'',text:'='+args.function+'('+columnName(c)+r1+':'+columnName(c)+r2+')'});}
   const result=await mutate({op:'cells.set',sheet:sheetName,cells});focusCell(cells[0].address);return result;
  }
  if(name==='sheet.find'){
   if(!args.text)throw Error('请输入查找内容');const s=view.sheets.find(s=>s.name===args.sheet);if(!s)throw Error('工作表不存在');
   const matches=s.cells.filter(c=>(c.text||'').includes(args.text)).sort((a,b)=>{const x=coordinate(a.address),y=coordinate(b.address);return x[0]-y[0]||x[1]-y[1];});
   if(!matches.length)throw Error('没有找到匹配内容');const index=matches.findIndex(c=>c.address===args.after);sheetName=s.name;focusCell(matches[(index+1)%matches.length].address);updateState('找到 '+matches.length+' 处匹配');return read();
  }
  if(name==='sheet.print'){printSheet(args.sheet);return read();}
  if(name==='sheet.rename'){const result=await mutate({...args,op:name});sheetName=args.name;render();return result;}
  return mutate({...args,op:name});
 }
 async function action(name,args={}){await save();return executeCommand({name,args,expectedRevision:record.fileRevision});}
 async function insertParameter(id){
  await save();const p=workbookParameters(view).find(p=>p.id===id);if(!p?.available)throw Error('参数没有可用的计算结果');
  const textFormat=view.styles?.[map().get(focus)?.style]?.numberFormat==='@';
  return action('cell.set',{sheet:sheetName,address:focus,expectedText:raw(focus),text:parameterInput(p.value,textFormat)});
 }
 function copyText(){const cells=map(),[r1,c1,r2,c2]=rectangle(range()),rows=[];for(let r=r1;r<=r2;r++){const row=[];for(let c=c1;c<=c2;c++){const a=columnName(c)+r;row.push(drafts.get(a)?.text??displayCell(cells.get(a),view.styles,view.date1904));}rows.push(row);}return toTSV(rows);}
 async function copy(event){if(editing)return;const text=copyText();clipboard={text,sheet:sheetName,range:range(),revision:record.fileRevision};if(event){event.preventDefault();event.clipboardData.setData('text/plain',text);}else await navigator.clipboard.writeText(text);}
 async function paste(event){if(editing)return;event.preventDefault();const text=event.clipboardData.getData('text/plain');await save();
  if(clipboard&&clipboard.text===text&&clipboard.revision===record.fileRevision)await action('range.copy',{sheet:clipboard.sheet,range:clipboard.range,targetSheet:sheetName,address:focus});
  else await action('range.set',{sheet:sheetName,address:focus,values:parseTSV(text)});
 }
 function applyStyle(input,td,cell){
  const s={...(view.styles?.[cell?.style]||{}),...cell?.conditionalStyle};
  const color=v=>/^#[0-9a-f]{6}$/i.test(v||'')?v:/^[0-9a-f]{8}$/i.test(v||'')?'#'+v.slice(-6):'';
  if(s.bold)input.style.fontWeight='bold';if(s.italic)input.style.fontStyle='italic';
  input.style.textDecoration=[s.underline?'underline':'',s.strike?'line-through':''].filter(Boolean).join(' ');
  if(s.font)input.style.fontFamily=s.font;if(s.fontSize)input.style.fontSize=s.fontSize+'pt';
  input.style.textAlign=s.horizontal||(cell?.valueType==='n'||typeof cell?.value==='number'?'right':'left');
  if(color(s.fontColor))input.style.color=color(s.fontColor);if(color(s.fillColor))td.style.backgroundColor=color(s.fillColor);
  for(const [side,b] of Object.entries(s.borders||{}))td.style['border'+side[0].toUpperCase()+side.slice(1)]=(b.style==='double'?'3px double':b.style==='medium'?'2px solid':'1px solid')+' '+(color(b.color)||'#667085');
  td.style.verticalAlign=s.vertical==='center'?'middle':s.vertical||'middle';
  if(s.wrapText){input.style.whiteSpace='pre-wrap';input.style.overflowWrap='anywhere';}
 }
 function printSheet(name){
  const s=view.sheets.find(s=>s.name===name);if(!s)throw Error('工作表不存在');
  const coords=s.cells.map(c=>coordinate(c.address)),maxRow=Math.max(1,...coords.map(x=>x[0])),maxCol=Math.max(1,...coords.map(x=>x[1]));
  if(maxRow*maxCol>10000)throw Error('打印区域超过 10000 格，请在下载的 XLSX 中设置打印范围');
  document.querySelector('#excel-print-area')?.remove();const area=document.createElement('section');area.id='excel-print-area';const title=document.createElement('h2');title.textContent=name;area.append(title);const table=document.createElement('table'),cells=new Map(s.cells.map(c=>[c.address,c]));
  for(let r=1;r<=maxRow;r++){if(s.hiddenRows?.includes(r))continue;const tr=document.createElement('tr');for(let c=1;c<=maxCol;c++){const td=document.createElement('td'),span=document.createElement('span'),cell=cells.get(columnName(c)+r);span.textContent=displayCell(cell,view.styles,view.date1904);applyStyle(span,td,cell);td.append(span);tr.append(td);}table.append(tr);}area.append(table);document.body.append(area);window.print();
 }
 function render(){
  if(destroyed)return;const selected=current();if(!selected)return;
  root.classList.toggle('excel-dark',options.dark);root.classList.toggle('excel-no-grid',!options.gridlines);scroll.style.zoom=options.zoom/100;
  ribbon=mountExcelRibbon({tabs:ribbonTabs,tools,activeTab,onTab:async name=>{await save();activeTab=name;render();},run:action,selection:()=>{const [r1,c1,r2,c2]=rectangle(range());return {range:range(),address:focus,r1,c1,r2,c2};},cellStyle:()=>view.styles?.[map().get(focus)?.style]||{},sheet:current,options,onError:fail,parameters:()=>workbookParameters(view),insertParameter});
  const columnWidth=c=>Math.max(40,Math.round((selected.columnWidths?.find(x=>c>=x.min&&c<=x.max)?.width||16)*7+5));
  const table=document.createElement('table');table.setAttribute('role','grid');table.setAttribute('aria-label',selected.name);const head=document.createElement('tr');head.append(document.createElement('th'));
  for(let c=pageColumn;c<Math.min(pageColumn+16,16385);c++){const th=document.createElement('th');th.textContent=columnName(c);th.style.width=columnWidth(c)+'px';th.style.minWidth=columnWidth(c)+'px';head.append(th);}table.append(head);
  const cells=map(),merges=(selected.merges||[]).map(rectangle),hidden=new Set(selected.hiddenRows||[]);
  for(let r=pageRow;r<Math.min(pageRow+80,1048577);r++){if(hidden.has(r))continue;const tr=document.createElement('tr'),th=document.createElement('th');th.textContent=r;tr.append(th);if(selected.rowHeights?.[r])tr.style.height=selected.rowHeights[r]+'pt';
   for(let c=pageColumn;c<Math.min(pageColumn+16,16385);c++){
    const merged=merges.find(([a,b,z,d])=>r>=a&&r<=z&&c>=b&&c<=d);if(merged&&(r!==Math.max(pageRow,merged[0])||c!==Math.max(pageColumn,merged[1])))continue;
    const address=columnName(c)+r,cell=cells.get(address),td=document.createElement('td'),input=document.createElement('textarea');td.dataset.address=address;input.dataset.address=address;input.setAttribute('aria-label',selected.name+' '+address);input.value=drafts.get(address)?.text??displayCell(cell,view.styles,view.date1904);if(options.showFormulas&&cell?.formula!=null)input.value='='+cell.formula;else if(!options.showZeros&&Number(input.value)===0&&input.value!=='')input.value='';input.rows=1;input.readOnly=true;input.tabIndex=address===focus?0:-1;
    td.dataset.error=String(Boolean(cell?.calculationStatus&&cell.calculationStatus!=='calculated'));td.classList.toggle('draft',drafts.has(address));input.title=cell?.formula?'='+cell.formula+(cell.calculationMessage?' · '+cell.calculationMessage:''):address;
    applyStyle(input,td,cell);
    if(merged){td.rowSpan=Math.min(merged[2],pageRow+79)-Math.max(merged[0],pageRow)+1;td.colSpan=Math.min(merged[3],pageColumn+15)-Math.max(merged[1],pageColumn)+1;}
    const width=columnWidth(c);td.style.width=width+'px';td.style.minWidth=width+'px';
    if(selected.rowHeights?.[r]){td.style.height=selected.rowHeights[r]+'pt';input.style.height=selected.rowHeights[r]+'pt';}
    if(selected.freeze?.rows>=r){td.style.position='sticky';td.style.top=(29+Array.from({length:r-pageRow},(_,i)=>selected.rowHeights?.[i+pageRow]?selected.rowHeights[i+pageRow]*4/3:29).reduce((a,b)=>a+b,0))+'px';td.style.zIndex=2;td.style.backgroundColor||='white';}
    if(selected.freeze?.columns>=c){td.style.position='sticky';td.style.left=(44+Array.from({length:c-pageColumn},(_,i)=>columnWidth(i+pageColumn)).reduce((a,b)=>a+b,0))+'px';td.style.zIndex=3;td.style.backgroundColor||='white';}
    input.onpointerdown=e=>{if(editing&&focus===address)return;dragSelecting=true;e.preventDefault();try{select(address,e.shiftKey);input.focus();if(brush){const source=brush;brush=null;dragSelecting=false;if(source.sheet!==sheetName)throw Error('格式刷请在同一工作表使用');action('range.copyStyle',{sheet:sheetName,source:source.source,range:range()}).catch(fail);}}catch(err){dragSelecting=false;fail(err);}};input.ondblclick=()=>{dragSelecting=false;beginEdit(input);};
    input.onpointerover=e=>{if(dragSelecting&&e.buttons===1&&!editing){try{select(address,true);}catch(err){fail(err);}}};
    input.oncompositionstart=()=>{composing=true;clearTimeout(timer);};input.oncompositionend=()=>{composing=false;stage(address,input.value);formula.value=input.value;};
    input.oninput=()=>{stage(address,input.value);formula.value=input.value;td.classList.toggle('draft',drafts.has(address));};
    input.onblur=()=>{if(editing){editing=false;input.readOnly=true;save().catch(fail);}};
    td.append(input);tr.append(td);
   }table.append(tr);
  }
  scroll.replaceChildren(table);tabs.replaceChildren(...view.sheets.filter(s=>s.state==='visible').map(s=>{const b=button(s.name,()=>action('sheet.select',{sheet:s.name}));b.setAttribute('aria-selected',String(s.name===sheetName));return b;}));
  tabs.append(button('↑ 80行',()=>{pageRow=Math.max(1,pageRow-80);render();}),button('↓ 80行',()=>{pageRow=Math.min(1048497,pageRow+80);render();}),button('← 16列',()=>{pageColumn=Math.max(1,pageColumn-16);render();}),button('→ 16列',()=>{pageColumn=Math.min(16369,pageColumn+16);render();}));
  position.value=range();formula.value=raw(focus);paintSelection();
  const issues=view.warnings||[];if(issues.length)updateState(issues.length+' 个公式待处理；选中单元格查看公式与原因');
 }
 function beginEdit(input,replace){editing=true;input.readOnly=false;input.value=replace??raw(input.dataset.address);input.focus();if(replace!=null){stage(input.dataset.address,replace);formula.value=replace;}else input.select();}
 function focusCell(address){const [r,c]=coordinate(address);if(r<pageRow||r>=pageRow+80||c<pageColumn||c>=pageColumn+16){pageRow=r;pageColumn=c;render();}select(address);scroll.querySelector(`textarea[data-address="${address}"]`)?.focus();}
 position.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();action('selection.set',{sheet:sheetName,range:position.value.toUpperCase()}).catch(fail);}};
 formula.oncompositionstart=()=>{composing=true;clearTimeout(timer);};formula.oncompositionend=()=>{composing=false;stage(focus,formula.value);};
 formula.oninput=()=>stage(focus,formula.value);formula.onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing&&e.keyCode!==229){e.preventDefault();stage(focus,formula.value);save().then(()=>focusCell(focus)).catch(fail);}};formula.onblur=()=>save().catch(fail);
 scroll.addEventListener('copy',e=>{try{copy(e);}catch(err){fail(err);}});scroll.addEventListener('paste',e=>paste(e).catch(fail));
 scroll.addEventListener('keydown',e=>{
  const input=e.target.closest('textarea[data-address]');if(!input)return;
  if(e.isComposing||e.keyCode===229||e.key==='Process'){if(!editing){editing=true;input.readOnly=false;input.value='';}return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save().catch(fail);return;}
  if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())&&!editing){e.preventDefault();action(e.key.toLowerCase()==='y'||e.shiftKey?'history.redo':'history.undo').catch(fail);return;}
  if(editing){if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();editing=false;save().then(()=>{const [r,c]=coordinate(focus);focusCell(columnName(e.key==='Tab'?Math.min(16384,c+1):c)+(e.key==='Enter'?Math.min(1048576,r+1):r));}).catch(fail);}else if(e.key==='Escape'){e.preventDefault();clearTimeout(timer);drafts.delete(focus);editing=false;render();}return;}
  if(e.key==='F2'||e.key==='Enter'){e.preventDefault();beginEdit(input);return;}
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();action('range.clear',{sheet:sheetName,range:range()}).catch(fail);return;}
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(e.key)){e.preventDefault();const [r,c]=coordinate(focus);const nr=Math.max(1,Math.min(1048576,r+(e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0))),nc=Math.max(1,Math.min(16384,c+(e.key==='ArrowRight'||e.key==='Tab'?1:e.key==='ArrowLeft'?-1:0)));const next=columnName(nc)+nr;if(e.shiftKey&&e.key!=='Tab'){try{select(next,true);}catch(err){fail(err);}}else focusCell(next);return;}
  if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();beginEdit(input,e.key);}
 });
 function read(){return {document:record,dirty:drafts.size>0,view,selection:{sheet:sheetName,range:range(),address:focus},commands:EXCEL_COMMANDS};}
 const stopDrag=()=>{dragSelecting=false;};document.addEventListener('pointerup',stopDrag);
 render();updateState('已打开 · 版本 '+record.fileRevision);
 return {read,save,executeCommand,get dirty(){return drafts.size>0||busy;},get busy(){return busy;},destroy(){destroyed=true;clearTimeout(timer);document.removeEventListener('pointerup',stopDrag);root.remove();}};
}
