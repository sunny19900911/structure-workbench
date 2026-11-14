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
 await open(id);
 await page.evaluate(async()=>{await ExpansionWorkbench.selectUnit('QA新增单体');await ExpansionWorkbench.mcp.generate();await WorkbenchProjects.flush();});await page.locator('#tab1').click();await page.locator('#tab11').click();
 await frame.waitForFunction(()=>[...document.querySelector('#unit-name').options].some(o=>o.value==='QA新增单体'));await frame.locator('#unit-name').selectOption('QA新增单体');
 assert.equal((await read()).images.filter(i=>i.present).length,0);
 const saved=(await request('/'+id+'/ppt')).record.data,data=Object.values(saved.unitDrafts['项目整体'].images)[0];
 await frame.evaluate(data=>WorkbenchPpt.mcp.image({key:'11-B1建筑平面布置图',data}),data);
 await frame.locator('#unit-name').selectOption('项目整体');await frame.evaluate(()=>WorkbenchPpt.flush());
 await open(id);await frame.locator('#unit-name').selectOption('QA新增单体');const live=await read();assert.ok(live.images.find(i=>i.key==='11-B1建筑平面布置图').present);assert.equal(live.images.filter(i=>i.present).length,1);
 const output=(await request('/'+id+'/ppt')).record.data;assert.equal(output.unitDrafts['QA新增单体'].layoutId,'cafeteria-single-20261112');
 await writeFile(join(qa,'new-unit-results.json'),JSON.stringify({passed:true,newUnitImageKey:'11-B1建筑平面布置图',layoutId:output.unitDrafts['QA新增单体'].layoutId},null,2));console.log('PASS new unit image remains in the new slot after switching away, saving and fresh browser reopen');
}catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
