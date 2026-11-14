import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const qa=join(root,'qa/portable-release/calculation-out-memory-20261111');
const runtime='C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1104-2876-0_26.1104.2876.0_x64__3k8sg7r9htsxt/dependencies';
const {chromium}=await import(pathToFileURL(join(runtime,'node/node_modules/playwright/index.mjs')));
const base='http://127.0.0.1:5477',idA=randomUUID().replaceAll('-',''),idB=randomUUID().replaceAll('-','');
const report={idA,idB,checks:[],pageErrors:[],requests:[]};await mkdir(qa,{recursive:true});
async function seed(id,name){const r=await fetch(base+'/api/workbench-projects/'+id+'/main',{method:'POST',headers:{'Content-Type':'application/json','X-Workbench-Request':'project-store'},body:JSON.stringify({expectedRevision:0,data:{mode:'blank',parameters:{project_name:name,project_code:'QA-OUT-1111',designer:'隔离验收'}}})});assert.ok(r.ok,await r.text());}
await seed(idA,'OUT 恢复隔离验收');await seed(idB,'无 OUT 空白隔离项目');
const names=['教学楼_wMaSs.OUT','教学楼-WDISP.OUT','教学楼_WZQ.OUT'];
const texts=['QA_RAW_MASS_20261111\n结构总质量 1234.5\n','QA_RAW_DISP_20261111\n层间位移角 位移比\n','QA_RAW_PERIOD_20261111\n振型 周期\n'];
const files=[];for(let i=0;i<3;i++){const p=join(qa,names[i]);await writeFile(p,texts[i]);files.push(p);}
report.inputHashes=await Promise.all(files.map(async p=>createHash('sha256').update(await readFile(p)).digest('hex')));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page=await browser.newPage({viewport:{width:1500,height:1050},acceptDownloads:true});page.setDefaultTimeout(30000);
page.on('pageerror',e=>report.pageErrors.push(e.message));page.on('request',r=>{if(r.url().includes('/api/calculation-book/')&&r.method()==='POST'){report.requests.push({url:r.url(),body:r.postDataJSON()});}});
async function ready(id){await page.waitForFunction(id=>window.WorkbenchProjects?.id===id&&!WorkbenchProjects.loading&&window.WorkbenchFlow&&window.CalculationBook?.mcp,id,{timeout:90000});}
async function calculation(n){await page.locator('#tab9').click();await page.waitForFunction(n=>document.querySelector('#calcbook-out-state')?.textContent.includes(n+'/3'),n);assert.equal(await page.locator('#calcbook-excel-title').count(),0);}
async function unit(name){await page.locator('#tab2').click();await page.locator('#ev-unit').fill(name);await page.locator('#ev-unit').press('Tab');await page.waitForFunction(name=>ExpansionWorkbench.unit===name&&!ExpansionWorkbench.busy,name);}
async function project(id){await page.locator('#wp-project').selectOption(id);await ready(id);}
try{
 await page.goto(base+'/workbuddy-integrated-studio.html?project='+idA,{waitUntil:'domcontentloaded'});await ready(idA);
 await unit('QA教学楼');await page.locator('#wp-intake').click();await page.locator('#flow-files').setInputFiles(files);await page.waitForFunction(()=>document.querySelector('#flow-jobs')?.textContent.includes('已保存'),null,{timeout:90000});await page.locator('#flow-result').click();
 await calculation(3);assert.equal(await page.locator('label[for="calcbook-out-files"]').textContent(),'更换 OUT 文件');assert.equal(await page.locator('#calcbook-out-files').evaluate(e=>e.files.length),0);
 const before=await page.evaluate(()=>CalculationBook.mcp.package());assert.equal(before.out_files.length,3);for(let i=0;i<3;i++)assert.equal(Buffer.from(before.out_files[i].content_base64,'base64').toString(),texts[i]);
 await page.evaluate(()=>WorkbenchProjects.flush());await page.reload({waitUntil:'domcontentloaded'});await ready(idA);await calculation(3);
 report.checks.push('普通资料入口导入带前缀及混合大小写的三 OUT；刷新后按当前项目/单体恢复3/3，文件输入框未伪造选中');
 await page.locator('#calcbook-confirmed').check();const downloaded=page.waitForEvent('download',{timeout:180000});await page.locator('#calcbook-export').click();const download=await downloaded;report.docx=join(qa,'计算书-扩初恢复3OUT-A3.docx');await download.saveAs(report.docx);
 await page.locator('#calcbook-out-state').scrollIntoViewIfNeeded();report.screenshot=join(qa,'计算书-无Excel卡-恢复3OUT.png');await page.screenshot({path:report.screenshot});report.checks.push('原生 A3 Word 实际下载成功');
 await project(idB);await calculation(0);assert.equal((await page.evaluate(()=>CalculationBook.mcp.package())).out_files.length,0);await project(idA);await calculation(3);
 await unit('QA实验楼');await calculation(0);await unit('QA教学楼');await calculation(3);report.checks.push('切换第二空白项目、另一单体均0/3，返回原项目/单体恢复3/3');
 await page.locator('#calcbook-out-files').setInputFiles(names.map((name,i)=>({name:'manual-'+name,mimeType:'text/plain',buffer:Buffer.from('QA_MANUAL_'+i)})));await page.waitForFunction(()=>document.querySelector('#calcbook-out-state').textContent.includes('本页选择'));
 await page.evaluate(()=>WorkbenchProjects.flush());await page.reload({waitUntil:'domcontentloaded'});await ready(idA);await calculation(3);const manual=await page.evaluate(()=>CalculationBook.mcp.package());for(let i=0;i<3;i++)assert.equal(Buffer.from(manual.out_files[i].content_base64,'base64').toString(),'QA_MANUAL_'+i);
 await unit('QA实验楼');await calculation(0);await project(idB);await calculation(0);report.checks.push('本页选择覆盖仅属当前单体；刷新恢复且不污染其他单体或项目');
 const after=await Promise.all(files.map(async p=>createHash('sha256').update(await readFile(p)).digest('hex')));assert.deepEqual(after,report.inputHashes);assert.deepEqual(report.pageErrors,[]);report.pass=true;
}catch(e){report.error=e.stack;await page.screenshot({path:join(qa,'failure.png'),fullPage:true});throw e;}
finally{await writeFile(join(qa,'browser-report.json'),JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({pass:report.pass,error:report.error,checks:report.checks,docx:report.docx,screenshot:report.screenshot,pageErrors:report.pageErrors}));}
