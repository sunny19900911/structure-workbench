import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {createProjectArchive,importProjectArchive} from '../../../server/portable-projects.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url)),qa=join(root,'qa/parallel-review-20261111/ppt-batch-performance'),origin='http://127.0.0.1:5470';
const require=createRequire(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/qa.cjs')),{chromium}=require('playwright');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={checks:[],errors:[]},check=(name,detail)=>{report.checks.push({name,detail});console.log('PASS '+name);};
const request=async(path,data)=>{const r=await fetch(origin+'/api/workbench-projects'+path,{method:data?'POST':'GET',headers:{'Content-Type':'application/json','X-Workbench-Request':'project-store'},...(data?{body:JSON.stringify(data)}:{})});const body=await r.json();assert.equal(r.status,200,JSON.stringify(body).slice(0,250));return body;};
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
let context,page,frame;
async function open(id){
 if(context)await context.close();context=await browser.newContext({viewport:{width:1500,height:1000}});page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(origin+'/workbuddy-integrated-studio.html?project='+id);await page.waitForFunction(()=>window.WorkbenchProjects&&!WorkbenchProjects.loading);
 await page.locator('#tab11').click();await page.waitForFunction(()=>document.querySelector('#im-ppt-frame')?.contentWindow?.WorkbenchPpt?.mcp.ready);frame=page.frames().find(f=>f.url().includes('06-ppt-report/prototype'));
}
async function choose(files){await frame.locator('#image-manager-btn').click();const chosen=page.waitForEvent('filechooser');await frame.locator('#batch-image-upload').click();await(await chosen).setFiles(files);await frame.waitForFunction(()=>!WorkbenchPpt.busy()&&document.querySelector('#batch-image-status').textContent.includes('完成'));}
const manifest=JSON.parse(await readFile(join(qa,'source-images.json'),'utf8'));
const source='E:/600-工作台数据库/001-项目生成与复核/各项目/昆明经开一中/01-输入/PPT图片';
const id='b5111111111111111111111111111111',sourceRecord=(await request('/'+id+'/ppt')).record;
const originalImages=sourceRecord.data.unitDrafts[sourceRecord.data.unit].images;
const expectedHashes=Object.values(originalImages).map(data=>hash(Buffer.from(data.split(',')[1],'base64')));
try{
 assert.equal(Object.keys(originalImages).length,38);assert.ok(!sourceRecord.data.images);
 for(const item of manifest)assert.ok(expectedHashes.includes(item.sha256),item.name);
 await open(id);assert.equal(await frame.evaluate(()=>WorkbenchPpt.mcp.read().images.filter(i=>i.present).length),38);
 await frame.evaluate(()=>{window.__progress=[];window.__ticks=0;new MutationObserver(()=>__progress.push(document.querySelector('#batch-image-status').textContent)).observe(document.querySelector('#batch-image-status'),{childList:true,subtree:true});setInterval(()=>__ticks++,30);});
 let pptPosts=0;page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/'+id+'/ppt'))pptPosts++;});
 await frame.locator('#image-manager-btn').click();const chooser=page.waitForEvent('filechooser');await frame.locator('#batch-image-upload').click();await(await chooser).setFiles(manifest.map(x=>join(source,x.name)));
 await frame.locator('#image-manager-close').click();await frame.waitForFunction(()=>!WorkbenchPpt.busy()&&document.querySelector('#batch-image-status').textContent.includes('完成'));
 const live=await frame.evaluate(()=>({progress:__progress,ticks:__ticks,read:WorkbenchPpt.mcp.read(),status:document.querySelector('#batch-image-status').textContent}));
 assert.ok(live.progress.some(t=>/已读取 \d+ \/ 33/.test(t)));assert.ok(live.ticks>2);assert.equal(pptPosts,0);assert.equal(live.read.images.filter(i=>i.present).length,38);
 check('fresh context: all 38 original images survive; repeated 33-file chooser remains responsive and performs no POST',{progressUpdates:live.progress.length,ticks:live.ticks,status:live.status});
 await frame.locator('#image-manager-btn').click();await page.screenshot({animations:'disabled',path:join(qa,'33-completed.png')});
 // A user-selected placement may move an old unplaced image, never silently replace another slot.
 const row=frame.locator('.image-upload-row').filter({has:frame.locator('select')}).first();
 const chosenSlot=await row.locator('select').inputValue();await row.locator('select').selectOption(chosenSlot);await row.getByRole('button',{name:'放入图位'}).click();
 await frame.waitForFunction(key=>WorkbenchPpt.mcp.read().images.find(i=>i.key===key)?.present,chosenSlot);
 await page.evaluate(()=>WorkbenchProjects.flush());await frame.locator('#image-manager-close').click();
 const field=await frame.evaluate(()=>WorkbenchPpt.mcp.read().pages.flatMap(p=>p.fields).find(f=>f.editable&&!f.linked));
 const current=await frame.evaluate(()=>WorkbenchPpt.mcp.read().edits);
 await frame.evaluate(({field,current})=>WorkbenchPpt.mcp.edit({edits:{[field.id]:'批量图片验收人工说明'},expectedEdits:{[field.id]:current[field.id]||''}}),{field,current});
 const downloadReady=page.waitForEvent('download',{timeout:60000});await frame.locator('#generate-btn').click();const download=await downloadReady;await download.saveAs(join(qa,'all38-ui.pptx'));
 check('manual placement and manual text saved; actual PPTX downloaded');
 const call=async(operation,args={})=>{const r=await page.request.post(origin+'/api/mcp-browser/execute',{headers:{'X-Workbench-Request':'mcp-browser'},data:{projectId:id,unit:'项目整体',operation,args},timeout:60000});const b=await r.json();assert.equal(r.status(),200,JSON.stringify(b).slice(0,300));return b.result.result;};
 const mcp=await call('ppt.read');assert.equal(mcp.images.filter(i=>i.present).length,38);assert.equal(mcp.edits[field.id],'批量图片验收人工说明');
 const exported=await call('ppt.export');await writeFile(join(qa,'all38-mcp.pptx'),Buffer.from(exported.base64,'base64'));
 check('real MCP bridge reads unplaced images and exports after version 4 save');
 const latest=(await request('/'+id+'/ppt')).record;
 const latestHashes=Object.values(latest.data.unitDrafts['项目整体'].images).map(x=>hash(Buffer.from(x.split(',')[1],'base64'))).sort();assert.deepEqual(latestHashes,[...expectedHashes].sort());
 await open(id);assert.equal(await frame.evaluate(key=>WorkbenchPpt.mcp.read().edits[key],field.id),'批量图片验收人工说明');
 check('all source hashes and manual narrative survive fresh reload');
 // Use the real workbench unit transition; no replacement snapshot or fake bridge.
 await page.evaluate(async()=>{await ExpansionWorkbench.selectUnit('QA另一单体');await ExpansionWorkbench.mcp.generate();await WorkbenchProjects.flush();});await page.locator('#tab1').click();await page.locator('#tab11').click();
 await frame.waitForFunction(()=>[...document.querySelector('#unit-name').options].some(o=>o.value==='QA另一单体'));
 await frame.locator('#unit-name').selectOption('QA另一单体');await frame.waitForFunction(()=>WorkbenchPpt.mcp.read().unit==='QA另一单体');
 assert.equal(await frame.evaluate(()=>WorkbenchPpt.mcp.read().images.filter(i=>i.present).length),0);
 await frame.locator('#unit-name').selectOption('项目整体');await frame.waitForFunction(()=>WorkbenchPpt.mcp.read().unit==='项目整体');assert.equal(await frame.evaluate(()=>WorkbenchPpt.mcp.read().images.filter(i=>i.present).length),38);
 check('actual unit switch keeps new unit empty and restores all images on return');
 // Import/export treats PPT as an opaque versioned project part, not root images.
 const archiveId=randomUUID().replaceAll('-','');await request('/'+archiveId+'/main',{expectedRevision:0,data:{parameters:{project_name:'PPT v4 项目包兼容验证'},parameterVersion:1,mode:'blank'}});
 await request('/'+archiveId+'/ppt',{expectedRevision:0,data:latest.data});
 const env={WORKBENCH_PORTABLE:'1',WORKBENCH_DATABASE_ROOT:qa,WORKBENCH_PROJECT_STORE:join(qa,'projects'),WORKBENCH_CACHE_ROOT:join(qa,'cache'),WORKBENCH_PYTHON:join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe')};
 const archive=await createProjectArchive(archiveId,env);report.archiveResultKeys=Object.keys(archive);
 const imported=await importProjectArchive(archive.file,env);const restored=(await request('/'+imported.projectId+'/ppt')).record;
 assert.deepEqual(restored.data.unitDrafts,latest.data.unitDrafts);
 await page.evaluate(next=>WorkbenchProjects.mcp.open(next),imported.projectId);await page.locator('#tab11').click();await page.waitForFunction(()=>document.querySelector('#im-ppt-frame')?.contentWindow?.WorkbenchPpt?.mcp.ready);frame=page.frames().find(f=>f.url().includes('06-ppt-report/prototype'));
 assert.equal(await frame.evaluate(()=>WorkbenchPpt.mcp.read().images.filter(i=>i.present).length),38);
 await page.evaluate(()=>WorkbenchProjects.mcp.open('35085a1b17f5447eb42ac19239a24dee'));await page.locator('#tab11').click();await page.waitForFunction(()=>document.querySelector('#im-ppt-frame')?.contentWindow?.WorkbenchPpt?.mcp.ready);frame=page.frames().find(f=>f.url().includes('06-ppt-report/prototype'));
 assert.notEqual(await frame.evaluate(()=>WorkbenchPpt.mcp.read().images.filter(i=>i.present).length),38);
 check('project package roundtrip and real project switch do not leak images');
 report.expectedHashes=expectedHashes;report.passed=true;assert.deepEqual(report.errors,[]);
}catch(e){report.passed=false;report.error=e.stack;console.error(e);if(page)await page.screenshot({animations:'disabled',path:join(qa,'verify-failed.png')}).catch(()=>{});process.exitCode=1;}
finally{await writeFile(join(qa,'verify-results.json'),JSON.stringify(report,null,2));await browser.close();}
