// Real SDK STDIO + browser + local project store; no client configuration changes.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {homedir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const root=fileURLToPath(new URL('../../',import.meta.url)),run=promisify(execFile);
const [base='http://127.0.0.1:58842',projectId='63385ab566d740ffaca53f29519c91b0']=process.argv.slice(2);
assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/);assert.match(projectId,/^[a-f0-9]{32}$/);
const health=await(await fetch(base+'/api/portable/health')).json();
assert.ok(resolve(health.dataRoot).replaceAll('\\','/').startsWith(resolve(root,'qa/portable-release/mcp').replaceAll('\\','/')+'/'),'Refusing non-QA store');
const output=join(health.dataRoot,'office-mcp-e2e-'+Date.now());await mkdir(output,{recursive:true});
const runtime=join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies');
const python=process.env.WORKBENCH_PYTHON||join(runtime,'python/python.exe');
const playwright=process.env.WORKBENCH_PLAYWRIGHT_ENTRY||join(runtime,'node/node_modules/playwright/index.mjs');
const {chromium}=await import(pathToFileURL(playwright).href);
const browser=await chromium.launch({headless:true,channel:'msedge'}),browserContext=await browser.newContext({viewport:{width:1600,height:1100}}),page=await browserContext.newPage();
page.setDefaultTimeout(120000);const errors=[],blocked=[],checks=[];let unit='项目整体',batch;
page.on('pageerror',e=>errors.push(e.message));
await browserContext.route('**/*',route=>{const u=route.request().url();if(/^(blob:|data:)/.test(u)||new URL(u).hostname==='127.0.0.1')return route.continue();blocked.push(u);return route.abort();});
const client=new Client({name:'office-native-real-e2e',version:'1.0.0'});
const packageRoot=process.env.WORKBENCH_TEST_PACKAGE_ROOT;
const transport=new StdioClientTransport({command:packageRoot?join(packageRoot,'runtime/node/node.exe'):process.execPath,args:[packageRoot?join(packageRoot,'app/server/mcp-server.mjs'):join(root,'server/mcp-server.mjs')],env:{...process.env,WORKBENCH_PORTABLE_DATA:health.dataRoot,WORKBENCH_MCP_URL:base},stderr:'pipe'});
async function call(name,args={},allowError=false){
 const response=await client.callTool({name:'workbench_'+name,arguments:args},undefined,{timeout:220000});
 const value=JSON.parse(response.content.find(c=>c.type==='text').text);
 if(response.isError&&!allowError)throw Error(name+': '+JSON.stringify(value));return {value,response};
}
async function context(){return (await call('project_context',{projectId,args:{}})).value.result;}
async function invoke(name,args={}){
 let current=await context();let response=await call(name,{projectId,unit,expectedRevisions:current.revisions,args},true);
 if(response.response.isError&&response.value.code==='REVISION_CONFLICT'){
  current=await context();response=await call(name,{projectId,unit,expectedRevisions:current.revisions,args},true);
 }
 if(response.response.isError)throw Error(name+': '+JSON.stringify(response.value));return response.value.result;
}
async function check(name,fn){const details=await fn();checks.push({name,passed:true,details});console.log('PASS '+name);await writeFile(join(output,'results.json'),JSON.stringify({checks,errors,blocked,projectId,batch},null,2));return details;}
try{
 await client.connect(transport);
 await check('real STDIO publishes all Office command tools',async()=>{const tools=(await client.listTools()).tools;assert.ok(tools.length>=64);for(const name of ['office_generate','office_read','office_command','office_save','office_download','office_versions','office_import','office_list'])assert.ok(tools.some(t=>t.name==='workbench_'+name));return {count:tools.length};});
 await page.goto(base+'/workbuddy-integrated-studio.html?project='+projectId);
 await page.waitForFunction(()=>window.WorkbenchOffice&&window.WorkbenchProjects?.id&&!window.WorkbenchProjects.loading&&window.WorkbenchModules?.mcp);
 await page.waitForFunction(async()=>{const r=await fetch('/api/mcp-browser/status');return (await r.json()).clients.length>0;});
 await invoke('project_select_unit',{unit:'测试教学楼'});unit='测试教学楼';
 const original=(await call('office_list',{projectId,unit})).value.documents;
 batch=await check('MCP generates three real files with one batch and source version',async()=>{
  const value=await invoke('office_generate');assert.equal(value.documents.length,3);assert.equal(value.engineeringApproval,false);assert.equal(value.draft,true);
  assert.equal(new Set(value.documents.map(d=>d.batchId)).size,1);assert.equal(typeof value.sourceParameterVersion,'number');
  for(const document of value.documents)assert.equal(document.sourceParameterVersion,value.sourceParameterVersion);
  const latest=(await call('office_list',{projectId,unit})).value.documents;
  for(const old of original){const same=latest.find(d=>d.documentId===old.documentId);assert.ok(same);assert.equal(same.sha256,old.sha256);assert.equal(same.fileRevision,old.fileRevision);}
  return value;
 });
 const markers={docx:'MCP Word 原生修改成功',xlsx:'MCP Excel 原生修改成功',pptx:'MCP PPT 原生修改成功'},targets={};
 for(const type of ['docx','xlsx','pptx']){
  await check('MCP reads edits saves reopens '+type,async()=>{
   const document=batch.documents.find(d=>d.type===type),id=document.documentId;
   const before=await invoke('office_read',{documentId:id});let command;
   if(type==='docx')command={name:'text.replace',args:{expectedText:'办公平台文字验收唯一标记',text:markers[type]}};
   else if(type==='xlsx'){const sheet=before.view.sheets.find(s=>s.name==='项目参数'),cell=sheet.cells.find(c=>c.address==='B3');targets.xlsx={sheet:sheet.name,address:cell.address};command={name:'cell.set',args:{...targets.xlsx,expectedText:cell.text,text:markers[type]}};}
   else{let selected;for(const slide of before.view.slides){const shape=slide.shapes.find(s=>s.editable&&s.text&&s.text.length>4&&!s.text.includes('\n'));if(shape){selected={slide,shape};break;}}assert.ok(selected);targets.pptx={slide:selected.slide.number,shapeId:selected.shape.id};command={name:'shape.text',args:{...targets.pptx,expectedText:selected.shape.text,text:markers[type]}};}
   const changed=await invoke('office_command',{documentId:id,expectedRevision:before.document.fileRevision,...command});assert.equal(changed.document.fileRevision,2);assert.equal(changed.dirty,false);assert.equal(changed.engineeringApproval,false);
   const saved=await invoke('office_save',{documentId:id,expectedRevision:2});assert.equal(saved.document.fileRevision,2);
   await invoke('office_open',{documentId:id});const reopened=await invoke('office_read',{documentId:id});
   assert.ok(JSON.stringify(reopened).includes(markers[type]));
   const ctx=await context();const stale=await call('office_command',{projectId,unit,expectedRevisions:ctx.revisions,args:{documentId:id,expectedRevision:1,...command}},true);
   assert.equal(stale.response.isError,true);assert.equal(stale.value.code,'REVISION_CONFLICT');
   const versions=(await call('office_versions',{projectId,documentId:id})).value.versions;assert.equal(versions.length,2);
   await page.screenshot({path:join(output,'MCP-'+type+'.png')});return {documentId:id,revision:2,versions:versions.length};
  });
 }
 const artifacts=[];
 await check('MCP downloads native current files and immutable historical versions',async()=>{
  for(const document of batch.documents){
   const latest=(await call('office_download',{projectId,documentId:document.documentId})).value;assert.equal(latest.document.fileRevision,2);assert.ok(latest.artifact.bytes>1000);artifacts.push({...latest.artifact,type:document.type});
   const old=(await call('office_download',{projectId,documentId:document.documentId,revision:1})).value;assert.equal(old.document.sha256,document.sha256);assert.equal(old.artifact.sha256,document.sha256);
  }
  return artifacts;
 });
 await check('generating a later batch retains all manually edited native originals',async()=>{
  const before=(await call('office_list',{projectId,unit})).value.documents;const later=await invoke('office_generate');assert.notEqual(later.batchId,batch.batchId);
  const after=(await call('office_list',{projectId,unit})).value.documents;assert.equal(after.length,before.length+3);
  for(const old of before){const same=after.find(d=>d.documentId===old.documentId);assert.equal(same.sha256,old.sha256);assert.equal(same.fileRevision,old.fileRevision);}
  return {laterBatchId:later.batchId,total:after.length};
 });
 await check('reopen MCP-produced native files independently',async()=>{
  const script=`import sys,json,zipfile\nfrom pathlib import Path\nfrom openpyxl import load_workbook\nfrom pptx import Presentation\nfrom lxml import etree\ns=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'));files={x['type']:x['path'] for x in s['artifacts']}\nwith zipfile.ZipFile(files['docx']) as z:\n assert z.testzip() is None\n assert s['markers']['docx'] in ''.join(etree.fromstring(z.read('word/document.xml')).itertext())\nw=load_workbook(files['xlsx']);assert w[s['targets']['xlsx']['sheet']][s['targets']['xlsx']['address']].value==s['markers']['xlsx']\np=Presentation(files['pptx']);sl=p.slides[s['targets']['pptx']['slide']-1];sh=next(sh for sh in sl.shapes if str(sh.shape_id)==s['targets']['pptx']['shapeId']);assert sh.text==s['markers']['pptx']\nprint(json.dumps({'docx':True,'xlsx':True,'pptx':True}))\n`;
  await writeFile(join(output,'verify.py'),script);await writeFile(join(output,'artifacts.json'),JSON.stringify({artifacts,markers,targets},null,2));
  return JSON.parse((await run(python,[join(output,'verify.py'),join(output,'artifacts.json')],{windowsHide:true,env:{...process.env,PYTHONUTF8:'1'}})).stdout);
 });
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:checks.length,output,projectId}));
}catch(error){await page.screenshot({path:join(output,'failure.png')}).catch(()=>{});await writeFile(join(output,'failure.txt'),error.stack||String(error));await writeFile(join(output,'results.json'),JSON.stringify({checks,errors,blocked,projectId,batch},null,2));console.error('OUTPUT '+output);throw error;}
finally{await client.close().catch(()=>{});await browser.close();}
