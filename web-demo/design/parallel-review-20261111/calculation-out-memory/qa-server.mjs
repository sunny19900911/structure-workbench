import {createServer} from 'vite';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const qa=join(root,'qa/portable-release/calculation-out-memory-20261111');await mkdir(qa,{recursive:true});
const runtime=process.env.WORKBENCH_RUNTIME||'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1104-2876-0_26.1104.2876.0_x64__3k8sg7r9htsxt/dependencies';
const env={WORKBENCH_PORTABLE:'1',WORKBENCH_PROJECT_STORE:join(qa,'projects'),WORKBENCH_DATABASE_ROOT:qa,WORKBENCH_CACHE_ROOT:join(qa,'cache'),WORKBENCH_PYTHON:join(runtime,'python/python.exe'),CALCBOOK_PYTHON:join(runtime,'python/python.exe'),CALCBOOK_SOURCE_DIR:join(qa,'sources'),CALCBOOK_UPLOAD_DIR:join(qa,'uploads'),EXPANSION_STORE_DIR:join(qa,'legacy'),IMA_BRIDGE_MODULE:join(qa,'not-configured.mjs'),DEEPSEEK_API_KEY_FILE:join(qa,'not-configured.txt')};
Object.assign(process.env,env);
const {calculationBookLocalApi}=await import('../../../vite.config.js');
const {projectStoreApi}=await import('../../../server/project-store.mjs');
const {expansionApi}=await import('../../../server/expansion-api.mjs');
const {intakeApi}=await import('../../../server/intake-api.mjs');
const {calculationPdfApi}=await import('../../../server/calculation-pdf-api.mjs');
const {createBrowserBridge}=await import('../../../server/mcp-browser-bridge.mjs');
const {portableHTML}=await import('../../../deploy/portable/runtime.mjs');
const server=await createServer({root,configFile:false,cacheDir:join(qa,'vite-cache'),server:{host:'127.0.0.1',port:5477,strictPort:true,watch:{ignored:['**/qa/**','**/outputs/**']}},plugins:[
 {name:'calculation-out-qa',transformIndexHtml:{order:'pre',handler(html,ctx){
  // Simulate the UI owner's removal if that separately owned change has not landed yet.
  html=html.replace(/<section class="calcbook-tool-card" aria-labelledby="calcbook-excel-title">[\s\S]*?<\/section>/,'');
  return portableHTML(html,ctx.path);
 }}},createBrowserBridge().plugin,projectStoreApi(env),calculationBookLocalApi(env),calculationPdfApi(env),expansionApi(env),intakeApi(env)]});
await server.listen();console.log(JSON.stringify({url:'http://127.0.0.1:5477',qa,pid:process.pid}));
