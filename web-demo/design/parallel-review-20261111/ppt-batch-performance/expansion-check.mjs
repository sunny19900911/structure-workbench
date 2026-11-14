import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {homedir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';import {writeFile} from 'node:fs/promises';
const qa=fileURLToPath(new URL('../../../qa/parallel-review-20261111/ppt-batch-performance/',import.meta.url)),origin='http://127.0.0.1:5470',id='b6111111111111111111111111111111';
const {chromium}=createRequire(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/qa.cjs'))('playwright');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true}),page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));const report={};
try{
 const before=(await(await fetch(origin+'/api/workbench-projects/'+id+'/ppt')).json()).record;
 await page.goto(origin+'/workbuddy-integrated-studio.html?project='+id);await page.waitForFunction(()=>window.WorkbenchProjects&&!WorkbenchProjects.loading);await page.locator('#tab2').click();await page.locator('#ev-images-panel > summary').click();
 const choosing=page.waitForEvent('filechooser');await page.locator('[data-image-upload]').first().click();const chooser=await choosing;assert.equal(chooser.isMultiple(),false);
 await chooser.setFiles('E:/600-工作台数据库/001-项目生成与复核/各项目/江南大学江阴校区二期/01-输入/PPT图片/03_媒体楼YJK模型_历史汇报.png');
 await page.waitForFunction(()=>Object.keys(ExpansionWorkbench.capture().reportImages||{}).length>0&&!ExpansionWorkbench.busy);await page.evaluate(()=>WorkbenchProjects.flush());
 const after=(await(await fetch(origin+'/api/workbench-projects/'+id+'/ppt')).json()).record;assert.deepEqual(after.data,before.data);assert.equal(after.revision,before.revision);assert.deepEqual(errors,[]);
 report.passed=true;report.multiple=false;report.pptUnchanged=true;report.expansionImageCount=await page.evaluate(()=>Object.keys(ExpansionWorkbench.capture().reportImages||{}).length);report.note='扩初为指定图位单文件上传、既有1600px/JPEG转换；没有调用PPT批处理，PPT分区和修订未变。';console.log('PASS expansion chooser is separate; PPT data and revision unchanged');
}catch(e){report.passed=false;report.error=e.stack;console.error(e);process.exitCode=1;}finally{await writeFile(join(qa,'expansion-check.json'),JSON.stringify(report,null,2));await browser.close();}
