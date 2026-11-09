import {SuperDoc} from 'superdoc';
import {WORD_COMMANDS,WORD_COMMAND_NAMES,runWordCommand,spacingAttributes} from './office-word-commands.js';
import {mountWordRibbon,syncRibbonSelection} from './office-word-ribbon.js';
import {EXTENDED_COMMANDS,runExtended,sections,searchText,outline} from './office-word-extended.js';
import {buildWordWorkspace,mountWordWorkspace} from './office-word-workspace.js';
import {normalizeWordExport} from './office-word-export.js';
import zipScriptUrl from './vendor/jszip.min.js?url';
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
 if(!window.JSZip)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=zipScriptUrl;script.onload=resolve;script.onerror=()=>reject(Error('DOCX 打包组件载入失败'));document.head.append(script);});
 let sd,ready=false,generation=0,savedGeneration=0,savePending=null,mutationPending=false,destroyed=false,autoSaveTimer;
 const scheduleSave=()=>{clearTimeout(autoSaveTimer);autoSaveTimer=setTimeout(()=>{if(destroyed)return;if(mutationPending||savePending){scheduleSave();return;}save().catch(()=>{});},1800);};
 const changed=()=>{if(ready&&!destroyed){generation++;status('有修改 · 正在等待自动保存');scheduleSave();}};
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
 const styles=(editor().helpers?.linkedStyles?.getStyles?.()||[]).filter(style=>/^(Normal|Heading[1-3])$/.test(style.id)||/^(正文|标题\s*[1-3])$/.test(style.name||''));
 const styleSelect=$('office-style');styleSelect.replaceChildren(new Option('样式',''),...styles.map(style=>new Option(({Normal:'正文',Heading1:'标题 1',Heading2:'标题 2',Heading3:'标题 3'})[style.id]||style.name||style.id,style.id)));
 function syncContext(){const e=editor();$('office-table-tools').hidden=!e.isActive('table');syncRibbonSelection(e);}
 const active=editor();active.on('selectionUpdate',syncContext);active.on('transaction',syncContext);syncContext();
 const read=()=>({styles:styles.map(({id,name})=>({id,name})),document:metadata,sections:sections(editor()),dirty:generation!==savedGeneration,text:editor().state.doc.textBetween(0,editor().state.doc.content.size,'\n'),commands:[...WORD_COMMAND_NAMES,...EXTENDED_COMMANDS]});
 async function exportBlob(){const blob=await sd.export({exportType:['docx'],triggerDownload:false,isFinalDoc:false});if(!(blob instanceof Blob)||!blob.size)throw Error('未生成有效的 DOCX，未保存。');return normalizeWordExport(blob,window.JSZip);}
 async function save(){
  if(savePending)return savePending;
  if(mutationPending)throw Error('文档正在编辑，请稍后保存。');
  if(generation===savedGeneration)return {document:metadata,dirty:false};
  clearTimeout(autoSaveTimer);
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
 async function executeCommand({name,args={},expectedRevision}){
  if(!Number.isInteger(expectedRevision)||expectedRevision!==metadata.fileRevision)throw Object.assign(Error('文档版本已变化，请重新读取。'),{status:409});
  if(savePending||mutationPending)throw Error('文档正在保存或编辑，请稍后重试。');
  mutationPending=true;
  try{
   const e=editor();let result;
   if(!WORD_COMMAND_NAMES.includes(name)&&!EXTENDED_COMMANDS.includes(name))throw Error('未支持的文档命令');
   if(name==='paragraph.spacing')spacingAttributes(args);
   if(args.targetText!=null){const range=locateText(args.targetText);if(name==='image.insert'||name==='table.insert'||name==='note.insert'||name.startsWith('insert.'))range.from=range.to;if(e.commands.setTextSelection(range)===false)throw Error('目标文字暂不可编辑');}
   if(EXTENDED_COMMANDS.includes(name))result=runExtended(e,name,args);
   else if(name==='text.replace')result=replaceText(args);
   else if(Object.hasOwn(WORD_COMMANDS,name)||name==='paragraph.spacing'||name==='paragraph.style'||name==='format.color'||name==='format.highlight')result=runWordCommand(e,name,args);
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
   // The normal save path (manual or debounced) must acknowledge this local draft.
   changed();return {document:metadata,dirty:true,result};
  }finally{mutationPending=false;}
 }
 $('office-word-tools').hidden=false;
 status('已打开本机文件 · 版本 '+metadata.fileRevision);
 return {read,save,exportBlob,executeCommand,sections:()=>sections(editor()),find:query=>searchText(editor(),query),outline:()=>outline(editor()),notes:()=>editor().doc.footnotes.list({limit:100}).items,comments:()=>editor().doc.comments.list({limit:100}).items.map(item=>({text:item.text||item.content||item.commentId})),changes:()=>editor().doc.trackChanges.list({limit:100}).items.map(item=>({text:({replacement:'替换',insertion:'插入',deletion:'删除',formatting:'格式'}[item.type]||'修订')+'：'+(item.excerpt||item.text||item.insertedText||item.deletedText||'请在正文中查看对应标记')})),statistics(){const e=editor(),text=e.state.doc.textContent;let paragraphs=0;e.state.doc.descendants(n=>{if(n.isTextblock)paragraphs++;});return {characters:text.replace(/\s/g,'').length,words:(text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)||[]).length,paragraphs};},selectRange(range){editor().commands.setTextSelection({from:range.from,to:range.to});editor().commands.focus();},setReviewMode(enabled){sd.setDocumentMode(enabled?'suggesting':'editing');},setZoom(value){if(value==='fit')sd.setZoomMode('fit-width');else sd.setZoom(Number(value));},replaceText:args=>executeCommand({name:'text.replace',args,expectedRevision:metadata.fileRevision}),get dirty(){return generation!==savedGeneration;},get busy(){return Boolean(savePending||mutationPending);},destroy(){destroyed=true;clearTimeout(autoSaveTimer);active.off('selectionUpdate',syncContext);active.off('transaction',syncContext);sd.destroy();}};
}

