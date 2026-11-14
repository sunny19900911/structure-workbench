import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const root=fileURLToPath(new URL('../../../',import.meta.url)),qa=join(root,'qa/parallel-review-20261111/ppt-batch-performance'),origin='http://127.0.0.1:5470';
const {chromium}=createRequire(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/qa.cjs'))('playwright');
const request=async(path,data)=>{const r=await fetch(origin+'/api/workbench-projects'+path,{method:data?'POST':'GET',headers:{'Content-Type':'application/json','X-Workbench-Request':'project-store'},...(data?{body:JSON.stringify(data)}:{})});assert.equal(r.status,200);return r.json();};
const report={checks:[],errors:[]},check=name=>{report.checks.push(name);console.log('PASS '+name);};
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true}),page=await browser.newPage({viewport:{width:1500,height:1000}});page.on('pageerror',e=>report.errors.push(e.message));
const id=randomUUID().replaceAll('-',''),source=(await request('/b6111111111111111111111111111111/ppt')).record.data;
await request('/'+id+'/main',{expectedRevision:0,data:{parameters:{project_name:'图片异常恢复隔离验收'},parameterVersion:1,mode:'blank'}});await request('/'+id+'/ppt',{expectedRevision:0,data:source});
let frame,counter=0;
async function upload(files){await frame.locator('#image-manager-btn').click();const choosing=page.waitForEvent('filechooser');await frame.locator('#batch-image-upload').click();await(await choosing).setFiles(files);await frame.waitForFunction(()=>!WorkbenchPpt.busy());}
async function fixture(){const data=await page.evaluate(i=>{const c=document.createElement('canvas');c.width=40;c.height=30;const x=c.getContext('2d');x.fillStyle=`rgb(${30+i*20},80,100)`;x.fillRect(0,0,40,30);return c.toDataURL('image/png').split(',')[1];},++counter);return {name:'故障隔离图片'+counter+'.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')};}
try{
 await page.goto(origin+'/workbuddy-integrated-studio.html?project='+id);await page.waitForFunction(()=>window.WorkbenchProjects&&!WorkbenchProjects.loading);await page.locator('#tab11').click();await page.waitForFunction(()=>document.querySelector('#im-ppt-frame')?.contentWindow?.WorkbenchPpt?.mcp.ready);frame=page.frames().find(f=>f.url().includes('06-ppt-report/prototype'));
 await upload([{name:'坏图片.png',mimeType:'image/png',buffer:Buffer.from('not a PNG')},await fixture()]);
 assert.match(await frame.locator('#batch-image-status').innerText(),/未导入 1 张/);assert.equal(await frame.locator('#batch-image-upload').isEnabled(),true);await frame.locator('#image-manager-close').click();
 check('bad image rejected while valid image saves; controls recover');
 const pattern='**/api/workbench-projects/'+id+'/ppt?ack=1',before=(await request('/'+id+'/ppt')).record;
 await page.route(pattern,route=>route.abort('failed'));await upload([await fixture()]);
 assert.equal((await request('/'+id+'/ppt')).record.revision,before.revision);assert.equal(await frame.locator('#batch-image-retry').isVisible(),true);assert.equal(await frame.locator('#batch-image-upload').isEnabled(),true);
 assert.match(await frame.locator('#batch-image-status').innerText(),/尚未确认/);assert.doesNotMatch(await frame.locator('#batch-image-status').innerText(),/恢复稿已保留|已存版本未覆盖/);
 await page.unroute(pattern);await frame.locator('#batch-image-retry').click();await frame.waitForFunction(()=>!WorkbenchPpt.busy()&&document.querySelector('#batch-image-retry').hidden);
 const saved=(await request('/'+id+'/ppt')).record;assert.ok(saved.revision>before.revision);assert.equal(Object.keys(saved.data.unitDrafts['项目整体'].images).length,7);await frame.locator('#image-manager-close').click();
 check('network failure leaves saved revision intact; explicit retry saves all pending images');
 let count=0;await page.route(pattern,async route=>{count++;const remote=(await request('/'+id+'/ppt')).record;remote.data.unitDrafts['项目整体'].edits.concurrent='另一窗口人工文字';await request('/'+id+'/ppt',{expectedRevision:remote.revision,data:remote.data});await route.continue();});
 await upload([await fixture()]);assert.match(await frame.locator('#batch-image-status').innerText(),/版本冲突/);assert.equal(await frame.locator('#batch-image-upload').isEnabled(),true);
 const conflict=(await request('/'+id+'/ppt')).record;await frame.locator('#batch-image-retry').click();await frame.waitForFunction(()=>!WorkbenchPpt.busy());assert.equal(count,1);assert.equal((await request('/'+id+'/ppt')).record.revision,conflict.revision);assert.equal(conflict.data.unitDrafts['项目整体'].edits.concurrent,'另一窗口人工文字');
 assert.equal(await frame.evaluate(()=>WorkbenchPpt.mcp.read().images.filter(i=>i.present).length),8);await page.screenshot({animations:'disabled',path:join(qa,'conflict-preserved.png')});
 check('real competing save produces 409; retry does not overwrite or discard in-memory images');
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(e){report.passed=false;report.error=e.stack;console.error(e);process.exitCode=1;}
finally{await writeFile(join(qa,'fault-results.json'),JSON.stringify(report,null,2));await browser.close();}
