import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../../../',import.meta.url)),qa=join(root,'qa/parallel-review-20261114/ppt-semantic-images'),origin='http://127.0.0.1:5491';
const require=createRequire(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/qa.cjs')),{chromium}=require('playwright');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),imageHash=data=>hash(Buffer.from(data.split(',')[1],'base64'));
const report=process.argv[2]==='export'?JSON.parse(await readFile(join(qa,'verify-results.json'),'utf8')):{checks:[],errors:[],performance:[]};delete report.error;delete report.ui;const check=(name,detail)=>{report.checks.push({name,detail});console.log('PASS '+name);};
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
 await page.evaluate(()=>window.scrollTo(0,0));await frame.locator('#image-manager-btn').click();
 await frame.evaluate(()=>{window.__ticks=0;window.__timer=setInterval(()=>__ticks++,30);});
 const chooser=page.waitForEvent('filechooser');await frame.locator('#batch-image-upload').click();const start=Date.now();await(await chooser).setFiles(files);
 await frame.waitForFunction(()=>!WorkbenchPpt.busy()&&document.querySelector('#batch-image-status').textContent.includes('完成'));
 const detail=await frame.evaluate(()=>{clearInterval(__timer);return {ticks:__ticks,status:document.querySelector('#batch-image-status').textContent};});detail.ms=Date.now()-start;detail.label=label;report.performance.push(detail);
 await frame.locator('#image-manager-close').click();console.log('BATCH '+label+' '+detail.ms+'ms');
}
const source='E:/600-工作台数据库/001-项目生成与复核/各项目/江南大学江阴校区二期/01-输入/PPT图片';
const files=(await readdir(source)).filter(n=>/\.(png|jpe?g)$/i.test(n)).sort();assert.equal(files.length,17);
const expected={'03_媒体楼YJK模型_历史汇报.png':19,'05_媒体楼二层结构布置.png':23,'06_媒体楼四层结构布置.png':25,'建筑一层平面图.png':14,'建筑二层平面图.png':15,'建筑三层平面图.png':16,'建筑四层平面图.png':17,'建筑屋顶层平面图.png':18};
const input={};for(const name of files){const bytes=await readFile(join(source,name));input[name]={data:'data:image/'+(/jpe?g$/i.test(name)?'jpeg':'png')+';base64,'+bytes.toString('base64'),sha256:hash(bytes),page:expected[name]||null};}
await writeFile(join(qa,'source-images.json'),JSON.stringify(Object.entries(input).map(([name,{sha256,page}])=>({name,sha256,page})),null,2));
const id='d7111111111111111111111111111111',blank='d5111111111111111111111111111111',recovery='d6111111111111111111111111111111';
function assertImages(data){const unit=data.unitDrafts['项目整体'];assert.equal(Object.keys(unit.images).length,17);assert.deepEqual(Object.values(unit.images).map(imageHash).sort(),Object.values(input).map(x=>x.sha256).sort());for(const [name,p]of Object.entries(expected)){const entry=Object.entries(unit.images).find(([key])=>key.startsWith((p-1)+'-'));assert.ok(entry,name);assert.equal(imageHash(entry[1]),input[name].sha256,name);}}
const unplaced=(index,name)=>'__unplaced__'+String(index).padStart(32,'0')+'__'+name;
try{
 if(process.argv[2]!=='export'){
 // Use the actual 001 Jiangnan saved 17-image record (14 unplaced) without changing its bytes.
 const original=(await request('/'+id+'/ppt')).record;assert.equal(Object.keys(original.data.unitDrafts['项目整体'].images).length,17);assert.equal(Object.keys(original.data.unitDrafts['项目整体'].images).filter(k=>k.startsWith('__unplaced__')).length,14);await open(id);assert.equal((await read()).images.filter(i=>i.present&&!i.unplaced).length,8);assert.equal((await request('/'+id+'/ppt')).record.revision,original.revision);check('actual 001 Jiangnan saved 17/14-unplaced new-layout record recovers 5 building floor images on read without POST');await batch(files.map(n=>join(source,n)),'repeat17-after-recovery');let live=await read();assert.equal(live.images.filter(i=>i.present).length,17);assert.equal(live.images.filter(i=>i.present&&!i.unplaced).length,8);assert.equal(live.images.filter(i=>i.unplaced).length,9);
 let record=(await request('/'+id+'/ppt')).record;assertImages(record.data);
 let posts=0;const listener=r=>{if(r.method()==='POST'&&r.url().includes('/'+id+'/ppt'))posts++;};page.on('request',listener);await batch(files.map(n=>join(source,n)),'repeat17');page.off('request',listener);assert.equal(posts,0);
 await open(id);assert.equal((await read()).images.filter(i=>i.present&&!i.unplaced).length,8);assertImages((await request('/'+id+'/ppt')).record.data);
 check('actual saved 17 recovery + repeat file chooser: 8 correct placements, 9 preserved unplaced; repeat has no POST; fresh reload and hashes agree');
 await page.evaluate(()=>window.scrollTo(0,0));await frame.locator('[data-page="15"]').click();await page.screenshot({animations:'disabled',path:join(qa,'architecture-third-floor.png')});
 // Empty QA draft proves full first import, independent of old stored state.
 record=(await request('/'+blank+'/ppt')).record;await request('/'+blank+'/ppt',{expectedRevision:record.revision,data:{layoutVersion:4,templateLayout:'cafeteria-single-20261112',unit:'项目整体',unitDrafts:{'项目整体':{layoutId:'cafeteria-single-20261112',images:{},edits:{}}}}});
 await open(blank);await batch(files.map(n=>join(source,n)),'first17-empty-draft');assertImages((await request('/'+blank+'/ppt')).record.data);check('empty draft imports all 17 through actual file chooser with expected semantic placements');
 // Give the second QA unit a real workbench context, then simulate an existing NEW-layout saved unplaced draft.
 await open(recovery);await page.evaluate(async()=>{await ExpansionWorkbench.selectUnit('QA另一单体');await ExpansionWorkbench.mcp.generate();await WorkbenchProjects.flush();});
 record=(await request('/'+recovery+'/ppt')).record;
 const allUnplaced=Object.fromEntries(files.map((name,i)=>[unplaced(i,name),input[name].data]));
 const draft={layoutId:'cafeteria-single-20261112',images:allUnplaced,edits:{'cafeteria-single-v2:16:12':'人工标题保留'},provenance:{manual:{source_id:'QA'}},layoutMigration:{oldEdits:{old:'旧人工稿保留'}}};
 const second={layoutId:'cafeteria-single-20261112',images:{'15-三层建筑平面布置图':input['建筑一层平面图.png'].data,[unplaced(99,'建筑三层平面图.png')]:input['建筑三层平面图.png'].data,[unplaced(98,'建筑屋顶层平面图.png')]:input['建筑屋顶层平面图.png'].data},edits:{'cafeteria-single-v2:16:12':'乙人工绑定保留'}};
 const payload={layoutVersion:4,templateLayout:'cafeteria-single-20261112',unit:'项目整体',unitDrafts:{'项目整体':draft,'QA另一单体':second}};await request('/'+recovery+'/ppt',{expectedRevision:record.revision,data:payload});const revision=record.revision+1;
 await open(recovery);live=await read();assert.equal(live.images.filter(i=>i.present&&!i.unplaced).length,8);assert.equal(live.edits['cafeteria-single-v2:16:12'],'人工标题保留');assert.equal((await request('/'+recovery+'/ppt')).record.revision,revision,'load is read-only');
 await frame.locator('#unit-name').selectOption('QA另一单体');live=await read();assert.equal(live.images.filter(i=>i.present).length,3);assert.equal(live.images.filter(i=>i.unplaced).length,1);assert.ok(live.images.find(i=>i.page===18).present);await frame.evaluate(()=>WorkbenchPpt.flush());
 record=(await request('/'+recovery+'/ppt')).record;assertImages(record.data);assert.equal(record.data.unitDrafts['QA另一单体'].images['15-三层建筑平面布置图'],second.images['15-三层建筑平面布置图']);assert.equal(record.data.unitDrafts['项目整体'].layoutMigration.oldEdits.old,'旧人工稿保留');assert.equal(record.data.images,undefined);
 await open(recovery);assert.equal((await read()).unit,'QA另一单体');await frame.locator('#unit-name').selectOption('项目整体');live=await read();assert.equal(live.images.filter(i=>i.present&&!i.unplaced).length,8);assert.equal(live.edits['cafeteria-single-v2:16:12'],'人工标题保留');
 check('existing new-layout unplaced recovered for all units; occupied manual binding, text/history retained; save/fresh reload is consistent without duplicate bytes');
 }
 // UI export from the real upload project, and actual MCP bridge read/export plus existing explicit-key image contract.
 await open(id);const call=async(operation,args={})=>{await page.evaluate(()=>WorkbenchProjects.flush());const r=await page.request.post(origin+'/api/mcp-browser/execute',{headers:{'X-Workbench-Request':'mcp-browser'},data:{projectId:id,unit:'项目整体',operation:'ppt.read',args:{}},timeout:60000});const b=await r.json();assert.equal(r.status(),200,JSON.stringify(b).slice(0,200));if(operation==='ppt.read')return b.result.result;const out=await page.request.post(origin+'/api/mcp-browser/execute',{headers:{'X-Workbench-Request':'mcp-browser'},data:{projectId:id,unit:'项目整体',operation,args,expectedRevisions:b.result.context.revisions},timeout:60000});const result=await out.json();assert.equal(out.status(),200,JSON.stringify(result).slice(0,300));return result.result.result;};
 assert.equal((await call('ppt.read')).images.filter(i=>i.present&&!i.unplaced).length,8);await call('ppt.image',{key:'15-三层建筑平面布置图',data:input['建筑三层平面图.png'].data});assertImages((await request('/'+id+'/ppt')).record.data);
 await page.evaluate(()=>window.scrollTo(0,0));let delivered;page.on('download',d=>{delivered=d;});await frame.locator('#generate-btn').click();await frame.waitForFunction(()=>!WorkbenchPpt.busy());await page.locator('#cafeteria-download-ready').waitFor();if(!delivered){const download=page.waitForEvent('download');await page.locator('#cafeteria-download-ready').click();delivered=await download;}await delivered.saveAs(join(qa,'semantic17-ui.pptx'));
 const exported=await call('ppt.export');await writeFile(join(qa,'semantic17-mcp.pptx'),Buffer.from(exported.base64,'base64'));
 check('actual UI download and MCP read/explicit-key image/export preserve correct placed content');
 for(const item of JSON.parse(await readFile(join(qa,'source-records.json'),'utf8')))assert.equal(hash(await readFile(item.path)),item.sha256);
 for(const [name,item]of Object.entries(input))assert.equal(hash(await readFile(join(source,name))),item.sha256);
 check('production source records and all 17 original files unchanged');assert.deepEqual(report.errors,[]);report.passed=true;
}catch(e){report.passed=false;report.error=e.stack;console.error(e);if(frame)report.ui=await frame.evaluate(()=>({toast:document.querySelector('#toast')?.textContent,status:document.querySelector('#batch-image-status')?.textContent})).catch(()=>null);if(page)await page.screenshot({animations:'disabled',path:join(qa,'failed.png')}).catch(()=>{});process.exitCode=1;}
finally{await writeFile(join(qa,'verify-results.json'),JSON.stringify(report,null,2));await browser.close();}
