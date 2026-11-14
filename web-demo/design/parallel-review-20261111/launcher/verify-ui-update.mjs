import assert from 'node:assert/strict';
import {readFile,writeFile,cp,open,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readService} from '../../../deploy/portable/portable-service-lock.mjs';
import {generateMcpConfiguration} from '../../../deploy/portable/mcp-setup.mjs';

const root=process.cwd();
const target=JSON.parse(await readFile(join(root,'qa/portable-release/launcher-20261111/latest-ui-update.json'),'utf8'));
const manifest=JSON.parse(await readFile(join(target.qa,'sync-manifest.json'),'utf8'));
const testData=join(target.qa,'验收隔离库');
await cp(target.dataRoot,testData,{recursive:true,errorOnExist:true,force:false});
const originalHealth=await(await fetch('http://127.0.0.1:58726/api/portable/health')).json();
const report={target,testData,originalInstanceId:originalHealth.instanceId,checks:[],errors:[]};
let testProcess,browser;

async function start(dataRoot,port,label){
 const log=await open(join(target.qa,label+'.log'),'a');
 const child=spawn(join(target.stage,'runtime/node/node.exe'),[join(target.stage,'app/deploy/portable/start.mjs'),'--port',String(port)],{
  env:{...process.env,WORKBENCH_PORTABLE_DATA:dataRoot,WORKBENCH_SOURCE_MODE:'0'},
  cwd:target.stage,windowsHide:true,detached:true,stdio:['ignore',log.fd,log.fd]
 });
 child.unref();await log.close();
 for(let attempt=0;attempt<200;attempt++){
  let service;try{service=await readService(dataRoot);}catch{}
  if(service?.url)return {child,service};
  if(child.exitCode!==null)throw Error(label+' startup failed');
  await new Promise(resolve=>setTimeout(resolve,200));
 }
 throw Error(label+' startup timeout');
}

try{
 const started=await start(testData,5468,'qa-service');testProcess=started.child;report.qaService=started.service;
 const {chromium}=await import(pathToFileURL(join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
 browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage();
 page.on('pageerror',error=>report.errors.push(error.message));
 const projectId='f9c4aedac9c943b699306ef633395d48';
 await page.goto(started.service.url+'/workbuddy-integrated-studio.html?project='+projectId,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(id=>window.WorkbenchProjects?.id===id&&!WorkbenchProjects.loading&&window.WorkbenchModules?.mcp,projectId,{timeout:90000});
 await page.evaluate(()=>ExpansionWorkbench.selectUnit('学生宿舍'));
 await page.waitForFunction(()=>CalculationBook.mcp.read().outFiles.length===3,null,{timeout:30000});
 report.out=await page.evaluate(()=>{const value=CalculationBook.mcp.read();return {unit:ExpansionWorkbench.unit,files:value.outFiles.map(file=>file.name),source:value.outSource,missing:value.missingOut};});
 assert.equal(report.out.files.length,3);report.checks.push('复制库学生宿舍恢复3个已保存OUT');
 assert.equal(await page.locator('#calcbook-excel-title').count(),0);
 assert.equal(await page.locator('body').innerText().then(text=>text.includes('DeepSeek')),false);
 report.checks.push('实际新App无Excel试算卡和可见DeepSeek入口');
 await page.evaluate(()=>WorkbenchLegacy.go(9));
 report.outText=await page.locator('#calcbook-out-state').innerText();
 await page.screenshot({path:join(target.qa,'计算书恢复.png'),fullPage:true});
 await page.locator('#tab11').click();
 await page.evaluate(()=>WorkbenchModules.mcp.openPpt('学生宿舍'));
 await page.locator('#im-ppt-frame').waitFor({state:'visible',timeout:30000});
 report.ppt=await page.evaluate(()=>{const host=document.getElementById('im-ppt-frame');return {visible:host.getBoundingClientRect().height>0,ready:!!host.contentWindow.WorkbenchPpt?.mcp?.ready};});
 assert.equal(report.ppt.visible,true);assert.equal(report.ppt.ready,true);
 report.checks.push('新App的PPT导航与真实iframe可用');
 await page.screenshot({path:join(target.qa,'PPT恢复.png'),fullPage:true});
 await page.evaluate(()=>WorkbenchProjects.mcp.open('2a1ccf080c3e4b5f9d795e4e7b357b82'));
 await page.waitForFunction(()=>!WorkbenchProjects.loading&&WorkbenchProjects.id==='2a1ccf080c3e4b5f9d795e4e7b357b82');
 report.userProject=await page.evaluate(()=>({projectId:WorkbenchProjects.id,unit:ExpansionWorkbench.unit,outCount:CalculationBook.mcp.read().outFiles.length}));
 assert.equal(report.userProject.projectId,'2a1ccf080c3e4b5f9d795e4e7b357b82');
 report.checks.push('用户手测项目副本可正常打开并读取计算书状态');
 assert.deepEqual(report.errors,[]);
 for(const [relative,expected]of Object.entries(manifest.snapshotFiles)){
  const actual=createHash('sha256').update(await readFile(join(target.dataRoot,relative))).digest('hex');
  assert.equal(actual,expected,relative);
 }
 report.checks.push('验收写入限测试库，人工继续测试副本原文件hash保持');
 const manual=await start(target.dataRoot,58727,'manual-service');
 report.manualService=manual.service;
 report.configuration=(await generateMcpConfiguration({packageRoot:target.stage,dataRoot:target.dataRoot})).files;
 const stillRunning=await(await fetch('http://127.0.0.1:58726/api/portable/health')).json();
 assert.equal(stillRunning.instanceId,originalHealth.instanceId);report.checks.push('原58726实例保持运行');
 const wrapper='@echo off\r\nchcp 65001 >nul\r\nset "WORKBENCH_PORTABLE_DATA=%~dp0已保存数据副本"\r\ncall "'+join(target.stage,'mcp.cmd')+'"\r\nexit /b\r\n';
 await writeFile(join(target.qa,'启动修后工作台.cmd'),wrapper,'utf8');
 report.manualUrls={userProject:manual.service.url+'/workbuddy-integrated-studio.html?project=2a1ccf080c3e4b5f9d795e4e7b357b82',engineeringProject:manual.service.url+'/workbuddy-integrated-studio.html?project=f9c4aedac9c943b699306ef633395d48'};
 console.log(JSON.stringify({qa:target.qa,stage:target.stage,service:report.manualService,urls:report.manualUrls,checks:report.checks},null,2));
}catch(error){report.error=error.stack;throw error;}
finally{
 await browser?.close();testProcess?.kill('SIGTERM');
 await writeFile(join(target.qa,'verification.json'),JSON.stringify(report,null,2));
}
