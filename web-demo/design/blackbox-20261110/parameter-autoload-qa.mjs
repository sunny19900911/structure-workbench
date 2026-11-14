import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url)),qa=join(root,'qa/portable-release/blackbox/autoload-'+Date.now()),data=join(qa,'runtime'),input=join(qa,'统一参数项目');await mkdir(input,{recursive:true});
const app=process.env.WORKBENCH_TEST_APP||root;
const child=spawn(process.execPath,[join(app,'deploy/portable/start.mjs'),'--port','5468'],{cwd:app,env:{...process.env,WORKBENCH_PORTABLE_DATA:data,WORKBENCH_SOURCE_MODE:app===root?'1':'0',WORKBENCH_SOURCE_RUNTIME:join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies')},stdio:'pipe',windowsHide:true});let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
const base='http://127.0.0.1:5468';let browser;
try{
 for(let i=0;i<150;i++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(base+'/api/portable/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 const r=await fetch(base+'/api/launcher/select',{method:'POST',headers:{'content-type':'application/json','x-workbench-request':'launcher'},body:JSON.stringify({path:input})});assert.ok(r.ok);const selected=await r.json();
 const {chromium}=await import(pathToFileURL(join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();await page.goto(base+'/blackbox',{waitUntil:'domcontentloaded'});
 await page.getByLabel('项目名称',{exact:true}).waitFor({timeout:90000});await page.waitForFunction(()=>!document.getElementById('parameter-save').disabled);
 await writeFile(join(qa,'fields.json'),JSON.stringify(await page.locator('#parameter-fields input,#parameter-fields select').evaluateAll(els=>els.map(e=>({key:e.dataset.parameterKey,label:e.getAttribute('aria-label')}))),null,2));assert.equal(browser.contexts()[0].pages().length,1,'Only the manager is opened');
  const dbg=await page.frames().find(f=>f.url().includes('workbuddy-integrated-studio')).evaluate(()=>({hasRegion:Object.hasOwn(WorkbenchLegacy.params(),'region'),region:WorkbenchLegacy.params().region,el:document.querySelector('[data-k="region"]')?.outerHTML,viewKeys:Object.keys(WorkbenchLegacy.params())}));await writeFile(join(qa,'debug.json'),JSON.stringify({app,dbg},null,2));
 await page.getByLabel('项目名称',{exact:true}).fill('小窗口统一参数测试');await page.locator('[data-parameter-key=region]').fill('测试地点');await page.locator('[data-parameter-key=wind]').fill('0.65');
 await page.locator('#parameter-fields > details > summary').filter({hasText:/^计算与其他参数$/}).click();await page.getByLabel('周期折减系数',{exact:true}).selectOption('0.80');await page.getByLabel('嵌固端位置',{exact:true}).fill('地下室顶板');
 await page.getByRole('button',{name:'保存参数',exact:true}).click();await page.waitForFunction(()=>document.getElementById('message').textContent&&!document.getElementById('parameter-save').disabled,{timeout:30000});assert.equal(await page.locator('#message').textContent(),'参数已保存');
 const engine=page.frameLocator('iframe[title="工作台本地引擎"]');
 assert.equal(await engine.locator('[data-k="wind"]').inputValue(),'0.65');assert.equal(await engine.locator('[data-k="fixed_end"]').inputValue(),'地下室顶板');assert.equal(await engine.locator('[data-k="period_reduce"]').inputValue(),'0.80');
 const old=await(await fetch(base+'/api/workbench-projects/'+selected.projectId+'/main')).json();const main=old.record?.data||old.data;assert.equal(main.parameters.wind,'0.65');assert.equal(main.parameters.region,'测试地点');
 await page.reload({waitUntil:'domcontentloaded'});await page.getByLabel('项目名称',{exact:true}).waitFor({timeout:90000});await page.waitForFunction(()=>!document.getElementById('parameter-save').disabled);assert.equal(await page.getByLabel('项目名称',{exact:true}).inputValue(),'小窗口统一参数测试');
 await page.screenshot({path:join(qa,'自动载入核心参数.png'),fullPage:true});
 const count=await page.locator('#parameter-fields input,#parameter-fields select').count();assert.ok(count>40);
 await page.getByRole('button',{name:'退出后台',exact:true}).click();await page.waitForFunction(()=>document.getElementById('message').textContent.includes('后台已请求退出'),{timeout:15000});await writeFile(join(qa,'result.json'),JSON.stringify({status:'passed',checks:['仅打开小黑箱自动载入输入项','多个参数一次保存','原统一措施同值','保存到main分区','重开恢复','小黑箱自有页面安全释放并退出后台'],fields:count,projectId:selected.projectId},null,2));console.log(qa);
}finally{await browser?.close();child.kill('SIGTERM');}





