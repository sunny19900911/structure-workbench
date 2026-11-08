import {SuperDoc} from 'superdoc';
import 'superdoc/style.css';
import './office-editor.css';
import './office-workbench.css';

const $=id=>document.getElementById(id);
const query=new URLSearchParams(location.search),projectId=query.get('project'),documentId=query.get('document');
const base='/api/office-documents/'+encodeURIComponent(projectId||'')+'/'+encodeURIComponent(documentId||'');
let controller,metadata;
const status=text=>{$('office-state').textContent=text;};
const showError=error=>{$('office-error').textContent=error.message||String(error);$('office-error').hidden=false;};
const clearError=()=>{$('office-error').hidden=true;};
async function request(url,options={}){const r=await fetch(url,options);if(!r.ok){let value={};try{value=await r.json();}catch{}throw Object.assign(Error(value.error||'文件操作失败'),{status:r.status,code:value.code});}return r;}
function title(){ $('office-title').textContent=metadata.title||'项目文档';document.title=metadata.title||'项目文档'; }
function notifySaved(){window.parent.postMessage({type:'workbench:office-saved',projectId,documentId,document:metadata},location.origin);}

async function mountWord(file){
 let sd,ready=false,generation=0,savedGeneration=0,savePending=null,mutationPending=false,destroyed=false;
 const changed=()=>{if(ready){generation++;status('有修改 · 版本 '+metadata.fileRevision);}};
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Word 编辑器载入超时，请关闭后重试；原文件已保留。')),90000);
  sd=new SuperDoc({selector:'#office-editor',documents:[{id:documentId,type:'docx',data:file}],documentMode:'editing',telemetry:{enabled:false},zoom:{mode:'fit-width',fitWidth:{min:10,max:100,padding:24}},
   onReady:()=>{clearTimeout(timer);ready=true;resolve();},onEditorUpdate:changed,
   onContentError:({error})=>{clearTimeout(timer);reject(Error('文档内容无法完整载入：'+(error?.message||String(error))));},
   onException:({error})=>{showError(Error('编辑器提示：'+(error?.message||String(error))));}
  });
 });
 sd.setZoomMode('fit-width');
 const editor=()=>{if(destroyed||!ready||!sd.activeEditor)throw Error('文档尚未打开');return sd.activeEditor;};
 const read=()=>({document:metadata,dirty:generation!==savedGeneration,text:editor().state.doc.textBetween(0,editor().state.doc.content.size,'\n'),commands:['text.replace','format.bold','format.italic','format.underline','format.font','format.size','paragraph.left','paragraph.center','paragraph.justify','table.insert','table.addRow','table.deleteRow','image.insert','history.undo','history.redo']});
 async function exportBlob(){const blob=await sd.export({exportType:['docx'],triggerDownload:false,isFinalDoc:false});if(!(blob instanceof Blob)||!blob.size)throw Error('未生成有效的 DOCX，未保存。');return blob;}
 async function save(){
  if(savePending)return savePending;
  if(generation===savedGeneration)return {document:metadata,dirty:false};
  $('office-editor').inert=true;
  savePending=(async()=>{const snapshot=generation,revision=metadata.fileRevision;status('正在保存到本机…');const blob=await exportBlob();const response=await request(base+'/save?expectedRevision='+revision,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Workbench-Request':'office-documents'},body:blob});metadata=(await response.json()).document;savedGeneration=snapshot;title();notifySaved();status(generation===savedGeneration?'已保存到本机 · 版本 '+metadata.fileRevision:'有新修改尚未保存');return {document:metadata,dirty:generation!==savedGeneration};})().catch(error=>{status('未保存 · 当前修改仍保留');showError(error);throw error;}).finally(()=>{savePending=null;$('office-editor').inert=false;});return savePending;
 }
 function locateText(expectedText){
  if(typeof expectedText!=='string'||!expectedText||expectedText.length>20000||/[\r\n]/.test(expectedText))throw Error('请提供同一段中的唯一文字片段。');
  const e=editor(),matches=[];
  e.state.doc.descendants((node,pos)=>{if(!node.isTextblock)return;const body=node.textContent;let from=0,index;while((index=body.indexOf(expectedText,from))>=0){matches.push({node,pos,index});from=index+expectedText.length;}return false;});
  if(matches.length!==1)throw Error(matches.length?'原文字存在多处，请提供更长的唯一片段。':'未找到原文字，文档可能已更新。');
  const match=matches[0];let cursor=0,start,end;
  match.node.descendants((node,pos)=>{if(node.isText){if(start==null&&cursor+node.text.length>match.index)start=match.pos+1+pos+(match.index-cursor);if(end==null&&cursor+node.text.length>=match.index+expectedText.length)end=match.pos+1+pos+(match.index+expectedText.length-cursor);cursor+=node.text.length;}else if(node.isLeaf&&node.isInline)cursor+=node.textContent.length;});
  if(!Number.isInteger(start)||!Number.isInteger(end))throw Error('该文字跨越特殊域，请在正文直接修改。');
  return {from:start,to:end};
 }
 function replaceText(args){
  const {expectedText,text}=args;
  if(typeof text!=='string'||text.length>20000||/[\r\n]/.test(text))throw Error('新文字须为同一段，不超过 20000 字。');
  if(/\{\{[^}]+\}\}|\[\[(?:table|image|measures)/.test(expectedText+text))throw Error('联动标记请通过项目参数接口更新。');
  const {from,to}=locateText(expectedText),e=editor();
  const tr=e.state.tr.insertText(text,from,to);e.view.dispatch(tr);return {replacements:1};
 }
 const commands={
  'format.bold':['toggleBold'], 'format.italic':['toggleItalic'], 'format.underline':['toggleUnderline'],
  'paragraph.left':['setTextAlign','left'],'paragraph.center':['setTextAlign','center'],'paragraph.justify':['setTextAlign','justify'],
  'table.addRow':['addRowAfter'],'table.deleteRow':['deleteRow'],'history.undo':['undo'],'history.redo':['redo']
 };
 async function executeCommand({name,args={},expectedRevision}){
  if(!Number.isInteger(expectedRevision)||expectedRevision!==metadata.fileRevision)throw Object.assign(Error('文档版本已变化，请重新读取。'),{status:409});
  if(savePending||mutationPending)throw Error('文档正在保存或编辑，请稍后重试。');
  mutationPending=true;
  try{
   const e=editor();let result;
   if(args.targetText!=null){const range=locateText(args.targetText);if(name==='image.insert'||name==='table.insert')range.from=range.to;if(e.commands.setTextSelection(range)===false)throw Error('目标文字暂不可编辑');}
   if(name==='text.replace')result=replaceText(args);
   else if(commands[name]){const [fn,...values]=commands[name];result=e.commands[fn](...values);}
   else if(name==='format.font'){if(typeof args.font!=='string'||!args.font.trim()||args.font.length>80)throw Error('字体名称无效');result=e.commands.setFontFamily(args.font);}
   else if(name==='format.size'){const n=Number(args.size);if(!(n>=6&&n<=96))throw Error('字号应在 6–96 之间');result=e.commands.setFontSize(n);}
   else if(name==='table.insert'){const {rows=3,columns=3}=args;if(!Number.isInteger(rows)||rows<1||rows>50||!Number.isInteger(columns)||columns<1||columns>20)throw Error('表格行列数无效');result=e.commands.insertTable({rows,cols:columns,withHeaderRow:false});}
   else if(name==='image.insert'){
    if(typeof args.data!=='string'||!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(args.data)||args.data.length>6*1024*1024)throw Error('请使用不超过 4 MB 的 PNG 或 JPEG 图片');
    const before=generation,image=new Image();image.src=args.data;await image.decode();if(generation!==before)throw Error('正文刚有修改，请重新插入图片');const width=Math.min(500,Math.max(40,Number(args.width)||300)),height=width*image.naturalHeight/image.naturalWidth;
    if(!Number.isFinite(height)||height<=0)throw Error('图片尺寸无效');
    result=e.commands.setImage({src:args.data,alt:String(args.alt||'项目图片').slice(0,200),size:{width,height}});
   }
   else throw Error('未支持的文档命令');
   if(result===false)throw Error('当前位置不能执行此操作，请先选择正文或表格。');
   // Every successful command is a local draft until the normal save path acknowledges it.
   changed();return {document:metadata,dirty:true,result};
  }finally{mutationPending=false;}
 }
 $('office-word-tools').hidden=false;
 status('已打开本机文件 · 版本 '+metadata.fileRevision);
 return {read,save,exportBlob,executeCommand,replaceText:args=>executeCommand({name:'text.replace',args,expectedRevision:metadata.fileRevision}),get dirty(){return generation!==savedGeneration;},get busy(){return Boolean(savePending||mutationPending);},destroy(){destroyed=true;sd.destroy();}};
}

async function run(command){clearError();try{return await controller.executeCommand({...command,expectedRevision:metadata.fileRevision});}catch(error){showError(error);throw error;}}
document.querySelectorAll('[data-command]').forEach(button=>{button.addEventListener('mousedown',event=>event.preventDefault());button.onclick=()=>run({name:button.dataset.command}).catch(()=>{});});
$('office-font').onchange=event=>{if(event.target.value)run({name:'format.font',args:{font:event.target.value}}).catch(()=>{});};
$('office-size').onchange=event=>{if(event.target.value)run({name:'format.size',args:{size:Number(event.target.value)}}).catch(()=>{});};
$('office-table').onmousedown=event=>event.preventDefault();$('office-table').onclick=()=>run({name:'table.insert',args:{rows:3,columns:3}}).catch(()=>{});
$('office-image').onmousedown=event=>event.preventDefault();$('office-image').onclick=()=>$('office-image-file').click();
$('office-image-file').onchange=async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>4*1024*1024)throw Error('图片不能超过 4 MB');const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});await run({name:'image.insert',args:{data,alt:file.name}});}catch(error){showError(error);}finally{event.target.value='';}};
$('office-save').onclick=async()=>{clearError();try{await controller.save();}catch(error){showError(error);}};
$('office-download').onclick=async()=>{try{await controller.save();const blob=controller.exportBlob?await controller.exportBlob():await(await request(base+'/content')).blob();const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(metadata.title||'项目文档').replace(/\.(docx|xlsx|pptx)$/i,'')+'.'+metadata.type;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}catch(error){showError(error);}};
window.addEventListener('beforeunload',event=>{if(controller?.dirty){event.preventDefault();event.returnValue='';}});
try{
 if(!/^[a-f0-9]{32}$/.test(projectId||'')||!/^[a-zA-Z0-9-]{16,64}$/.test(documentId||''))throw Error('文档地址无效，请从项目工作台打开。');
 metadata=(await(await request(base)).json()).document;title();
 if(metadata.type==='docx')controller=await mountWord(new File([await(await request(base+'/content')).blob()],(metadata.title||'项目文档')+'.docx',{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}));
 else{const {mountSimpleEditor}=await import('./office-simple-editors.js');const {view}=await(await request(base+'/view')).json();controller=await mountSimpleEditor({element:$('office-editor'),document:metadata,view,onSaved:next=>{metadata=next;title();status('已保存到本机 · 版本 '+metadata.fileRevision);notifySaved();}});status('已打开本机文件 · 版本 '+metadata.fileRevision);}
 window.WorkbenchOfficeEditor=controller;
 $('office-save').disabled=false;$('office-download').disabled=false;
 window.parent.postMessage({type:'workbench:office-ready',projectId,documentId},location.origin);
}catch(error){showError(error);status('未能打开，原文件已保留');}
