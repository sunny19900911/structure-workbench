import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const root=fileURLToPath(new URL('../../',import.meta.url)),qa=join(root,'qa/portable-release/blackbox'),base='http://127.0.0.1:5460',data=join(qa,'runtime');
const first=JSON.parse(await readFile(join(qa,'browser-result.json'),'utf8')).projectId,otherPath=join(qa,'切换对照项目');await mkdir(otherPath,{recursive:true});
const post=(path,body)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','X-Workbench-Request':'launcher'},body:JSON.stringify(body)}).then(async r=>{assert.ok(r.ok,await r.clone().text());return r.json();});
const second=(await post('/api/launcher/select',{path:otherPath})).projectId;await post('/api/launcher/select',{path:join(qa,'输入项目 中文')});
const {chromium}=await import(pathToFileURL(join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage(),client=new Client({name:'blackbox-roundtrip-qa',version:'1.0'}),report={first,second};
const transport=new StdioClientTransport({command:process.execPath,args:[join(root,'server/mcp-server.mjs')],env:{...process.env,WORKBENCH_PORTABLE_DATA:data,WORKBENCH_MCP_URL:base},stderr:'pipe'});
let projectId=first;
async function call(name,args){const r=await client.callTool({name:'workbench_'+name,arguments:args},undefined,{timeout:200000}),v=JSON.parse(r.content.find(c=>c.type==='text').text);assert.equal(r.isError,undefined,JSON.stringify(v));return v;}
const context=async()=>(await call('project_context',{projectId,args:{}})).result;
async function invoke(name,args={}){const c=await context();return call(name,{projectId,unit:c.unit,expectedRevisions:c.revisions,args});}
try{
 await client.connect(transport);await page.goto(base+'/workbuddy-integrated-studio.html?project='+first);await page.waitForFunction(()=>window.WorkbenchProjects?.id&&!WorkbenchProjects.loading&&window.WorkbenchOffice,{timeout:90000});await page.evaluate(()=>WorkbenchProjects.flush());
 await page.waitForFunction(async()=>{const s=await(await fetch('/api/mcp-browser/status')).json();return s.clients.some(c=>c.projectId===WorkbenchProjects.id&&c.state==='connected');});
 const generated=(await invoke('office_generate')).result;report.batchId=generated.batchId;report.documentIds=generated.documents.map(d=>d.documentId);report.afterGenerate=await context();assert.equal(report.afterGenerate.hasUnsavedChanges,false);
 await invoke('project_save');report.afterSave=await context();assert.equal(report.afterSave.hasUnsavedChanges,false);
 await invoke('project_open',{targetProjectId:second});projectId=second;assert.equal((await context()).projectId,second);
 await invoke('project_open',{targetProjectId:first});projectId=first;assert.equal((await context()).projectId,first);
 const listed=await call('office_list',{projectId:first});assert.ok(report.documentIds.every(id=>listed.documents.some(d=>d.documentId===id&&d.batchId===report.batchId)));report.switchedAwayAndBack=true;
 report.downloads=[];for(const documentId of report.documentIds){const file=(await call('office_download',{projectId:first,documentId})).artifact;assert.ok(file.path.includes('工作台成果'));assert.equal(file.batchId,report.batchId);report.downloads.push(file);}
 assert.equal(new Set(report.downloads.map(d=>d.path.split(/[\\/]/).slice(0,-1).join('/'))).size,1);report.sameOutputBatch=true;
 console.log(JSON.stringify({batchId:report.batchId,hasUnsavedChanges:report.afterSave.hasUnsavedChanges,switchedAwayAndBack:true,sameOutputBatch:true,files:report.downloads.map(d=>d.path)},null,2));
}catch(e){report.error=e.stack;console.error(e.message);process.exitCode=1;}finally{await writeFile(join(qa,'save-roundtrip-'+Date.now()+'.json'),JSON.stringify(report,null,2),{flag:'wx'});await client.close();await browser.close();}
