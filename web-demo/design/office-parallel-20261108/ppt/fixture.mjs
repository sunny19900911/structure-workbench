import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdir,mkdtemp,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {officeDocumentApi} from '../../../server/office-document-api.mjs';
import {officePptHistoryApi} from '../../../server/office-ppt-document-api.mjs';
import {inspectPptPackage,editPptPackage} from '../../../server/office-ppt-package.mjs';
import {writePart} from '../../../server/project-store.mjs';
export const projectId='e'.repeat(32);
export const root=fileURLToPath(new URL('../../../',import.meta.url));
const require=createRequire(process.env.WORKBENCH_TEST_DEPENDENCIES?join(process.env.WORKBENCH_TEST_DEPENDENCIES,'package.json'):import.meta.url);
export async function fixture(){
 const PptxGenJS=require('pptxgenjs');const ppt=new PptxGenJS();ppt.layout='LAYOUT_WIDE';
 const a=ppt.addSlide();a.background={color:'FFFFFF'};a.addText('结构方案汇报',{x:.8,y:.7,w:10,h:.7,fontSize:30,bold:true,color:'203B54'});a.addText('教学楼｜框架体系\n结构高度 23.7 m',{x:.8,y:2,w:10,h:2,fontSize:22,color:'203B54'});
 const b=ppt.addSlide();b.addText('模型与计算结果',{x:.8,y:.7,w:10,h:.7,fontSize:30});b.addTable([['指标','结果'],['结构高度','23.7 m']],{x:.8,y:2,w:9,h:2,fontSize:20});
 const original=await ppt.write({outputType:'nodebuffer'});
 const parent=join(root,'qa/portable-release/mcp');await mkdir(parent,{recursive:true});const directory=await mkdtemp(join(parent,'office-ppt-'));
 const env={...process.env,WORKBENCH_PORTABLE:'1',WORKBENCH_PROJECT_STORE:join(directory,'projects')};
 await writePart(env.WORKBENCH_PROJECT_STORE,projectId,'main',{parameters:{project_name:'PPT隔离测试'}},0);
 const routes=[],adapter={middlewares:{use(prefix,handler){routes.push({prefix,handler});}}};officeDocumentApi(env,{inspect:inspectPptPackage,edit:editPptPackage}).configureServer(adapter);officePptHistoryApi(env).configureServer(adapter);
 const server=createServer(async(req,res)=>{
  try{
   for(const route of routes)if(req.url.startsWith(route.prefix)){req.url=req.url.slice(route.prefix.length);await route.handler(req,res);return;}
   if(req.url.split('?')[0]==='/qa.html'){
    res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(`<!doctype html><html lang="zh"><meta charset="utf-8"><title>PPT 隔离验收</title><link rel="stylesheet" href="/office-ppt-editor.css"><style>body{margin:20px;background:#eef1f4}header{display:flex;gap:10px;align-items:center;margin-bottom:12px}h1{font:18px sans-serif;margin-right:auto}button{padding:8px}</style><header><h1>结构方案汇报</h1><button id="save">保存</button><button id="download">下载</button></header><main id="editor"></main><script type="module">import {mountPptEditor} from '/office-ppt-editor.js';const base='/api/office-documents/${projectId}/'+new URLSearchParams(location.search).get('id');const result=await(await fetch(base+'/view')).json();window.controller=await mountPptEditor({element:document.querySelector('#editor'),...result});document.querySelector('#save').onclick=()=>controller.save();document.querySelector('#download').onclick=async()=>{await controller.save();const a=document.createElement('a');a.href=base+'/content';a.download='结构汇报.pptx';a.click();};</script></html>`);
   }
   const filename=req.url.split('?')[0].slice(1);
   if(['office-ppt-editor.js','office-ppt-editor.css'].includes(filename)){res.setHeader('Content-Type',filename.endsWith('js')?'text/javascript':'text/css');return res.end(await readFile(join(root,filename)));}
   res.writeHead(404);res.end();
  }catch(e){res.writeHead(500);res.end(e.message);}
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 const response=await fetch(origin+'/api/office-documents/'+projectId+'?type=pptx',{method:'POST',headers:{'X-Workbench-Request':'office-documents','X-File-Name':encodeURIComponent('结构汇报'),'X-Document-Unit':encodeURIComponent('教学楼')},body:original});
 const created=await response.json();if(!response.ok){server.close();throw Error(JSON.stringify(created));}
 const base=origin+'/api/office-documents/'+projectId+'/'+created.document.documentId;
 return {origin,base,original,directory,record:created.document,close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})};
}
