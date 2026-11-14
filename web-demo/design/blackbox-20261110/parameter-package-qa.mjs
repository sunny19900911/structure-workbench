import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const sourceRoot=fileURLToPath(new URL('../../',import.meta.url)),root=process.env.WORKBENCH_TEST_APP,qa=join(sourceRoot,'qa/portable-release/blackbox/parameters-'+Date.now()),data=join(qa,'runtime'),input=join(qa,'参数项目');await mkdir(input,{recursive:true});
const child=spawn(process.execPath,[join(root,'deploy/portable/start.mjs'),'--port','5467'],{cwd:root,env:{...process.env,WORKBENCH_PORTABLE_DATA:data,WORKBENCH_SOURCE_MODE:'0',WORKBENCH_SOURCE_RUNTIME:join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies')},stdio:'ignore',windowsHide:true});
const base='http://127.0.0.1:5467';let browser;
async function post(path,body){const r=await fetch(base+'/api/launcher/'+path,{method:'POST',headers:{'content-type':'application/json','x-workbench-request':'launcher'},body:JSON.stringify(body)});const value=await r.json();assert.ok(r.ok,JSON.stringify(value));return value;}
try{
 for(let i=0;i<150;i++){try{if((await fetch(base+'/api/portable/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 const selected=await post('select',{path:input});const {chromium}=await import(pathToFileURL(join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();await page.goto(base+'/workbuddy-integrated-studio.html?project='+selected.projectId,{waitUntil:'domcontentloaded',timeout:90000});await page.waitForFunction(()=>window.WorkbenchProjects?.id&&!WorkbenchProjects.loading&&window.WorkbenchModules?.mcp,{timeout:90000});await page.evaluate(()=>WorkbenchProjects.flush());
 const manager=await browser.newPage();await manager.goto(base+'/blackbox');await manager.locator('#parameter-panel summary').first().click();await manager.locator('#parameter-refresh').click();await manager.locator('#parameter-fields > details > summary').filter({hasText:/^荷载$/}).click();await manager.locator('input[aria-label^="基本风压（50 年一遇）"]').waitFor({timeout:30000});
 const wind=manager.locator('.parameter-field').filter({has:manager.locator('input[aria-label^="基本风压（50 年一遇）"]')});await wind.locator('input').fill('0.55');await wind.getByRole('button',{name:'保存',exact:true}).click();await manager.waitForFunction(()=>document.getElementById('message').textContent==='参数已保存',{timeout:30000});assert.equal(await page.evaluate(()=>WorkbenchLegacy.params().wind),'0.55');
 await manager.reload();await manager.waitForFunction(()=>document.getElementById('project-path').textContent.includes('参数项目'));await manager.locator('#parameter-panel summary').first().click();await manager.locator('#parameter-refresh').click();await manager.waitForFunction(()=>document.querySelector('input[aria-label^="基本风压（50 年一遇）"]')?.value==='0.55');
 const context=(await post('parameters',{projectId:selected.projectId,operation:'project.context'})).result;assert.equal(context.parameters.wind,'0.55');assert.ok((await post('parameters',{projectId:selected.projectId,unit:context.unit,operation:'parameters.read'})).result.fields.some(f=>f.key==='wind'&&f.value==='0.55'));
 const stale=await fetch(base+'/api/launcher/parameters',{method:'POST',headers:{'content-type':'application/json','x-workbench-request':'launcher'},body:JSON.stringify({projectId:selected.projectId,unit:context.unit,operation:'measures.update',expectedRevisions:{...context.revisions,main:0},args:{values:{wind:'99'}}})});assert.equal(stale.status,409);assert.equal(await page.evaluate(()=>WorkbenchLegacy.params().wind),'0.55');
 const beforeView=(await post('parameters',{projectId:selected.projectId,unit:context.unit,operation:'parameters.read'})).result;
 for(const [key,column,value] of [['floor',2,'3.25'],['concrete',1,'C35']]){
  const fresh=(await post('parameters',{projectId:selected.projectId,operation:'project.context'})).result;
  const view=(await post('parameters',{projectId:selected.projectId,unit:fresh.unit,operation:'parameters.read'})).result;
  assert.ok(view.tables[key]?.[1]?.length>column,key+' table');
  await post('parameters',{projectId:selected.projectId,unit:fresh.unit,operation:'measures.table',expectedRevisions:fresh.revisions,args:{key,row:1,column,expectedText:view.tables[key][1][column],value}});
  assert.equal(await page.evaluate(({key,column})=>WorkbenchLegacy.templateContent().templateTables[key][1][column],{key,column}),value);
 }
 await manager.locator('#parameter-refresh').click();
 await manager.locator('#parameter-fields > details > summary').filter({hasText:/^荷载$/}).click();
 await manager.waitForFunction(()=>!document.getElementById('parameter-refresh').disabled);await manager.waitForTimeout(4500);await manager.screenshot({path:join(qa,'核心参数.png'),fullPage:true});
 await writeFile(join(qa,'result.json'),JSON.stringify({projectId:selected.projectId,checks:['原网页同一参数保存','管理页刷新恢复','桥读取同值','旧修订拒绝且值不变','楼面荷载表保存后原网页同值','混凝土表保存后原网页同值'],parameterVersion:context.parameterVersion},null,2));console.log(qa);
}finally{await browser?.close();child.kill('SIGTERM');}



