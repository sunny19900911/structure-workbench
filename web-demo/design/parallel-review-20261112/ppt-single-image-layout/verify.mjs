import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {createProjectArchive,importProjectArchive} from '../../../server/portable-projects.mjs';
import {cafeteriaTemplate} from '../../ppt-template/cafeteria-template.js';
const root=fileURLToPath(new URL('../../../',import.meta.url)),qa=join(root,'qa/parallel-review-20261112/ppt-single-image-layout'),origin='http://127.0.0.1:5471';
const require=createRequire(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/qa.cjs')),{chromium}=require('playwright');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),hashes=images=>Object.values(images).map(x=>hash(Buffer.from(x.split(',')[1],'base64'))).sort();
const report={checks:[],errors:[],performance:[]},check=(name,detail)=>{report.checks.push({name,detail});console.log('PASS '+name);};
const request=async(path,data)=>{const r=await fetch(origin+'/api/workbench-projects'+path,{method:data?'POST':'GET',headers:{'Content-Type':'application/json','X-Workbench-Request':'project-store'},...(data?{body:JSON.stringify(data)}:{})});const body=await r.json();assert.equal(r.status,200,JSON.stringify(body).slice(0,250));return body;};
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
let context,page,frame;
async function open(id){
 if(context)await context.close();context=await browser.newContext({viewport:{width:1500,height:1000}});page=await context.newPage();page.setDefaultTimeout(25000);page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(origin+'/workbuddy-integrated-studio.html?project='+id);await page.waitForFunction(()=>window.WorkbenchProjects&&!WorkbenchProjects.loading);
 await page.locator('#tab11').click();await page.waitForFunction(()=>document.querySelector('#im-ppt-frame')?.contentWindow?.WorkbenchPpt?.mcp.ready);frame=page.frames().find(f=>f.url().includes('06-ppt-report/prototype'));
}
const read=()=>frame.evaluate(()=>WorkbenchPpt.mcp.read());
async function batch(files,label){
 await frame.locator('#image-manager-btn').click();
 await frame.evaluate(()=>{window.__ticks=0;window.__progress=[];window.__timer=setInterval(()=>__ticks++,30);window.__observer=new MutationObserver(()=>__progress.push(document.querySelector('#batch-image-status').textContent));__observer.observe(document.querySelector('#batch-image-status'),{subtree:true,childList:true});});
 const chooser=page.waitForEvent('filechooser');await frame.locator('#batch-image-upload').click();const start=Date.now();await(await chooser).setFiles(files);
 await frame.waitForFunction(()=>!WorkbenchPpt.busy()&&document.querySelector('#batch-image-status').textContent.includes('完成'));
 const detail=await frame.evaluate(()=>{clearInterval(__timer);__observer.disconnect();return {ticks:__ticks,progress:__progress,status:document.querySelector('#batch-image-status').textContent};});detail.ms=Date.now()-start;detail.label=label;report.performance.push(detail);assert.ok(detail.ticks>0);
 await frame.locator('#image-manager-close').click();console.log('BATCH '+label+' '+detail.ms+'ms');
}
const oldKey=(n,i=0)=>`${n-1}-${cafeteriaTemplate.pages[n-1].slots[i]}`;
const id='ca111111111111111111111111111111',multiId='cb111111111111111111111111111111';
try{
 const initial=(await request('/'+id+'/ppt')).record;
 await open(id);let live=await read();assert.equal(live.pages.length,27);assert.equal(live.images.filter(i=>i.present).length,Object.keys(initial.data.unitDrafts[initial.data.unit].images).length);
 for(const key of ['18-盈建科模型','22-二层结构平面布置图','24-四层结构平面布置图'])assert.ok(live.images.find(i=>i.key===key)?.present,key);
 assert.ok(live.images.find(i=>i.unplaced&&i.name.includes('桩位及基础布置')));
 assert.equal((await request('/'+id+'/ppt')).record.revision,initial.revision);
 check('actual saved Jiangnan project migrates unique model/floor names on read, combined pile/foundation remains unplaced; no read-only POST');
 const sources='E:/600-工作台数据库/001-项目生成与复核/各项目';
 const jDir=join(sources,'江南大学江阴校区二期/01-输入/PPT图片'),kDir=join(sources,'昆明经开一中/01-输入/PPT图片');
 const imageFiles=async dir=>(await readdir(dir)).filter(n=>/\.(png|jpe?g)$/i.test(n)).sort().map(n=>join(dir,n));
 const j=await imageFiles(jDir),k=await imageFiles(kDir);assert.equal(j.length,6);assert.equal(k.length,33);
 await batch(j,'jiangnan6');await batch(k,'kunming33');let posts=0;const listener=r=>{if(r.method()==='POST'&&r.url().includes('/'+id+'/ppt'))posts++;};page.on('request',listener);await batch(k,'repeat33');page.off('request',listener);assert.equal(posts,0);
 const allHashes=[];for(const file of [...j,...k])allHashes.push(hash(await readFile(file)));
 let saved=(await request('/'+id+'/ppt')).record;assert.deepEqual(hashes(saved.data.unitDrafts['项目整体'].images),allHashes.sort());assert.equal(saved.data.templateLayout,'cafeteria-single-20261112');
 check('actual 6 + 33 file uploads and repeated 33 preserve original bytes; repeat does not POST',report.performance.map(({label,ms,ticks})=>({label,ms,ticks})));
 // Real old multi-unit v4 fixture: two old same-topic slots and a distinct old model in another unit.
 const mr=(await request('/'+multiId+'/ppt')).record,md=structuredClone(mr.data),values=Object.values(md.unitDrafts['项目整体'].images);
 md.unitDrafts['项目整体'].edits['cafeteria-v1:12:9']='旧结构页眉 QA';md.unitDrafts['项目整体'].edits['cafeteria-v1:20:5']='旧构件人工稿 QA';md.unitDrafts['项目整体'].edits['cafeteria-v1:10:5']='前11人工稿 QA';
 md.unitDrafts['QA另一单体']={edits:{'cafeteria-v1:12:12':'乙旧标题 QA'},images:{[oldKey(20)]:values[0],[oldKey(15,0)]:values[1],[oldKey(15,1)]:values[2]}};
 await request('/'+multiId+'/ppt',{expectedRevision:mr.revision,data:md});await open(multiId);
 live=await read();assert.equal(live.edits['cafeteria-v1:10:5'],'前11人工稿 QA');assert.equal(live.layoutMigration.oldEdits['cafeteria-v1:20:5'],'旧构件人工稿 QA');assert.equal(live.pages[11].fields.find(f=>f.id.endsWith(':9')).text,'01  建筑设计');
 await frame.locator('#unit-name').selectOption('QA另一单体');live=await read();assert.equal(live.images.filter(i=>i.present).length,3);assert.ok(live.images.find(i=>i.key==='18-盈建科模型').present);assert.ok(live.images.find(i=>i.key==='22-二层结构平面布置图').present);assert.equal(live.images.filter(i=>i.unplaced).length,1);
 await frame.evaluate(()=>WorkbenchPpt.flush());const migrated=(await request('/'+multiId+'/ppt')).record.data;
 assert.deepEqual(hashes(migrated.unitDrafts['QA另一单体'].images),hashes(md.unitDrafts['QA另一单体'].images));assert.equal(migrated.unitDrafts['项目整体'].layoutId,'cafeteria-single-20261112');
 await open(multiId);live=await read();assert.equal(live.unit,'QA另一单体');assert.equal(live.images.filter(i=>i.present).length,3);
 await frame.locator('#unit-name').selectOption('项目整体');live=await read();assert.equal(live.layoutMigration.oldEdits['cafeteria-v1:12:9'],'旧结构页眉 QA');
 check('actual multi-unit v4 migration, UI unit switch, save and fresh browser preserve old text/history and all images');
 await open(id);live=await read();
 const call=async(operation,args={})=>{const ctx=(await (await page.request.post(origin+'/api/mcp-browser/execute',{headers:{'X-Workbench-Request':'mcp-browser'},data:{projectId:id,unit:'项目整体',operation:'ppt.read',args:{}},timeout:60000})).json()).result.context;const r=await page.request.post(origin+'/api/mcp-browser/execute',{headers:{'X-Workbench-Request':'mcp-browser'},data:{projectId:id,unit:'项目整体',operation,args,expectedRevisions:ctx.revisions},timeout:60000});const b=await r.json();assert.equal(r.status(),200,JSON.stringify(b).slice(0,600));return b.result.result;};
 // Populate empty review slides explicitly with copies of real images for contain/layout QA only.
 saved=(await request('/'+id+'/ppt')).record;const data=Object.values(saved.data.unitDrafts['项目整体'].images)[0];
 for(const n of [12,13,14,27]){live=await read();const slot=live.images.find(i=>i.page===n);if(!slot.present)await call('ppt.image',{key:slot.key,data});}
 await frame.locator('[data-page="11"]').click();const caption=frame.locator('[data-edit-id="cafeteria-single-v2:12:12"]');await caption.fill('B1建筑平面布置图 QA人工编辑');await caption.press('Tab');await frame.evaluate(()=>WorkbenchPpt.flush());
 await open(id);assert.equal((await read()).edits['cafeteria-single-v2:12:12'],'B1建筑平面布置图 QA人工编辑');
 await call('ppt.edit',{edits:{'cafeteria-single-v2:12:12':'B1建筑平面布置图'},expectedEdits:{'cafeteria-single-v2:12:12':'B1建筑平面布置图 QA人工编辑'}});
 for(let n=12;n<=27;n++){
  await frame.locator(`[data-page="${n-1}"]`).click();assert.equal(await frame.locator('.caf-image').count(),1);
  if([12,13,14,19,27].includes(n))await page.screenshot({animations:'disabled',path:join(qa,`web-${n}.png`)});
 }
 let delivered=null;const onDownload=d=>{delivered=d;};page.on('download',onDownload);await page.evaluate(()=>window.scrollTo(0,0));await frame.locator('#generate-btn').click();await frame.waitForFunction(()=>!WorkbenchPpt.busy());await page.locator('#cafeteria-download-ready').waitFor();if(!delivered){const explicit=page.waitForEvent('download',{timeout:20000});await page.locator('#cafeteria-download-ready').click();delivered=await explicit;report.downloadMode='explicit ready link';}else report.downloadMode='automatic';await delivered.saveAs(join(qa,'single27-ui.pptx'));page.off('download',onDownload);
 const exported=await call('ppt.export');await writeFile(join(qa,'single27-mcp.pptx'),Buffer.from(exported.base64,'base64'));
 saved=(await request('/'+id+'/ppt')).record;report.exportHashes=hashes(saved.data.unitDrafts['项目整体'].images);report.titles=(await read()).pages.map(p=>p.title);
 check('all 16 pages have exactly one UI image slot; UI edit/reopen and real MCP read/image/edit/export work; UI downloads actual 27-slide PPTX');
 const env={WORKBENCH_PORTABLE:'1',WORKBENCH_DATABASE_ROOT:qa,WORKBENCH_PROJECT_STORE:join(qa,'projects'),WORKBENCH_CACHE_ROOT:join(qa,'cache'),WORKBENCH_PYTHON:join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe')};
 const archive=await createProjectArchive(id,env),imported=await importProjectArchive(archive.file,env),restored=(await request('/'+imported.projectId+'/ppt')).record;
 assert.deepEqual(restored.data,saved.data);await open(imported.projectId);assert.equal((await read()).pages.length,27);assert.deepEqual((await read()).edits,saved.data.unitDrafts['项目整体'].edits);
 check('actual project archive roundtrip preserves new layout, every image and manual edits');
 for(const item of JSON.parse(await readFile(join(qa,'source-records.json'),'utf8')))assert.equal(hash(await readFile(item.source)),item.sha256);
 check('source project records unchanged by hash');assert.deepEqual(report.errors,[]);report.passed=true;
}catch(e){report.passed=false;report.error=e.stack;console.error(e);if(frame)report.ui=await frame.evaluate(()=>({toast:document.querySelector('#toast')?.textContent,busy:WorkbenchPpt.busy()}));if(page)await page.screenshot({animations:'disabled',path:join(qa,'verify-failed.png')}).catch(()=>{});process.exitCode=1;}
finally{await writeFile(join(qa,'verify-results.json'),JSON.stringify(report,null,2));await browser.close();}
