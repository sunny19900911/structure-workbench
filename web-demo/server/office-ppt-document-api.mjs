import {createOfficeDocumentStore} from './office-document-store.mjs';

// Companion to officeDocumentApi: restoring a revision creates a new immutable revision.
// No version or file is deleted. UI and MCP reach this via the same editor controller.
export function officePptHistoryApi(env={},dependencies={}){
 const store=dependencies.store||createOfficeDocumentStore(env);
 const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 function register(server){server.middlewares.use('/api/office-ppt-history',async(req,res)=>{
  try{
   if(env.WORKBENCH_PORTABLE!=='1')return send(res,404,{error:'本机办公文档接口未启用'});
   if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host||req.headers['sec-fetch-site']==='cross-site')return send(res,403,{error:'只允许同源工作台访问'});
   if(req.method!=='POST')return send(res,405,{error:'不支持的操作'});
   if(req.headers['x-workbench-request']!=='office-documents')return send(res,403,{error:'请求来源无效'});
   const parts=new URL(req.url,'http://localhost').pathname.split('/').filter(Boolean);
   if(parts.length!==2)return send(res,404,{error:'文档地址无效'});
   const [projectId,documentId]=parts;let length=0;const chunks=[];
   for await(const chunk of req){length+=chunk.length;if(length>4096)return send(res,413,{error:'请求过大'});chunks.push(chunk);}
   const {expectedRevision,revision}=JSON.parse(Buffer.concat(chunks).toString());
   if(!Number.isSafeInteger(expectedRevision)||!Number.isSafeInteger(revision)||revision<1||revision>expectedRevision)return send(res,400,{error:'文件版本无效'});
   const current=await store.get(projectId,documentId);
   if(current.type!=='pptx')return send(res,422,{error:'仅支持 PPT 撤销重做'});
   if(current.fileRevision!==expectedRevision)return send(res,409,{error:'文件已有新版本，请重新读取',code:'REVISION_CONFLICT'});
   const previous=await store.read(projectId,documentId,{revision});
   return send(res,200,{document:await store.save({projectId,documentId,expectedRevision,bytes:previous.bytes,origin:'manual'})});
  }catch(e){return send(res,e.status||400,{error:e.message,code:e.code||'OFFICE_PPT_HISTORY_ERROR'});}
 });}
 return {name:'workbench-office-ppt-history',configureServer:register,configurePreviewServer:register};
}
