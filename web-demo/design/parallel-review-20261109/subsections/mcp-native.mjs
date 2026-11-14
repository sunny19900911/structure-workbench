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
const root=fileURLToPath(new URL('../../../',import.meta.url)),qa=join(root,'qa/parallel-review-20261109/subsections'),base='http://127.0.0.1:5453';
const health=await(await fetch(base+'/api/portable/health')).json();
assert.equal(resolve(health.dataRoot),resolve(qa),'Only this worktree QA store is allowed');
const runtime=process.env.WORKBENCH_RUNTIME||'C:/Users/mj528/.cache/codex-runtimes/codex-primary-runtime/dependencies';
const {chromium}=await import(pathToFileURL(join(runtime,'node/node_modules/playwright/index.mjs')).href);
const projectId=randomUUID().replaceAll('-',''),unit='QA教学楼',checks=[],errors=[],artifacts={};
const parameters={project_name:'QA结构工作台教学楼',project_code:'QA-WORD-01',software:'QA计算软件 1.0',designer:'QA设计单位',pile_safety:'二级',foundation:'乙级 / 二级',pile:'甲级'};
for(const [part,data] of Object.entries({main:{mode:'blank',parameterVersion:1,parameters},intake:{...freshIntake(),seismicGrades:{[unit]:{}}}})){
 const r=await fetch(base+'/api/workbench-projects/'+projectId+'/'+part,{method:'POST',headers:{'content-type':'application/json','x-workbench-request':'project-store'},body:JSON.stringify({expectedRevision:0,data})});assert.ok(r.ok);
}
const client=new Client({name:'word-native-mcp-qa',version:'1.0.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[join(root,'server/mcp-server.mjs')],env:{...process.env,WORKBENCH_PORTABLE_DATA:qa,WORKBENCH_MCP_URL:base},stderr:'pipe'});
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage();
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'||/^(data:|blob:)/.test(route.request().url())?route.continue():route.abort());
async function call(name,args={},allowError=false){const reply=await client.callTool({name:'workbench_'+name,arguments:args},undefined,{timeout:220000});const value=JSON.parse(reply.content.find(x=>x.type==='text').text);if(reply.isError&&!allowError)throw Error(name+': '+JSON.stringify(value));return {reply,value};}
async function context(){return(await call('project_context',{projectId,args:{}})).value.result;}
async function invoke(name,args={}){const ctx=await context();return(await call(name,{projectId,unit:name==='project_select_unit'?ctx.unit:unit,expectedRevisions:ctx.revisions,args})).value.result;}
async function check(name,fn){const details=await fn();checks.push({name,passed:true,details});await writeFile(join(qa,'result.json'),JSON.stringify({status:'running',projectId,unit,checks,errors,artifacts},null,2));console.log('PASS '+name);}
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
 await invoke('expansion_generate');
 const original=(await invoke('expansion_read')).sections;
 const ground='4.1 场地地形及地貌\nQA相邻段落一。\n\n4.2 场地地层岩性构成\nQA地层描述，较长内容需要简化。\n\n4.3 地基土层物理力学参数\nQA相邻段落三。\n'+(original.ground.text.match(/\{\{[pfmrt]:[^{}]+\}\}|\[\[(?:table|image|measures):[^\]]+\]\]/g)||[]).join('\n');
 await invoke('expansion_edit',{sectionId:'ground',expectedText:original.ground.text,text:ground});
 const before=await invoke('expansion_read');
 await check('outline and local read through STDIO',async()=>{
  const outline=await invoke('expansion_outline');
  assert.ok(outline.find(s=>s.sectionId==='ground').subsections.some(s=>s.id==='4.2'));
  const local=await invoke('expansion_subsection_read',{sectionId:'ground',subsectionId:'4.2'});
  assert.equal(local.text,'QA地层描述，较长内容需要简化。\n\n');
 });
 await check('local edit preserves other chapters and tables',async()=>{
  const local=await invoke('expansion_subsection_read',{sectionId:'ground',subsectionId:'4.2'});
  const result=await invoke('expansion_subsection_edit',{sectionId:'ground',subsectionId:'4.2',expectedText:local.text,text:'QA地层简述。'});
  assert.equal(result.previousText,local.text);
  const after=await invoke('expansion_read');
  assert.equal(after.sections.ground.text,ground.replace('QA地层描述，较长内容需要简化。','QA地层简述。'));
  assert.deepEqual(after.tables,before.tables);assert.deepEqual(after.imageSlots,before.imageSlots);
  for(const [key,value] of Object.entries(before.sections))if(key!=='ground')assert.deepEqual(after.sections[key],value);
 });
 await invoke('project_save');
 const previousClients=(await(await fetch(base+'/api/mcp-browser/status')).json()).clients.map(c=>c.id);
 await page.reload();
 await page.waitForFunction(()=>window.WorkbenchProjects?.id&&!window.WorkbenchProjects.loading&&window.ExpansionWorkbench?.mcp,{timeout:90000});
 await page.waitForFunction(async old=>{const s=await(await fetch('/api/mcp-browser/status')).json();return s.clients.some(c=>!old.includes(c.id)&&c.projectId===window.WorkbenchProjects.id&&c.unit==='QA教学楼'&&c.state==='connected');},previousClients,{timeout:20000});
 await check('reload retains local edit',async()=>{const r=await invoke('expansion_subsection_read',{sectionId:'ground',subsectionId:'4.2'});assert.equal(r.text,'QA地层简述。\n\n');});
 await check('actual DOCX export',async()=>{
  artifacts.expansion=(await call('export_document',{projectId,unit,kind:'expansion',format:'docx'})).value.artifact;
  assert.ok(artifacts.expansion.bytes>1000);
 });
 assert.deepEqual(errors,[]);
 await writeFile(join(qa,'result.json'),JSON.stringify({status:'passed',projectId,unit,checks,errors,artifacts,browserRequired:true,wordEditorOpened:false,syntheticModels:true},null,2));
 console.log(JSON.stringify({passed:checks.length,projectId,artifacts}));
}catch(error){await writeFile(join(qa,'result.json'),JSON.stringify({status:'failed',projectId,unit,checks,errors,error:String(error.stack),artifacts},null,2));throw error;}
finally{await client.close().catch(()=>{});await browser.close();}
