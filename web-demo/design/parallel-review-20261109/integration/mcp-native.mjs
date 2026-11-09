// Real STDIO -> isolated local service -> existing composer -> native DOCX.
// The browser hosts business logic only; no Word editor is opened.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join,resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {freshIntake} from '../../../intake-core.js';
const root=fileURLToPath(new URL('../../../',import.meta.url)),qa=join(root,'qa/parallel-review-20261109/integration'),base='http://127.0.0.1:5450';
const health=await(await fetch(base+'/api/portable/health')).json();
assert.equal(resolve(health.dataRoot),resolve(qa),'Only this worktree QA store is allowed');
const runtime=process.env.WORKBENCH_RUNTIME||'C:/Users/mj528/.cache/codex-runtimes/codex-primary-runtime/dependencies';
const {chromium}=await import(pathToFileURL(join(runtime,'node/node_modules/playwright/index.mjs')).href);
const projectId=randomUUID().replaceAll('-',''),unit='QA教学楼',checks=[],errors=[],artifacts={};
const parameters={project_name:'QA结构工作台教学楼',project_code:'QA-WORD-01',software:'QA计算软件 1.0',designer:'QA设计单位',pile_safety:'二级',foundation:'乙级 / 二级',pile:'甲级'};
for(const [part,data] of Object.entries({main:{mode:'blank',parameterVersion:1,parameters},intake:{...freshIntake(),seismicGrades:{[unit]:{}}}})){
 const r=await fetch(base+'/api/workbench-projects/'+projectId+'/'+part,{method:'POST',headers:{'content-type':'application/json','x-workbench-request':'project-store'},body:JSON.stringify({expectedRevision:0,data})});assert.ok(r.ok);
}
const filePaths=['WMASS.OUT','WZQ.OUT','WDISP.OUT'].map(n=>join(qa,n));
const c=(n,title,den,floor,ratio='1.1',rfloor='2')=>`=== 工况${n} === ${title}\n最大层间位移角: 1/${den} (${floor}层)\n最大层间位移与平均层间位移的比值: ${ratio} (${rfloor}层)\n`;
const displacement=[c(1,'X向地震作用',1000,2),c(2,'X向双向地震作用',900,3),c(3,'Y向地震作用',800,4),c(4,'Y向双向地震作用',750,5),c(5,'X向地震作用（考虑偶然偏心）',200,6),c(6,'30度地震作用',100,7),c(7,'X向30度地震作用',50,8),c(8,'X+方向规定水平力',1100,2,'1.25','8'),c(9,'Y-方向规定水平力',1200,3,'1.33','9')].join('\n');
for(const [index,content] of ['结构总质量 (t): 1234\n恒载总质量 (t): 1000\n活载总质量 (t): 234','振型 周期\n1 0.51 0.0 1.0(1.0+0.0) 0.02\n2 0.43 90.0 1.0(0.0+1.0) 0.03',displacement].entries())await writeFile(filePaths[index],content);
const hashes=await Promise.all(filePaths.map(async p=>createHash('sha256').update(await readFile(p)).digest('hex')));
const client=new Client({name:'word-native-mcp-qa',version:'1.0.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[join(root,'server/mcp-server.mjs')],env:{...process.env,WORKBENCH_PORTABLE_DATA:qa,WORKBENCH_MCP_URL:base},stderr:'pipe'});
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage();
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'||/^(data:|blob:)/.test(route.request().url())?route.continue():route.abort());
async function call(name,args={},allowError=false){const reply=await client.callTool({name:'workbench_'+name,arguments:args},undefined,{timeout:220000});const value=JSON.parse(reply.content.find(x=>x.type==='text').text);if(reply.isError&&!allowError)throw Error(name+': '+JSON.stringify(value));return {reply,value};}
async function context(){return(await call('project_context',{projectId,args:{}})).value.result;}
async function invoke(name,args={}){const ctx=await context();return(await call(name,{projectId,unit:name==='project_select_unit'?ctx.unit:unit,expectedRevisions:ctx.revisions,args})).value.result;}
async function check(name,fn){const details=await fn();checks.push({name,passed:true,details});await writeFile(join(qa,'mcp-native-result.json'),JSON.stringify({status:'running',projectId,unit,checks,errors,artifacts},null,2));console.log('PASS '+name);}
try{
 await client.connect(transport);
 await check('STDIO tools and workflow resource',async()=>{const definitions=(await client.listTools()).tools;assert.ok(definitions.some(t=>t.name==='workbench_export_document'));const resource=await client.readResource({uri:'workbench://engineering/workflow'});assert.ok(resource.contents[0].text);return {tools:definitions.length};});
 await check('missing browser is explicit',async()=>{const r=await call('export_document',{projectId,unit,kind:'expansion',format:'docx'},true);assert.ok(r.reply.isError);assert.equal(r.value.code,'BROWSER_REQUIRED');return r.value.code;});
 await page.goto(base+'/workbuddy-integrated-studio.html?project='+projectId);
 await page.waitForFunction(()=>window.WorkbenchProjects?.id&&!window.WorkbenchProjects.loading&&window.ExpansionWorkbench?.mcp,{timeout:90000});
 await page.waitForFunction(async()=>{const s=await(await fetch('/api/mcp-browser/status')).json();return s.clients.some(c=>c.projectId===window.WorkbenchProjects.id);},{},{timeout:20000});
 // Finish the newly seeded project's first-load persistence before the MCP run.
 await page.evaluate(()=>window.WorkbenchProjects.flush());
 await invoke('project_select_unit',{unit});
 await check('model import and native generation through MCP',async()=>{await invoke('document_import',{slot:'yjk',filePaths});await invoke('expansion_generate');const r=await invoke('expansion_read');const text=JSON.stringify(r.tables.metrics);for(const v of ['(1.0 + 0.0)','1/900（3 层）','1/750（5 层）','1.25（8 层）','1.33（9 层）'])assert.ok(text.includes(v),v);return {unit,modelValues:true};});
 await check('parameter update and native table content through MCP',async()=>{
  const before=await context();await invoke('measures_update',{values:{software:'MCP计算软件 2.0'}});
  const stale=await call('measures_update',{projectId,expectedRevisions:before.revisions,args:{values:{software:'过期修改'}}},true);assert.ok(stale.reply.isError);assert.equal(stale.value.code,'REVISION_CONFLICT');
  await invoke('expansion_generate');const r=await invoke('expansion_read');
  for(const [label,value] of [['桩基结构安全等级','一级'],['基础结构重要性系数','1.1'],['桩基结构重要性系数','桩土承载力 1.0；桩身承载力 1.1']]){const row=r.tables.classification.rows.find(x=>x.values[0]===label);assert.ok(row,label);await invoke('expansion_table',{key:'classification',rowKey:row.rowKey,column:1,value});}
  await invoke('project_save');const previousClients=(await(await fetch(base+'/api/mcp-browser/status')).json()).clients.map(c=>c.id);
  await page.reload();await page.waitForFunction(()=>window.WorkbenchProjects?.id&&!window.WorkbenchProjects.loading&&window.ExpansionWorkbench?.mcp,{timeout:90000});
  await page.waitForFunction(async old=>{const s=await(await fetch('/api/mcp-browser/status')).json();return s.clients.some(c=>!old.includes(c.id)&&c.projectId===window.WorkbenchProjects.id&&c.unit==='QA教学楼'&&c.state==='connected');},previousClients,{timeout:20000});
  assert.equal((await context()).parameters.software,'MCP计算软件 2.0');return {staleRevisionRejected:true};
 });
 await check('actual native DOCX exports without opening Word editor',async()=>{
  artifacts.expansion=(await call('export_document',{projectId,unit,kind:'expansion',format:'docx'})).value.artifact;
  // Current shared schema has no unit input. Record this limitation rather than hiding it.
  artifacts.calculation=(await call('calculation_export',{projectId,confirmed:true})).value.artifact;
  for(const artifact of Object.values(artifacts))assert.ok(artifact.bytes>1000);
  assert.ok(page.frames().every(f=>!f.url().includes('office-editor.html')));return artifacts;
 });
 await check('no Office UI and actual three-file generation',async()=>{assert.equal(await page.locator('#office-workspace-open,.office-workspace:visible').count(),0);assert.equal(await page.locator('.office-runtime:visible').count(),0);await page.evaluate(()=>window.WorkbenchProjects.flush());const result=await invoke('office_generate');assert.deepEqual(result.documents.map(d=>d.type),['docx','pptx','xlsx']);for(const d of result.documents){const artifact=(await call('office_download',{projectId,documentId:d.documentId})).value.artifact;assert.ok(artifact.bytes>1000);artifacts[d.type]=artifact;}return {types:result.documents.map(d=>d.type)};});
 await check('saved Office file import and download do not use browser editor',async()=>{
  await page.close();
  const imported=(await call('office_import',{projectId,unit,filePath:artifacts.expansion.path})).value.document;
  artifacts.download=(await call('office_download',{projectId,documentId:imported.documentId})).value.artifact;
  assert.equal(artifacts.download.sha256,artifacts.expansion.sha256);return {documentId:imported.documentId,sameBytes:true};
 });
 assert.deepEqual(await Promise.all(filePaths.map(async p=>createHash('sha256').update(await readFile(p)).digest('hex'))),hashes);
 assert.deepEqual(errors,[]);
 await writeFile(join(qa,'mcp-native-result.json'),JSON.stringify({status:'passed',projectId,unit,checks,errors,artifacts,browserRequired:true,wordEditorOpened:false,syntheticModels:true},null,2));
 console.log(JSON.stringify({passed:checks.length,projectId,artifacts}));
}catch(error){await writeFile(join(qa,'mcp-native-result.json'),JSON.stringify({status:'failed',projectId,unit,checks,errors,error:String(error.stack),artifacts},null,2));throw error;}
finally{await client.close().catch(()=>{});await browser.close();}
