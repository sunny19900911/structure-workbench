// Real STDIO client + real offline browser; refuses any non-QA data directory.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const run=promisify(execFile),root=fileURLToPath(new URL('../../',import.meta.url));
const [base,packageRoot]=process.argv.slice(2);
assert.match(base||'',/^http:\/\/127\.0\.0\.1:\d+$/);
const health=await (await fetch(base+'/api/portable/health')).json();
assert.ok(resolve(health.dataRoot).replaceAll('\\','/').startsWith(resolve(root,'qa/portable-release/mcp').replaceAll('\\','/')+'/'),'QA store required');
const output=join(health.dataRoot,'acceptance');await mkdir(output,{recursive:true});
const python=join(packageRoot,'runtime/python/python.exe'),node=join(packageRoot,'runtime/node/node.exe');
const fixtureScript=`from pathlib import Path\nfrom docx import Document\nfrom pypdf import PdfWriter\nimport sys\np=Path(sys.argv[1]);d=Document();d.add_heading('MCP离线验收建筑说明',0);d.add_paragraph('本项目位于云南省昆明市经济技术开发区。');t=d.add_table(rows=2,cols=5)\nfor c,v in zip(t.rows[0].cells,['单体名称','地上层数','建筑高度(m)','建筑面积(㎡)','主要功能']):c.text=v\nfor c,v in zip(t.rows[1].cells,['测试教学楼','5','23.70','1234.56','教学']):c.text=v\nd.save(p/'建筑测试.docx')\nfor i in range(2):\n f=p/'盈建科测试'/'计算书'/'上部'/('原图'+str(i)+'.pdf');f.parent.mkdir(parents=True,exist_ok=True);w=PdfWriter();w.add_blank_page(width=595,height=842);w.write(f)\n`;
await writeFile(join(output,'fixtures.py'),fixtureScript);await run(python,[join(output,'fixtures.py'),output],{windowsHide:true});
const document=join(output,'建筑测试.docx'),sourceHash=createHash('sha256').update(await readFile(document)).digest('hex');
const {chromium}=await import(pathToFileURL(process.env.WORKBENCH_PLAYWRIGHT_ENTRY).href);
const browser=await chromium.launch({headless:true,channel:'msedge'}),page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'||/^(data:|blob:)/.test(route.request().url())?route.continue():route.abort());
const transport=new StdioClientTransport({command:node,args:[join(packageRoot,'app/server/mcp-server.mjs')],env:{...process.env,WORKBENCH_PORTABLE_DATA:health.dataRoot,WORKBENCH_MCP_URL:base},stderr:'pipe'});
const client=new Client({name:'workbench-real-acceptance',version:'1.0.0'});let projectId,unit='项目整体';
async function call(name,args={},allowError=false){const reply=await client.callTool({name,arguments:args},undefined,{timeout:220000});const value=JSON.parse(reply.content.find(c=>c.type==='text').text);if(reply.isError&&!allowError)throw Error(name+': '+JSON.stringify(value));return {reply,value};}
async function context(){return (await call('workbench_project_context',{projectId,args:{}})).value.result;}
async function invoke(name,args={},extra={}){let ctx=await context();const response=await call('workbench_'+name,{projectId,unit,expectedRevisions:ctx.revisions,args,...extra},true);if(response.reply.isError&&response.value.code==='REVISION_CONFLICT'){ctx=await context();return (await call('workbench_'+name,{projectId,unit,expectedRevisions:ctx.revisions,args,...extra})).value;}if(response.reply.isError)throw Error(name+': '+JSON.stringify(response.value));return response.value;}
async function check(name,fn){const details=await fn();checks.push({name,passed:true,details});console.log('PASS '+name);await writeFile(join(output,'browser-result.json'),JSON.stringify({checks,errors,projectId},null,2));return details;}
try{
 await client.connect(transport);
 await check('real STDIO handshake and engineering resources',async()=>{const tools=(await client.listTools()).tools;assert.equal(new Set(tools.map(t=>t.name)).size,tools.length);assert.ok(tools.length>=45);assert.ok((await client.readResource({uri:'workbench://engineering/workflow'})).contents[0].text.includes('source_id'));return {tools:tools.length};});
 await page.goto(base+'/workbuddy-integrated-studio.html');
 await page.waitForFunction(()=>window.WorkbenchProjects?.id&&!window.WorkbenchProjects.loading&&window.WorkbenchModules?.mcp,{timeout:45000});
 projectId=await page.evaluate(()=>window.WorkbenchProjects.id);
 await page.waitForFunction(async()=>{const r=await fetch('/api/mcp-browser/status');return (await r.json()).clients.length>0;},{},{timeout:15000});
 await check('create project via browser business service',async()=>{const v=await invoke('project_create',{name:'MCP 离线验收项目'});projectId=v.context.projectId;assert.equal(v.context.name,'MCP 离线验收项目');return {projectId};});
 await check('update measures and reject stale revision',async()=>{const before=await context();const result=await invoke('measures_update',{values:{wind:'0.35',intensity:'8',pga:'0.20g',seismic_cat:'丙类',site_class:'Ⅱ类'}});assert.equal(String(result.context.parameters.wind),'0.35');const stale=await call('workbench_measures_update',{projectId,expectedRevisions:before.revisions,args:{values:{wind:'9.99'}}},true);assert.equal(stale.reply.isError,true);assert.equal(String((await context()).parameters.wind),'0.35');return 'old revision rejected';});
 await check('edit measure load table and paragraph with text conflict protection',async()=>{const before=(await invoke('measures_read')).result;const original=before.templateTables.floor[1][2];await invoke('measures_table',{key:'floor',row:1,column:2,expectedText:original,value:'3.75'});const changed=(await invoke('measures_read')).result;assert.equal(changed.templateTables.floor[1][2],'3.75');const block=changed.textBlocks.find(p=>p.text.length>15);assert.ok(block);await invoke('measures_text',{id:block.id,expectedText:block.text,text:block.text+' MCP措施人工段落测试。'});assert.ok((await invoke('measures_read')).result.textBlocks.some(p=>p.text.includes('MCP措施人工段落测试')));return {load:3.75,paragraph:block.id};});
 await check('local regulation query runs without external requests',async()=>{const result=(await invoke('regulations_search',{region:'昆明'})).result;assert.ok(JSON.stringify(result).includes('云南'));return {local:true};});
 await check('inspect and import real DOCX through MCP',async()=>{assert.equal((await call('workbench_file_inspect',{filePath:document})).value.detected.family,'word');await invoke('document_import',{slot:'bldg',filePaths:[document]});const ctx=await context();assert.ok(ctx.units.includes('测试教学楼'),JSON.stringify(ctx.units));return ctx.units;});
 await invoke('project_select_unit',{unit:'测试教学楼'});unit='测试教学楼';
 await check('generate native expansion and retain manual paragraph',async()=>{await invoke('expansion_generate');const r=(await invoke('expansion_read')).result;await writeFile(join(output,'expansion-read.json'),JSON.stringify(r,null,2));const entries=Object.entries(r.sections);assert.ok(entries.length>5);const [sectionId,section]=entries.find(([key])=>key==='overview')||entries[0];await invoke('expansion_edit',{sectionId,expectedText:section.text,text:section.text+'\n本段为MCP人工改稿保留验收。'});await invoke('measures_update',{values:{wind:'0.40'}});await invoke('expansion_generate');const next=(await invoke('expansion_read')).result;assert.ok(next.sections[sectionId].text.includes('MCP人工改稿保留验收'));return {sectionId};});
 const artifacts=[];
 await check('actual expansion and measures DOCX export',async()=>{for(const kind of ['expansion','measures']){const v=(await call('workbench_export_document',{projectId,unit,kind,format:'docx'})).value;artifacts.push(v.artifact);assert.ok(v.artifact.bytes>1000);}return artifacts;});
 await check('actual PPTX export through same browser composer',async()=>{await invoke('ppt_read');const v=await invoke('ppt_export');assert.ok(v.artifact.bytes>10000);artifacts.push(v.artifact);return v.artifact;});
 await check('actual calculation DOCX export',async()=>{const v=(await call('workbench_calculation_export',{projectId,confirmed:true})).value;assert.ok(v.artifact.bytes>1000);artifacts.push(v.artifact);return v.artifact;});
 await check('YJK PDF scan and merge keep original pages',async()=>{const scan=(await call('workbench_pdf_scan',{path:join(output,'盈建科测试')})).value;assert.equal(scan.files.length,2);const v=(await call('workbench_pdf_merge',{ids:scan.files.map(f=>f.id)})).value;artifacts.push(v.artifact);return v.artifact;});
 await check('backup and import use a new independent project',async()=>{await invoke('project_save');const exported=(await call('workbench_project_backup',{projectId})).value;const imported=(await call('workbench_project_import',{filePath:exported.artifact.path})).value;assert.notEqual(imported.projectId,projectId);const list=(await call('workbench_project_list')).value.projects;assert.ok(list.some(p=>p.id===projectId));assert.ok(list.some(p=>p.id===imported.projectId));return {imported:imported.projectId};});
 const verification=`import sys,zipfile,json\nfrom pathlib import Path\nfrom pypdf import PdfReader\nfrom lxml import etree\nfiles=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'));results=[]\nfor f in files:\n p=Path(f['path'])\n if p.suffix=='.pdf':assert len(PdfReader(p).pages)==2;results.append({'name':p.name,'pages':2});continue\n with zipfile.ZipFile(p) as z:\n  assert z.testzip() is None\n  for n in z.namelist():\n   if n.endswith('.xml'):etree.fromstring(z.read(n))\n  if p.suffix=='.pptx':assert len([n for n in z.namelist() if n.startswith('ppt/slides/slide') and n.endswith('.xml')])>5\n  if p.suffix=='.docx':assert 'word/document.xml' in z.namelist();assert len(''.join(etree.fromstring(z.read('word/document.xml')).itertext()))>50\n  if '结构初步设计说明' in p.name:assert 'MCP人工改稿保留验收' in ''.join(etree.fromstring(z.read('word/document.xml')).itertext())\n results.append({'name':p.name,'validated':True})\nprint(json.dumps(results,ensure_ascii=False))\n`;
 await writeFile(join(output,'artifacts.json'),JSON.stringify(artifacts));await writeFile(join(output,'verify.py'),verification);
 await check('reopen Office/PDF outputs and verify original source hash',async()=>{const result=await run(python,[join(output,'verify.py'),join(output,'artifacts.json')],{windowsHide:true,env:{...process.env,PYTHONUTF8:'1'}});assert.equal(createHash('sha256').update(await readFile(document)).digest('hex'),sourceHash);return JSON.parse(result.stdout);});
 assert.deepEqual(errors,[]);await page.screenshot({path:join(output,'MCP离线工作台.png'),fullPage:false});
 console.log(JSON.stringify({passed:checks.length,output,projectId}));
}catch(e){await page.screenshot({path:join(output,'failure.png')}).catch(()=>{});await writeFile(join(output,'failure.txt'),String(e.stack));throw e;}
finally{await client.close().catch(()=>{});await browser.close();}
