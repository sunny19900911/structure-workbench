import {createOfficeDocumentStore} from './office-document-store.mjs';
import {inspectOfficePackage,editOfficePackage,generateWorkbook} from './office-package.mjs';

const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
const mime={docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation'};
async function body(req,limit=64*1024*1024){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>limit)throw Object.assign(Error('文件超过64MB'),{status:413});chunks.push(chunk);}return Buffer.concat(chunks);}
const decode=value=>{try{return decodeURIComponent(value||'');}catch{throw Error('文件信息编码无效');}};
const parameterVersion=value=>{const raw=decode(value);if(!raw)return undefined;if(/^[+-]?\d+$/.test(raw)){const number=Number(raw);if(!Number.isSafeInteger(number)||number<0)throw Error('来源参数版本无效');return number;}return raw;};
export function officeDocumentApi(env={},dependencies={}){
 const store=dependencies.store||createOfficeDocumentStore(env);
 const inspect=dependencies.inspect||inspectOfficePackage,edit=dependencies.edit||editOfficePackage,generate=dependencies.generate||generateWorkbook;
 function register(server){server.middlewares.use('/api/office-documents',async(req,res)=>{
  try{
   if(env.WORKBENCH_PORTABLE!=='1')return json(res,404,{error:'本机办公文档接口未启用'});
   if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host||req.headers['sec-fetch-site']==='cross-site')return json(res,403,{error:'只允许本机同源工作台访问'});
   if(!['GET','POST'].includes(req.method))return json(res,405,{error:'不支持的操作'});
   if(req.method==='POST'&&req.headers['x-workbench-request']!=='office-documents')return json(res,403,{error:'请求来源无效'});
   const url=new URL(req.url,'http://localhost'),[projectId,documentId,action,...extra]=url.pathname.split('/').filter(Boolean);
   if(extra.length||!projectId)return json(res,404,{error:'文档地址无效'});
   if(req.method==='GET'&&!documentId)return json(res,200,{documents:await store.list(projectId,{unit:url.searchParams.get('unit')||undefined})});
   const revision=url.searchParams.has('revision')?Number(url.searchParams.get('revision')):undefined;
   if(req.method==='GET'&&!action)return json(res,200,{document:await store.get(projectId,documentId,{revision})});
   if(req.method==='GET'&&action==='history')return json(res,200,{versions:await store.history(projectId,documentId)});
   if(req.method==='GET'&&action==='content'){
    const {document,bytes}=await store.read(projectId,documentId,{revision});
    res.writeHead(200,{'Content-Type':mime[document.type],'Content-Length':bytes.length,'Cache-Control':'no-store','Content-Disposition':"inline; filename*=UTF-8''"+encodeURIComponent(document.title+'.'+document.type),'X-Document-Revision':String(document.fileRevision)});return res.end(bytes);
   }
   if(req.method==='GET'&&action==='view'){
    const {document,bytes}=await store.read(projectId,documentId,{revision});
    return json(res,200,{document,view:await inspect(bytes,document.type,env)});
   }
   if(req.method==='POST'&&!documentId){
    const bytes=await body(req),type=url.searchParams.get('type');
    return json(res,201,{document:await store.create({projectId,unit:decode(req.headers['x-document-unit']),title:decode(req.headers['x-file-name']),type,bytes,sourceParameterVersion:parameterVersion(req.headers['x-parameter-version']),batchId:decode(req.headers['x-batch-id'])||undefined,origin:'imported'})});
   }
   if(req.method==='POST'&&documentId==='generate-xlsx'&&!action){
    const spec=JSON.parse((await body(req,4*1024*1024)).toString());
    const bytes=await generate(spec,env);
    return json(res,201,{document:await store.create({projectId,unit:spec.unit,title:spec.title||'结构参数汇总',type:'xlsx',bytes,sourceParameterVersion:spec.sourceParameterVersion,batchId:spec.batchId,origin:'generated'})});
   }
   if(req.method==='POST'&&action==='save'){
    return json(res,200,{document:await store.save({projectId,documentId,expectedRevision:Number(url.searchParams.get('expectedRevision')),bytes:await body(req),origin:'manual'})});
   }
   if(req.method==='POST'&&action==='command'){
    const input=JSON.parse((await body(req,2*1024*1024)).toString());
    const {document,bytes}=await store.read(projectId,documentId);
    if(document.fileRevision!==input.expectedRevision)return json(res,409,{error:'文档已有新版本，请重新读取后修改',code:'REVISION_CONFLICT'});
    const next=await edit(bytes,document.type,input.command,env);
    return json(res,200,{document:await store.save({projectId,documentId,expectedRevision:input.expectedRevision,bytes:next,origin:'manual'})});
   }
   return json(res,404,{error:'文档操作不存在'});
  }catch(e){return json(res,e.status||400,{error:e.message||'文档操作失败',code:e.code||'OFFICE_DOCUMENT_ERROR'});}
 });}
 return {name:'workbench-office-documents',configureServer:register,configurePreviewServer:register};
}