async function run(command){clearError();try{return await controller.executeCommand({...command,expectedRevision:metadata.fileRevision});}catch(error){showError(error);throw error;}}
function setupWordTools(){
buildWordWorkspace();
mountWordRibbon({zoom:value=>controller?.setZoom?.(value)});
document.querySelectorAll('[data-command]').forEach(button=>{button.addEventListener('mousedown',event=>event.preventDefault());button.onclick=()=>run({name:button.dataset.command}).catch(()=>{});});
function bindSelect(element,name,key,convert=value=>value){element.onchange=()=>{const value=element.value;if(value!=='')run({name,args:{[key]:convert(value)}}).catch(()=>{}).finally(()=>{element.value='';});};}
$('office-color').onchange=event=>run({name:'format.color',args:{color:event.target.value}}).catch(()=>{});
$('office-highlight').onchange=event=>run({name:'format.highlight',args:{color:event.target.value}}).catch(()=>{});
bindSelect($('office-style'),'paragraph.style','style');
bindSelect($('office-font'),'format.font','font');
bindSelect($('office-size'),'format.size','size',Number);
document.querySelectorAll('[data-spacing]').forEach(select=>bindSelect(select,'paragraph.spacing',select.dataset.spacing,Number));
$('office-table').onmousedown=event=>event.preventDefault();$('office-table').onclick=()=>run({name:'table.insert',args:{rows:3,columns:3}}).catch(()=>{});
$('office-image').onmousedown=event=>event.preventDefault();$('office-image').onclick=()=>$('office-image-file').click();
$('office-image-file').onchange=async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>4*1024*1024)throw Error('图片不能超过 4 MB');const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});await run({name:'image.insert',args:{data,alt:file.name}});}catch(error){showError(error);}finally{event.target.value='';}};
mountWordWorkspace({getController:()=>controller,run,onError:showError});
}
$('office-save').onclick=async()=>{clearError();try{await controller.save();}catch(error){showError(error);}};
$('office-download').onclick=async()=>{try{await controller.save();const blob=controller.exportBlob?await controller.exportBlob():await(await request(base+'/content')).blob();const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(metadata.title||'项目文档').replace(/\.(docx|xlsx|pptx)$/i,'')+'.'+metadata.type;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}catch(error){showError(error);}};
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();if(controller)controller.save().catch(showError);}});
window.addEventListener('beforeunload',event=>{if(controller?.dirty){event.preventDefault();event.returnValue='';}});
try{
 if(!/^[a-f0-9]{32}$/.test(projectId||'')||!/^[a-zA-Z0-9-]{16,64}$/.test(documentId||''))throw Error('文档地址无效，请从项目工作台打开。');
 metadata=(await(await request(base)).json()).document;title();
 if(metadata.type==='docx'){setupWordTools();controller=await mountWord(new File([await(await request(base+'/content')).blob()],(metadata.title||'项目文档')+'.docx',{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}));}
 else{const mountEditor=metadata.type==='xlsx'?(await import('./office-excel-editor.js')).mountExcelEditor:(await import('./office-ppt-editor.js')).mountPptEditor;if(metadata.type==='pptx')await import('./office-ppt-editor.css');const {view}=await(await request(base+'/view')).json();controller=await mountEditor({element:$('office-editor'),document:metadata,view,onSaved:next=>{metadata=next;title();status('已保存到本机 · 版本 '+metadata.fileRevision);notifySaved();}});status('已打开本机文件 · 版本 '+metadata.fileRevision);}
 window.WorkbenchOfficeEditor=controller;
 $('office-save').disabled=false;$('office-download').disabled=false;
 window.parent.postMessage({type:'workbench:office-ready',projectId,documentId},location.origin);
}catch(error){showError(error);status('未能打开，原文件已保留');}
