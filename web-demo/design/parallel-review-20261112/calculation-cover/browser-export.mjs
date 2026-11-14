import {createServer} from 'vite';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const qa=join(root,'qa/portable-release/calculation-cover-20261112');await mkdir(qa,{recursive:true});
const runtime='C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1104-2876-0_26.1104.2876.0_x64__3k8sg7r9htsxt/dependencies';
const env={WORKBENCH_PORTABLE:'1',WORKBENCH_PROJECT_STORE:join(qa,'projects'),WORKBENCH_DATABASE_ROOT:qa,WORKBENCH_CACHE_ROOT:join(qa,'cache'),WORKBENCH_PYTHON:join(runtime,'python/python.exe'),CALCBOOK_PYTHON:join(runtime,'python/python.exe'),CALCBOOK_SOURCE_DIR:join(qa,'sources'),CALCBOOK_UPLOAD_DIR:join(qa,'uploads'),EXPANSION_STORE_DIR:join(qa,'legacy'),IMA_BRIDGE_MODULE:join(qa,'not-configured.mjs'),DEEPSEEK_API_KEY_FILE:join(qa,'not-configured.txt')};Object.assign(process.env,env);
const {calculationBookLocalApi}=await import('../../../vite.config.js');
const {projectStoreApi}=await import('../../../server/project-store.mjs');
const {expansionApi}=await import('../../../server/expansion-api.mjs');
const {intakeApi}=await import('../../../server/intake-api.mjs');
const {createBrowserBridge}=await import('../../../server/mcp-browser-bridge.mjs');
const {portableHTML}=await import('../../../deploy/portable/runtime.mjs');
const server=await createServer({root,configFile:false,cacheDir:join(qa,'vite-cache'),server:{host:'127.0.0.1',port:5487,strictPort:true,watch:{ignored:['**/qa/**','**/outputs/**']}},plugins:[{name:'cover-qa',transformIndexHtml:{order:'pre',handler:(html,ctx)=>portableHTML(html,ctx.path)}},createBrowserBridge().plugin,projectStoreApi(env),calculationBookLocalApi(env),expansionApi(env),intakeApi(env)]});
const {chromium}=await import(pathToFileURL(join(runtime,'node/node_modules/playwright/index.mjs')));
let browser;const report={pageErrors:[]};
try{
 await server.listen();const base='http://127.0.0.1:5487';const id=randomUUID().replaceAll('-','');report.projectId=id;
 const parameters={project_name:'科创园研发中心',project_code:'QA-2026-324',discipline:'结构',designer:'同济大学建筑设计研究院(集团)有限公司',software:'QA结构分析软件'};
 const seed=await fetch(base+'/api/workbench-projects/'+id+'/main',{method:'POST',headers:{'Content-Type':'application/json','X-Workbench-Request':'project-store'},body:JSON.stringify({expectedRevision:0,data:{mode:'blank',parameters}})});assert.ok(seed.ok);
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});page.on('pageerror',e=>report.pageErrors.push(e.message));
 page.on('request',r=>{if(r.url().endsWith('/api/calculation-book/export'))report.exportPayload=r.postDataJSON();});
 await page.goto(base+'/workbuddy-integrated-studio.html?project='+id,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(id=>window.WorkbenchProjects?.id===id&&!WorkbenchProjects.loading&&window.WorkbenchFlow&&window.CalculationBook?.mcp,id,{timeout:90000});
 await page.locator('#tab2').click();await page.locator('#ev-unit').fill('1号研发楼');await page.locator('#ev-unit').press('Tab');await page.waitForFunction(()=>ExpansionWorkbench.unit==='1号研发楼'&&ExpansionWorkbench.modelContext()?.identity?.unit==='1号研发楼');
 await page.locator('#tab9').click();await page.locator('#calcbook-confirmed').check();const waiting=page.waitForEvent('download',{timeout:180000});await page.locator('#calcbook-export').click();const download=await waiting;
 report.docx=join(qa,'科创园研发中心-新封面-实际网页导出.docx');await download.saveAs(report.docx);await page.screenshot({path:join(qa,'browser-export.png'),fullPage:true});
 assert.equal(report.exportPayload.project_name,parameters.project_name);assert.equal(report.exportPayload.project_code,parameters.project_code);assert.equal(report.exportPayload.unit,'1号研发楼');
 assert.equal(report.exportPayload.software,parameters.software);
 const versionExport=await fetch(base+'/api/calculation-book/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...report.exportPayload,software_version:'QA-9.9'})});assert.ok(versionExport.ok);report.versionDocx=join(qa,'科创园研发中心-软件版本字段-API导出.docx');await writeFile(report.versionDocx,Buffer.from(await versionExport.arrayBuffer()));
 const template=await fetch(base+'/api/calculation-book/template/cover?project='+id);assert.ok(template.ok);const raw=Buffer.from(await template.arrayBuffer()),asset=await readFile(join(root,'assets/calculation-book/cover-reference.docx'));assert.deepEqual(raw,asset);report.templateSha256=createHash('sha256').update(raw).digest('hex');
 assert.deepEqual(report.pageErrors,[]);report.pass=true;
}catch(error){report.error=error.stack;throw error;}
finally{await writeFile(join(qa,'browser-report.json'),JSON.stringify(report,null,2));await browser?.close();await server.close();console.log(JSON.stringify(report));}
