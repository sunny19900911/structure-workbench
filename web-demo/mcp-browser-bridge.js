import './integrated-modules.js';
import {BROWSER_OPERATIONS,OFFICE_COMMAND_ARGUMENTS} from './mcp-browser-operations.js';
import {bridgeError,validateBridgeRequest,validateBridgeValue,validateRevisionSnapshot,checkedImage,validateSeismicUpdate} from './mcp-browser-core.js';
import {projectRequest} from './project-store-client.js';
import {measureTextBlocks,editMeasureText} from './mcp-measures.js';

const W=window.WorkbenchProjects,I=window.WorkbenchIntake,E=window.ExpansionWorkbench,M=window.WorkbenchModules,L=window.WorkbenchLegacy;
let session=null,running=false,stopped=false;
const metadata=()=>({projectId:W.id,unit:E.unit,revision:W.mcp.revision,busy:running||W.mcp.busy||I.busy||E.busy});
async function request(path,body){const response=await fetch('/api/mcp-browser/'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Workbench-Request':'mcp-browser'},body:JSON.stringify(body)});const value=await response.json();if(!response.ok)throw bridgeError(value.error,value.code,response.status);return value;}
async function revisions(){const parts=['main','intake',E.mcp.part,'modules','ppt','portable-assets','lifecycle'];const records=await Promise.all(parts.map(async part=>[part,(await projectRequest('/'+W.id+'/'+part)).record?.revision||0]));return Object.fromEntries(records);}
function localRevisions(){return {main:W.mcp.revision,intake:I.mcp.revision,[E.mcp.part]:E.mcp.revision,modules:M.mcp.revision,...(M.mcp.ppt?.ready?{ppt:M.mcp.ppt.revision}:{})};}
const dirty=()=>W.mcp.dirty||I.mcp.dirty||E.mcp.dirty||M.mcp.dirty||!!M.mcp.ppt?.dirty;
async function context(){return {projectId:W.id,unit:E.unit,name:L.params().project_name,parameterVersion:W.parameterVersion,parameters:L.params(),units:I.units,revisions:await revisions(),hasUnsavedChanges:dirty(),operations:BROWSER_OPERATIONS.map(({name,description,readOnly,requiresUnit})=>({name,description,readOnly,requiresUnit})),draft:true};}
function files(items){return items.map(item=>{if(!/^[A-Za-z0-9+/]*={0,2}$/.test(item.base64)||item.base64.length%4!==0||!item.name||/[\\/]/.test(item.name))throw bridgeError('文件名或Base64不正确');const raw=atob(item.base64);if(raw.length>30*1024*1024)throw bridgeError('文件超过30MB，请拆分');const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));return new File([bytes],item.name);});}
async function binary(blob,filename){if(blob.size>48*1024*1024)throw bridgeError('生成文件超过MCP传输上限，请从网页直接下载');const bytes=new Uint8Array(await blob.arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return {filename,mime:blob.type,base64:btoa(text),draft:true};}
function documentPackage(kind){if(kind==='expansion')return {kind,template:E.documentPackage(),draft:!E.capture()?.signed};if(kind==='regulations')return {kind,html:E.localRegulationHTML(),draft:!E.capture()?.signed};const root=document.querySelector('#paper1').cloneNode(true);root.querySelectorAll('.ptip,.op,.badge,button,details,.tblrow,.atools').forEach(n=>n.remove());root.querySelector('.ptitle')?.classList.add('document-title');root.querySelector('.psub')?.classList.add('document-subtitle');return {kind,html:root.innerHTML,draft:L.cardState('c1')!==3};}
async function officeDocument(documentId,unit){
 if(!window.WorkbenchOffice)throw bridgeError('当前工作台未启用原生文档编辑器','OFFICE_UNAVAILABLE',503);
 if(!/^[a-f0-9]{32}$/.test(documentId||''))throw bridgeError('文档ID无效');
 const response=await fetch('/api/office-documents/'+W.id+'/'+documentId),value=await response.json();
 if(!response.ok)throw bridgeError(value.error||'文档读取失败',value.code,response.status);
 if(value.document?.projectId!==W.id||value.document?.unit!==unit)throw bridgeError('文档所属项目或单体与请求不一致','DOCUMENT_SCOPE_MISMATCH',409);
 return value.document;
}
function officeMcpResult(value){
 if(Array.isArray(value))return value.map(officeMcpResult);
 if(value&&typeof value==='object'){const result={};for(const [key,item]of Object.entries(value)){if(key==='imageDataUrl')result.hasImage=Boolean(item);else result[key]=officeMcpResult(item);}return result;}
 return value;
}
async function invoke(task){const a=task.args||{},unit=task.unit||E.unit;switch(task.operation){
 case 'project.context':return context();
 case 'project.save':await W.flush();return {saved:true};
 case 'project.create':return W.mcp.create(a.name.trim()||'未命名项目');
 case 'project.open':return W.mcp.open(a.targetProjectId);
 case 'project.select_unit':if(!['项目整体',...I.units].includes(a.unit))throw bridgeError('单体不存在，请先导入建筑资料');await E.selectUnit(a.unit);return {unit:E.unit};
 case 'project.lifecycle':if(a.action==='restore'&&!a.targetProjectId)throw bridgeError('恢复项目需要targetProjectId');return W.mcp.lifecycle(a.targetProjectId||W.id,a.action==='delete',a.expectedLifecycleRevision);
 case 'measures.update':{const keys=new Set(Object.keys(L.params()));if(Object.keys(a.values).some(k=>!keys.has(k)))throw bridgeError('包含未知统一措施字段，请先读取project.context');L.adoptParameters(a.values);L.publish();return {updated:Object.keys(a.values)};}
 case 'measures.read':return {parameters:L.params(),...L.templateContent(),textBlocks:measureTextBlocks(document)};
 case 'measures.table':return L.mcp.editTable(a);
 case 'measures.text':return editMeasureText(document,L,W,a);
 case 'document.import':{const selected=files(a.files);if(a.slot==='yjk')await E.importFiles('yjk',selected);else await I.readFiles(a.slot,selected,{replaceSource:a.replaceSource});return {sources:I.sourceInventory.sources,model:E.modelContext()?.model};}
 case 'intake.adopt':await I.mcp.adopt(a,unit);return {adopted:a.factId};
 case 'intake.source':if(unit!=='项目整体')throw bridgeError('建筑/地勘来源是项目公共资料，请明确unit为项目整体');await I.mcp.source(a);return {action:a.action,sourceId:a.sourceId};
 case 'seismic.update':if(unit==='项目整体')throw bridgeError('抗震等级需要明确单体');validateSeismicUpdate({previous:I.capture().seismicGrades?.[unit],values:a.values,heightBasis:a.heightBasis});I.saveSeismicGrade(unit,a.values);return {unit,parameters:I.parameters(unit)};
 case 'expansion.generate':return E.mcp.generate();
 case 'expansion.read':return E.mcp.read();
 case 'expansion.edit':await E.mcp.edit(a);return {sectionId:a.sectionId};
 case 'expansion.table':await E.mcp.table(a);return {key:a.key,rowKey:a.rowKey,column:a.column};
 case 'expansion.unit_row':await E.mcp.unitRow(a);return {rowKey:a.rowKey,hidden:a.hidden};
 case 'expansion.image':checkedImage(a.data);await E.mcp.image(a);return {slot:a.slot};
 case 'expansion.regularity':await E.mcp.regularity(a);return {category:a.category,answer:a.answer};
 case 'regulations.update':return E.mcp.regulation(a);
 case 'regulations.search':return window.WorkbenchLocalRegulations.search(a);
 case 'document.package':return documentPackage(a.kind);
 case 'ppt.read':return M.mcp.ppt.read();
 case 'ppt.edit':return M.mcp.ppt.edit(a);
 case 'ppt.image':checkedImage(a.data);await M.mcp.ppt.image(a);return {key:a.key};
 case 'ppt.export':{const result=await M.mcp.ppt.export();return binary(result.blob,result.filename);}
 case 'steel.read':return M.mcp.readSteel(unit);
 case 'steel.import':return M.mcp.steelImport(unit,a.slot,files(a.files));
 case 'steel.area':return M.mcp.steelArea(unit,a.value);
 case 'calculation.read':return window.CalculationBook.mcp.read();
 case 'calculation.catalog':if(!L.canEdit('c9'))throw bridgeError('计算书当前只读或已签发');return window.CalculationBook.mcp.catalog(a.sections);
 case 'calculation.excel':if(!L.canEdit('c9'))throw bridgeError('计算书当前只读或已签发');return window.CalculationBook.mcp.excel(a);
 case 'calculation.model':if(!L.canEdit('c9'))throw bridgeError('计算书当前只读或已签发');return window.CalculationBook.mcp.model(files(a.files));
 case 'calculation.package':return window.CalculationBook.mcp.package(a);
 case 'office.generate':if(!window.WorkbenchOffice)throw bridgeError('当前工作台未启用原生文档编辑器','OFFICE_UNAVAILABLE',503);return {...await window.WorkbenchOffice.generate(),draft:true,engineeringApproval:false};
 case 'office.open':await officeDocument(a.documentId,unit);return officeMcpResult(await window.WorkbenchOffice.open(a.documentId));
 case 'office.read':await officeDocument(a.documentId,unit);return officeMcpResult(await window.WorkbenchOffice.read(a.documentId));
 case 'office.command':{
  const record=await officeDocument(a.documentId,unit);
  if(record.fileRevision!==a.expectedRevision)throw bridgeError('文档已有新版本，请重新读取','REVISION_CONFLICT',409);
  const schema=OFFICE_COMMAND_ARGUMENTS[a.name];if(!schema)throw bridgeError('不支持的文档命令');validateBridgeValue(a.args,schema,'command.args');
  const type={'cell.set':'xlsx','shape.text':'pptx','shape.move':'pptx'}[a.name]||'docx';
  if(record.type!==type)throw bridgeError('命令与文档类型不匹配');
  if(Object.hasOwn(a.args,'targetText')&&!a.args.targetText.trim())throw bridgeError('请提供文档中唯一的目标文字');
  if(a.name==='image.insert'){checkedImage(a.args.data);if(!/^data:image\/(png|jpeg);/i.test(a.args.data))throw bridgeError('Word图片只支持PNG或JPEG');}
  const result=await window.WorkbenchOffice.command(a.documentId,{name:a.name,args:a.args,expectedRevision:a.expectedRevision});
  return officeMcpResult({...await window.WorkbenchOffice.read(a.documentId),result:result?.result,draft:true,engineeringApproval:false});
 }
 case 'office.save':{
  const record=await officeDocument(a.documentId,unit);
  if(record.fileRevision!==a.expectedRevision)throw bridgeError('文档已有新版本，请重新读取','REVISION_CONFLICT',409);
  const current=await window.WorkbenchOffice.read(a.documentId);
  if(current.document?.fileRevision!==a.expectedRevision)throw bridgeError('编辑器版本已变化，请重新读取','REVISION_CONFLICT',409);
  await window.WorkbenchOffice.save();return officeMcpResult({...await window.WorkbenchOffice.read(a.documentId),draft:true,engineeringApproval:false});
 }
 default:throw bridgeError('未实现的工作台操作');
}}
async function executeTask(task){
 const spec=validateBridgeRequest(task);if(task.projectId!==W.id)throw bridgeError('页面已经切换项目','PROJECT_CHANGED',409);
 return W.mcp.run(async()=>{
  if(task.unit&&task.unit!==E.unit)throw bridgeError('网页当前单体与请求不同，请先调用project.select_unit','UNIT_MISMATCH',409);
  if(task.operation.startsWith('ppt.'))await M.mcp.openPpt(task.unit||E.unit);
  if(!spec.readOnly){validateRevisionSnapshot(spec,task.expectedRevisions,await revisions(),localRevisions(),E.mcp.part);if(dirty()&&task.operation!=='project.save'){await W.flush();throw bridgeError('网页原有修改已保存，请重新读取project.context后再执行本次修改','REVISION_CONFLICT',409);}}
  const result=await invoke(task);if(!spec.readOnly)await W.flush();return {result,context:await context()};
 });
}
async function tick(){
 if(stopped||running)return;
 try{
  if(!W.id||W.loading||!E.mcp||!M.mcp)return;
  if(!session)session=await request('register',metadata());
  const reply=await request('poll',{...session,clientId:session.id,...metadata()});if(!reply.task)return;
  const task=reply.task;running=true;const who=session;let heartbeat;
  try{await request('start',{...who,clientId:who.id,taskId:task.id});heartbeat=setInterval(()=>request('poll',{...who,clientId:who.id,...metadata(),busy:true}).catch(()=>{}),3000);const result=await executeTask(task);await request('complete',{...who,clientId:who.id,taskId:task.id,result});}
  catch(e){await request('complete',{...who,clientId:who.id,taskId:task.id,error:{message:e.message,code:e.code,status:e.status}}).catch(()=>{});}
  finally{clearInterval(heartbeat);running=false;}
 }catch(e){if(e.status===401)session=null;}
 finally{if(!stopped)setTimeout(tick,800);}
}
if(window.WORKBENCH_PORTABLE){window.addEventListener('pagehide',()=>{stopped=true;});tick();}
