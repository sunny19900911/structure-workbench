import assert from 'node:assert/strict';
import {readFile,writeFile,lstat,readdir,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {readService} from '../../../deploy/portable/portable-service-lock.mjs';
import {generateMcpConfiguration} from '../../../deploy/portable/mcp-setup.mjs';
const root=process.cwd(),qa=join(root,'qa/portable-release/launcher-20261111/unified'),stage=join(root,'outputs/portable/结构工作台-统一客户端测试-20261111-build-080853');
const dataRoot=join(qa,'独立演示项目库');await mkdir(qa,{recursive:true});
const report={stage,dataRoot,checks:[],source_id:'workbuddy-integrated-studio/legacy-example-before-20260930-blank-fix'};let browser,client;
const exec=promisify(execFile),env={...process.env,WORKBENCH_PORTABLE_DATA:dataRoot,LAUNCHER_QA_CMD:join(stage,'mcp.cmd')};
async function launch(){await new Promise((resolve,reject)=>{const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command','& $env:LAUNCHER_QA_CMD'],{env,windowsHide:true,stdio:'ignore'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('启动失败'+code)));});}
try{
 const inventory=JSON.parse(await readFile(join(stage,'文件校验清单.json'),'utf8'));report.inventoryFiles=Object.keys(inventory).length;
 async function verifyRuntime(dir){for(const ent of await readdir(dir,{withFileTypes:true})){const path=join(dir,ent.name);assert.equal((await lstat(path)).isSymbolicLink(),false,path);if(ent.isDirectory())await verifyRuntime(path);}}
 await verifyRuntime(join(stage,'runtime'));report.checks.push('实体runtime无junction或符号链接');
 for(const file of ['server/mcp-server.mjs','server/mcp-tools.mjs','server/office-package.py','server/geotech-pdf-source.mjs','deploy/portable/start.mjs','deploy/portable/runtime.mjs'])assert.deepEqual(await readFile(join(stage,'app',file)),await readFile(join(root,file)),file);
 report.release=JSON.parse(await readFile(join(stage,'发行版本.json'),'utf8'));assert.equal(report.release.ocrBundled,true);report.checks.push('关键打包业务源码与当前主源码逐字节一致');
 await launch();let service;for(let i=0;i<200;i++){try{service=await readService(dataRoot);if(service?.url)break;}catch{}await new Promise(r=>setTimeout(r,250));}assert.ok(service?.url);report.service=service;
 const health=await(await fetch(service.url+'/api/portable/health')).json();assert.equal(health.instanceId,service.instanceId);assert.equal(health.version,report.release.version);assert.equal(health.dataRoot,dataRoot);report.checks.push('真实mcp.cmd启动、版本与实例一致');
 await launch();await new Promise(r=>setTimeout(r,1200));assert.equal((await readService(dataRoot)).instanceId,service.instanceId);report.checks.push('重复启动复用');
 const config=await generateMcpConfiguration({packageRoot:stage,dataRoot});report.configuration=config.files;
 const {chromium}=await import(pathToFileURL(join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();report.pageErrors=[];page.on('pageerror',e=>report.pageErrors.push(e.message));page.on('response',r=>{if(r.status()>=400)report.pageErrors.push(r.status()+' '+r.url())});await page.goto(service.url+'/workbuddy-integrated-studio.html',{waitUntil:'domcontentloaded',timeout:90000});await page.waitForFunction(()=>window.WorkbenchProjects?.id&&!WorkbenchProjects.loading&&window.WorkbenchLegacy,{timeout:90000});
 await page.waitForFunction(()=>!document.getElementById('wp-sample').disabled&&window.WorkbenchModules?.mcp,null,{timeout:45000});const oldId=await page.evaluate(()=>WorkbenchProjects.id);await page.evaluate(()=>document.getElementById('wp-sample').click());await page.waitForFunction(id=>WorkbenchProjects.id!==id&&!WorkbenchProjects.loading&&WorkbenchProjects.mode==='sample',oldId,{timeout:90000});
 await page.evaluate(async()=>{WorkbenchLegacy.adoptParameters({project_name:'统一客户端验收｜历史示例副本20261111'});WorkbenchLegacy.publish();await WorkbenchProjects.flush();});report.projectId=await page.evaluate(()=>WorkbenchProjects.id);
 report.preparedProjectReload=true;await page.goto(service.url+'/workbuddy-integrated-studio.html?project='+report.projectId,{waitUntil:'domcontentloaded'});await page.waitForFunction(id=>WorkbenchProjects?.id===id&&!WorkbenchProjects.loading&&window.WorkbenchModules?.mcp,report.projectId,{timeout:90000});
 const connection=JSON.parse(config.workbuddy).mcpServers['structure-workbench'];client=new Client({name:'unified-stage-qa',version:'1'});await client.connect(new StdioClientTransport({...connection,env:{...process.env,...connection.env},stderr:'pipe'}));report.toolCount=(await client.listTools()).tools.length;
 async function call(name,args){const response=await client.callTool({name,arguments:args},undefined,{timeout:180000});assert.ok(!response.isError,JSON.stringify(response));return JSON.parse(response.content.find(c=>c.type==='text').text);}
 await page.waitForFunction(async id=>{const s=await(await fetch('/api/mcp-browser/status')).json();return s.clients.some(c=>c.projectId===id&&c.state==='connected');},report.projectId,{timeout:30000});
 report.mcpStatus=await call('workbench_status',{});report.bridgeBeforeContext=await(await fetch(service.url+'/api/mcp-browser/status')).json();
 const context=(await call('workbench_project_context',{projectId:report.projectId,args:{}})).result;report.unit=context.unit;report.parameterVersion=context.parameterVersion;assert.match(context.name,/历史示例副本/);assert.equal(context.hasUnsavedChanges,false);report.parameters=context.parameters;
 report.url=service.url+'/workbuddy-integrated-studio.html?project='+report.projectId;
 const exported=await call('workbench_export_document',{projectId:report.projectId,unit:context.unit,kind:'measures',format:'docx'});report.artifact=exported.artifact;
 const native=await exec(join(stage,'runtime/python/python.exe'),['-I','-c','import sys,json,zipfile;from docx import Document;p=sys.argv[1];z=zipfile.ZipFile(p);assert z.testzip() is None;d=Document(p);s="\\n".join(x.text for x in d.paragraphs);assert "统一客户端验收" in s;print(json.dumps({"paragraphs":len(d.paragraphs),"tables":len(d.tables)}))',report.artifact.path],{windowsHide:true});report.native=JSON.parse(native.stdout);report.checks.push('当前构建真实STDIO项目读取与DOCX导出，原生重读含QA项目名');
 report.artifact.sha256Verified=createHash('sha256').update(await readFile(report.artifact.path)).digest('hex');assert.equal(report.artifact.sha256Verified,report.artifact.sha256);
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(id=>WorkbenchProjects.id===id&&!WorkbenchProjects.loading,report.projectId);assert.match(await page.evaluate(()=>WorkbenchLegacy.params().project_name),/历史示例副本/);report.checks.push('演示副本刷新后保存恢复');
 await call('workbench_open',{projectId:report.projectId});
 console.log(JSON.stringify({projectId:report.projectId,unit:report.unit,url:report.url,artifact:report.artifact,checks:report.checks},null,2));
}catch(error){report.error=error.stack;throw error;}finally{await client?.close();await browser?.close();await writeFile(join(qa,'result.json'),JSON.stringify(report,null,2));}
