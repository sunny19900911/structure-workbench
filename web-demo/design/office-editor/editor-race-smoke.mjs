// Isolated browser regressions for document switching and failed/late saves.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Document,Packer,Paragraph} from 'docx';
const root=fileURLToPath(new URL('../../',import.meta.url)),base=process.argv[2]||'http://127.0.0.1:58842';
assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/);
const health=await(await fetch(base+'/api/portable/health')).json();
assert.ok(resolve(health.dataRoot).replaceAll('\\','/').startsWith(resolve(root,'qa/portable-release/mcp').replaceAll('\\','/')+'/'),'Refusing non-QA store');
const output=join(health.dataRoot,'editor-race-'+Date.now());await mkdir(output,{recursive:true});
const playwright=process.env.WORKBENCH_PLAYWRIGHT_ENTRY||join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const {chromium}=await import(pathToFileURL(playwright).href);
const browser=await chromium.launch({headless:true,channel:'msedge'}),context=await browser.newContext({viewport:{width:1500,height:1050}}),page=await context.newPage();page.setDefaultTimeout(120000);
const errors=[],checks=[],blocked=[];let projectId,word,excel;
page.on('pageerror',e=>errors.push(e.message));
await context.route('**/*',route=>{const u=route.request().url();if(/^(data:|blob:)/.test(u)||new URL(u).hostname==='127.0.0.1')return route.continue();blocked.push(u);return route.abort();});
async function api(path,options={}){const r=await fetch(base+'/api/office-documents/'+path,options),value=await r.json();assert.ok(r.ok,JSON.stringify(value));return value;}
async function check(name,action){const details=await action();checks.push({name,passed:true,details});console.log('PASS '+name);await writeFile(join(output,'results.json'),JSON.stringify({checks,errors,blocked,projectId,word,excel},null,2));return details;}
const currentFrame=()=>page.frames().find(f=>f.url().includes('/office-editor.html'));
try{
 await page.goto(base+'/workbuddy-integrated-studio.html');
 await page.waitForFunction(()=>window.WorkbenchOffice&&window.WorkbenchProjects?.id&&!window.WorkbenchProjects.loading);
 await check('create fresh project and real native files in QA store',async()=>{
  projectId=(await page.evaluate(()=>window.WorkbenchProjects.mcp.create('编辑保存竞态隔离验收'))).projectId;
  await page.evaluate(()=>window.WorkbenchProjects.flush());
  const bytes=await Packer.toBuffer(new Document({sections:[{children:[new Paragraph('Word竞态原始文字')]}]}));
  word=(await api(projectId+'?type=docx',{method:'POST',headers:{'X-Workbench-Request':'office-documents','X-File-Name':encodeURIComponent('Word竞态验收'),'X-Document-Unit':encodeURIComponent('项目整体')},body:bytes})).document;
  excel=(await api(projectId+'/generate-xlsx',{method:'POST',headers:{'X-Workbench-Request':'office-documents','Content-Type':'application/json'},body:JSON.stringify({title:'Excel竞态验收',unit:'项目整体',parameters:[{name:'参数甲',value:'原始格值'},{name:'参数乙',value:'不能覆盖失败草稿'}]})})).document;
  return {projectId,word:word.documentId,excel:excel.documentId};
 });
 await check('concurrent opens admit one target and never return another document',async()=>{
  const result=await page.evaluate(async ids=>{
   const results=await Promise.allSettled([window.WorkbenchOffice.open(ids[0]),window.WorkbenchOffice.open(ids[1])]);
   return results.map(x=>x.status==='fulfilled'?{status:x.status,id:x.value.document.documentId,projectId:x.value.document.projectId}:{status:x.status,message:x.reason.message});
  },[word.documentId,excel.documentId]);
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.filter(r=>r.status==='rejected').length,1);
  assert.equal(result.find(r=>r.status==='fulfilled').id,word.documentId);
  assert.equal(result.find(r=>r.status==='fulfilled').projectId,projectId);
  const current=await page.evaluate(id=>window.WorkbenchOffice.read(id),word.documentId);assert.equal(current.document.documentId,word.documentId);
  const other=await page.evaluate(id=>window.WorkbenchOffice.read(id),excel.documentId);assert.equal(other.document.documentId,excel.documentId);assert.equal(other.document.projectId,projectId);
  return result;
 });
 await check('failed Excel save retains pending text and locks other cells until reverted',async()=>{
  const routeURL=`${base}/api/office-documents/${projectId}/${excel.documentId}/command`;let rejected=0;
  const rejectCommand=async route=>{rejected++;await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'测试：版本冲突，原文件未改变',code:'REVISION_CONFLICT'})});};
  await context.route(routeURL,rejectCommand);
  const frame=currentFrame();assert.ok(frame);const input=frame.getByRole('textbox',{name:'项目参数 B3',exact:true});const original=await input.inputValue();assert.equal(original,'原始格值');
  await input.fill('失败保存的新草稿必须保留');await input.dispatchEvent('change');
  await frame.waitForFunction(()=>window.WorkbenchOfficeEditor?.dirty&&!window.WorkbenchOfficeEditor.busy&&document.querySelector('.office-simple-editor [role=status]')?.textContent.includes('测试：版本冲突'));
  assert.equal(rejected,1);assert.equal(await input.inputValue(),'失败保存的新草稿必须保留');
  const locked=await frame.evaluate(()=>{const all=[...document.querySelectorAll('.office-spreadsheet input')],target=all.find(i=>i.getAttribute('aria-label')==='项目参数 B3');return {dirty:window.WorkbenchOfficeEditor.dirty,targetDisabled:target.disabled,otherDisabled:all.filter(i=>i!==target).every(i=>i.disabled),count:all.length};});
  assert.equal(locked.dirty,true);assert.equal(locked.targetDisabled,false);assert.equal(locked.otherDisabled,true);assert.ok(locked.count>2);
  const stored=await api(`${projectId}/${excel.documentId}/view`);assert.equal(stored.document.fileRevision,1);assert.equal(stored.view.sheets[0].cells.find(c=>c.address==='B3').text,original);
  await page.screenshot({path:join(output,'Excel冲突草稿保留.png')});
  await input.fill(original);await frame.waitForFunction(()=>!window.WorkbenchOfficeEditor.dirty);
  assert.equal(await frame.locator('.office-spreadsheet input:disabled').count(),0);
  await context.unroute(routeURL,rejectCommand);return {rejected,original,allOtherCellsLocked:true,revertUnlocks:true};
 });
 await check('late Word edit after save acknowledgement prevents closing and remains recoverable',async()=>{
  await page.evaluate(id=>window.WorkbenchOffice.open(id),word.documentId);const frame=currentFrame();assert.ok(frame);
  await frame.evaluate(async()=>{
   const controller=window.WorkbenchOfficeEditor;
   await controller.replaceText({expectedText:'Word竞态原始文字',text:'Word竞态已保存文字'});
   window.__raceOriginalSave=controller.save.bind(controller);let injected=false;
   controller.save=async()=>{const value=await window.__raceOriginalSave();if(!injected){injected=true;await controller.replaceText({expectedText:'Word竞态已保存文字',text:'Word竞态保存回调后新增草稿'});}return value;};
  });
  await page.locator('.office-workspace [data-office="close"]').click();
  await page.waitForFunction(()=>document.querySelector('.office-workspace').open&&document.querySelector('.office-status').textContent.includes('文档有新修改'));
  const retained=await frame.evaluate(()=>({dirty:window.WorkbenchOfficeEditor.dirty,...window.WorkbenchOfficeEditor.read()}));
  assert.equal(retained.dirty,true);assert.equal(retained.document.fileRevision,2);assert.ok(retained.text.includes('Word竞态保存回调后新增草稿'));
  assert.equal((await api(`${projectId}/${word.documentId}`)).document.fileRevision,2);
  await page.screenshot({path:join(output,'Word关闭保护.png')});
  await frame.evaluate(async()=>{window.WorkbenchOfficeEditor.save=window.__raceOriginalSave;await window.WorkbenchOfficeEditor.save();});
  await page.locator('.office-workspace [data-office="close"]').click();await page.waitForFunction(()=>!document.querySelector('.office-workspace').open);
  const reopened=await page.evaluate(id=>window.WorkbenchOffice.open(id),word.documentId);
  assert.equal(reopened.dirty,false);assert.equal(reopened.document.fileRevision,3);assert.ok(reopened.text.includes('Word竞态保存回调后新增草稿'));
  const response=await fetch(`${base}/api/office-documents/${projectId}/${word.documentId}/content`);assert.equal(response.status,200);await writeFile(join(output,'关闭保护后已保存.docx'),Buffer.from(await response.arrayBuffer()));
  return {retainedRevision:2,reopenedRevision:3,retainedText:true};
 });
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:checks.length,output,projectId}));
}catch(error){await page.screenshot({path:join(output,'failure.png')}).catch(()=>{});await writeFile(join(output,'failure.txt'),error.stack||String(error));await writeFile(join(output,'results.json'),JSON.stringify({checks,errors,blocked,projectId,word,excel},null,2));console.error('OUTPUT '+output);throw error;}
finally{await browser.close();}
