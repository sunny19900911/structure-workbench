// Standalone manual preview. Uses only this worktree's ignored QA project store.
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writePart,readPart} from '../../../server/project-store.mjs';
import {createOfficeDocumentStore} from '../../../server/office-document-store.mjs';
import {officeDocumentApi} from '../../../server/office-document-api.mjs';
import {inspectWithExcel,editWithExcel,editExcelPackage} from '../../../server/office-excel-package.mjs';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const qa=resolve(root,'qa/portable-release/mcp/office-excel/tencent-preview-20261108');
const env={WORKBENCH_PORTABLE:'1',WORKBENCH_PROJECT_STORE:join(qa,'projects'),WORKBENCH_PYTHON:process.env.WORKBENCH_PYTHON||join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe')};
const projectId='e'.repeat(32);let port=Number(process.env.EXCEL_PREVIEW_PORT||0);
await mkdir(qa,{recursive:true});
if(!await readPart(env.WORKBENCH_PROJECT_STORE,projectId,'main'))await writePart(env.WORKBENCH_PROJECT_STORE,projectId,'main',{parameters:{project_name:'Excel人工检查演示'}},0);
const store=createOfficeDocumentStore(env);let doc=(await store.list(projectId))[0];
if(!doc){
 const fixture=join(qa,'演示初稿.xlsx');
 await promisify(execFile)(env.WORKBENCH_PYTHON,['-c',`import importlib.util,sys; from pathlib import Path; s=importlib.util.spec_from_file_location('tests',sys.argv[1]); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); Path(sys.argv[2]).write_bytes(m.fixture())`,join(root,'design/office-parallel-20261108/excel/package.test.py'),fixture],{windowsHide:true});
 let bytes=await readFile(fixture);
 for(const command of [
  {op:'range.set',sheet:'荷载',address:'A1',values:[['使用部位','活荷载(kN/m²)','面积(m²)','荷载合计(kN)']]},
  {op:'sheet.add',name:'用钢量'},
  {op:'range.set',sheet:'用钢量',address:'A1',values:[['楼层','钢筋(t)','面积(m²)','单方(kg/m²)'],['一层','120','2500','=B2*1000/C2'],['二层','105','2500','=B3*1000/C3'],['三层','98','2400','=B4*1000/C4'],['合计','=SUM(B2:B4)','=SUM(C2:C4)','=B5*1000/C5']]},
  {op:'range.format',sheet:'用钢量',range:'B2:D5',format:'decimal'},
  {op:'workbook.recalculate'}
 ])bytes=await editExcelPackage(bytes,command,env);
 doc=await store.create({projectId,unit:'演示教学楼',title:'Excel演示_荷载与用钢量',type:'xlsx',bytes,origin:'generated'});
}
const base=`/api/office-documents/${projectId}/${doc.documentId}`;let route;
officeDocumentApi(env,{store,inspect:inspectWithExcel,edit:editWithExcel}).configureServer({middlewares:{use(_path,handler){route=handler;}}});
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Excel预览 · 荷载与用钢量</title><link rel="stylesheet" href="/office-excel-editor.css"><style>body{margin:20px;background:#f5f7f4;color:#243735;font:14px system-ui}header{display:flex;align-items:center;gap:12px;margin-bottom:14px}h1{font-size:19px;margin:0}small{color:#687b70;margin-right:auto}header button{padding:7px 16px;border:1px solid #cedbd3;border-radius:5px;background:white;color:#243735;cursor:pointer}#host{padding:16px;background:white;border-radius:8px}#state{font-size:12px;color:#687b70}</style><header><h1>Excel · 荷载与用钢量</h1><small>隔离演示</small><span id="state">正在打开…</span><button id="save" disabled>保存</button><button id="download" disabled>下载 XLSX</button></header><main id="host"></main><script type="module">
import {mountExcelEditor} from '/office-excel-editor.js';
const state=document.querySelector('#state'),base=${JSON.stringify(base)};
try{const response=await fetch(base+'/view');const result=await response.json();if(!response.ok)throw Error(result.error);
window.WorkbenchOfficeEditor=await mountExcelEditor({element:document.querySelector('#host'),...result,onSaved:d=>state.textContent='已保存 · 版本 '+d.fileRevision});
state.textContent='已打开 · 版本 '+result.document.fileRevision;
document.querySelector('#save').disabled=false;document.querySelector('#download').disabled=false;
document.querySelector('#save').onclick=async()=>{try{const r=await window.WorkbenchOfficeEditor.save();state.textContent='已保存 · 版本 '+r.document.fileRevision;}catch(e){state.textContent=e.message;}};
document.querySelector('#download').onclick=async()=>{try{await window.WorkbenchOfficeEditor.save();const r=await fetch(base+'/content');if(!r.ok)throw Error('下载失败');const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='演示_荷载与用钢量.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}catch(e){state.textContent=e.message;}};
window.addEventListener('beforeunload',e=>{if(window.WorkbenchOfficeEditor.dirty){e.preventDefault();e.returnValue='';}});
}catch(e){state.textContent=e.message;}
</script></html>`;
const server=createServer(async(req,res)=>{
 try{
  if(req.url.startsWith('/api/office-documents/')){req.url=req.url.slice('/api/office-documents'.length);return route(req,res);}
  const path=new URL(req.url,'http://localhost').pathname;
  res.setHeader('Cache-Control','no-store');
  if(path==='/health'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({app:'office-excel-manual-preview',port,pid:process.pid,projectId,documentId:doc.documentId,store:env.WORKBENCH_PROJECT_STORE}));}
  if(path==='/'||path==='/excel-preview'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
  if(!['/office-excel-editor.js','/office-excel-commands.js','/office-excel-ribbon.js','/office-excel-editor.css'].includes(path)){res.statusCode=404;return res.end();}
  let data=await readFile(join(root,path.slice(1)),'utf8');if(path.endsWith('.js'))data=data.replace("import './office-excel-editor.css';",'');
  res.setHeader('Content-Type',path.endsWith('.css')?'text/css':'text/javascript');res.end(data);
 }catch(e){res.statusCode=500;res.end(e.message);}
});
server.listen(port,'127.0.0.1');await once(server,'listening');port=server.address().port;
const info={url:`http://127.0.0.1:${port}/excel-preview`,port,pid:process.pid,projectId,documentId:doc.documentId,qa};
await writeFile(join(qa,'preview-server.json'),JSON.stringify(info,null,2));console.log(JSON.stringify(info));
