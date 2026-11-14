import assert from 'node:assert/strict';
import {mkdir,cp,copyFile,symlink,writeFile,readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {readService} from '../../../deploy/portable/portable-service-lock.mjs';
import {generateMcpConfiguration} from '../../../deploy/portable/mcp-setup.mjs';

const exec=promisify(execFile);
const root=fileURLToPath(new URL('../../../',import.meta.url));
const baseline=join(root,'outputs/portable/结构工作台完整版-含小黑箱与OCR-20261110-build-202219');
const qa=process.argv[2]||join(root,'qa/portable-release/launcher-20261111',String(Date.now()));
const packageRoot=join(qa,'中文 解压目录','结构工作台'),dataRoot=join(qa,'独立项目库');
if(!process.argv[2]){await mkdir(packageRoot,{recursive:true});
// Reuse the complete runtime read-only. Do not duplicate its hundreds of MB.
await symlink(join(baseline,'runtime'),join(packageRoot,'runtime'),'junction');
await cp(join(baseline,'app'),join(packageRoot,'app'),{recursive:true});
await cp(join(root,'deploy/portable'),join(packageRoot,'app/deploy/portable'),{recursive:true});
for(const name of ['launch.ps1','mcp.cmd','生成MCP配置.cmd'])await copyFile(join(root,'deploy/portable',name),join(packageRoot,name));
// Windows PowerShell 5 requires a BOM for the launcher Chinese diagnostics.
const launch=join(packageRoot,'launch.ps1');await writeFile(launch,'\ufeff'+(await readFile(launch,'utf8')).replace(/^\ufeff/,''),'utf8');
}
const env={...process.env,WORKBENCH_PORTABLE_DATA:dataRoot,LAUNCHER_QA_CMD:join(packageRoot,'mcp.cmd')};
const runEntry=()=>new Promise((resolve,reject)=>{const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command','& $env:LAUNCHER_QA_CMD'],{env,windowsHide:true,stdio:'ignore'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('启动入口退出码 '+code)));});
let browser,client;
const report={packageRoot,dataRoot,baseline,runtimeReusedByJunction:true,checks:[]};
try{
 await runEntry();let service;
 for(let i=0;i<180;i++){try{service=await readService(dataRoot);if(service?.url)break;}catch{}await new Promise(r=>setTimeout(r,250));}
 assert.ok(service?.url,'mcp.cmd没有启动服务');report.service=service;
 const health=await(await fetch(service.url+'/api/portable/health')).json();assert.equal(health.instanceId,service.instanceId);assert.equal(health.dataRoot,dataRoot);report.checks.push('中文路径真实mcp.cmd启动及健康身份');
 await runEntry();await new Promise(r=>setTimeout(r,1800));const reused=await readService(dataRoot);assert.equal(reused.instanceId,service.instanceId);report.checks.push('再次双击复用同一后台');
 const config=await generateMcpConfiguration({packageRoot,dataRoot});report.configuration=config.files;
 const connection=JSON.parse(config.workbuddy).mcpServers['structure-workbench'];assert.equal(connection.command,join(packageRoot,'runtime/node/node.exe'));assert.ok((await readFile(config.files.commands,'utf8')).includes(connection.command));
 const python=join(packageRoot,'runtime/python/python.exe');
 const dependencies=await exec(python,['-c','import json,docx,pdfplumber,pdf2image,pypdfium2,onnxruntime;print(json.dumps({"python":True,"pdf":True,"ocr":True}))'],{windowsHide:true});report.dependencies=JSON.parse(dependencies.stdout);
 report.checks.push('随包Python/PDF/OCR依赖可导入，完整runtime保留');
 const {chromium}=await import(pathToFileURL(join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();await page.goto(service.url+'/workbuddy-integrated-studio.html',{waitUntil:'domcontentloaded',timeout:90000});await page.waitForFunction(()=>window.WorkbenchProjects?.id&&!WorkbenchProjects.loading,{timeout:90000});await page.evaluate(()=>WorkbenchProjects.flush());
 const projectId=await page.evaluate(()=>WorkbenchProjects.id);report.projectId=projectId;
 client=new Client({name:'launcher-qa',version:'1'});const transport=new StdioClientTransport({...connection,env:{...process.env,...connection.env},stderr:'pipe'});await client.connect(transport);report.toolCount=(await client.listTools()).tools.length;
 async function call(name,args){const result=await client.callTool({name,arguments:args},undefined,{timeout:180000});assert.ok(!result.isError,JSON.stringify(result));return JSON.parse(result.content.find(c=>c.type==='text').text);}
 const context=(await call('workbench_project_context',{projectId,args:{}})).result;report.unit=context.unit;
 const exported=await call('workbench_export_document',{projectId,unit:context.unit,kind:'measures',format:'docx'});report.artifact=exported.artifact;assert.ok(exported.artifact.bytes>1000);
 const native=await exec(python,['-c','import sys,json,zipfile;from docx import Document;p=sys.argv[1];z=zipfile.ZipFile(p);assert z.testzip() is None;d=Document(p);assert len(d.tables)>0;print(json.dumps({"paragraphs":len(d.paragraphs),"tables":len(d.tables)}))',exported.artifact.path],{windowsHide:true});report.native=JSON.parse(native.stdout);report.checks.push('生成配置启动真实STDIO握手及现有DOCX导出，原生库重读');
 const logs=(await readdir(dataRoot)).filter(n=>n.startsWith('启动错误-'));for(const name of logs)assert.equal((await readFile(join(dataRoot,name),'utf8')).trim(),'');report.checks.push('两次隐藏启动错误日志为空');
 console.log(JSON.stringify(report,null,2));
}catch(error){report.error=error.stack;throw error;}finally{await client?.close();await browser?.close();await writeFile(join(qa,'result.json'),JSON.stringify(report,null,2));}
