import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readdir,writeFile,readFile} from 'node:fs/promises';
const require=createRequire(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/qa.cjs'));
const {chromium}=require('playwright');
const root=fileURLToPath(new URL('../../../',import.meta.url)),qa=join(root,'qa/parallel-review-20261111/ppt-batch-performance');
const origin='http://127.0.0.1:5470',kunming='E:/600-工作台数据库/001-项目生成与复核/各项目/昆明经开一中/01-输入/PPT图片';
const mode=process.argv[2]||'baseline33',count=mode.includes('j5')?5:mode.includes('j6')?6:mode.includes('8')?8:33,id=process.argv[3]||'2a1ccf080c3e4b5f9d795e4e7b357b82';
const source=mode.includes('j')?kunming.replace('昆明经开一中','江南大学江阴校区二期'):kunming;
const all=(await readdir(source)).filter(n=>/\.(png|jpe?g)$/i.test(n)).sort(),files=(count===8?all.filter(n=>/^0[1-8]_/.test(n)):count===5?all.filter(n=>!n.startsWith('01_')):all).map(n=>join(source,n));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page=await browser.newPage({viewport:{width:1500,height:1000}});const errors=[];
page.on('pageerror',e=>errors.push(e.message));
if(mode.startsWith('baseline'))for(const rel of ['office-ppt-assets.js','design/parallel-tasks/06-ppt-report/prototype.js'])await page.route('**/'+rel+'*',async route=>route.fulfill({contentType:'application/javascript',body:await readFile(join(qa,'before',rel),'utf8')}));
await page.addInitScript(()=>{
 const events=[];window.__pptPerf=events;const push=(kind,start,detail={})=>{if(events.length<20000)events.push({kind,at:start,ms:performance.now()-start,...detail});};
 const stringify=JSON.stringify;JSON.stringify=function(...args){const start=performance.now();try{const r=stringify.apply(this,args);if(r?.length>100000)push('json',start,{chars:r.length});return r;}catch(e){push('json-error',start,{error:e.message});throw e;}};
 const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){const start=performance.now();try{const r=set.call(this,k,v);if(k.endsWith(':ppt'))push('cache',start,{chars:v.length});return r;}catch(e){push('cache-error',start,{chars:v.length,error:e.name});throw e;}};
 const fetch=window.fetch;window.fetch=async function(url,opts){const start=performance.now();if(String(url).includes('/ppt')){try{const r=await fetch.call(this,url,opts);push('fetch',start,{url:String(url),method:opts?.method||'GET',chars:opts?.body?.length||0,status:r.status});return r;}catch(e){push('fetch-error',start,{error:e.message});throw e;}}return fetch.call(this,url,opts);};
 const read=FileReader.prototype.readAsDataURL;FileReader.prototype.readAsDataURL=function(file){const start=performance.now();this.addEventListener('loadend',()=>push('read',start,{name:file.name,size:file.size}),{once:true});return read.call(this,file);};
 const decode=HTMLImageElement.prototype.decode;HTMLImageElement.prototype.decode=function(){const start=performance.now();return decode.call(this).then(r=>{push('decode',start,{w:this.naturalWidth,h:this.naturalHeight});return r;},e=>{push('decode-error',start,{error:e.message});throw e;});};
 const desc=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');Object.defineProperty(Element.prototype,'innerHTML',{...desc,set(v){const start=performance.now();desc.set.call(this,v);if(['slide-canvas','image-upload-list','page-list'].includes(this.id))push('render',start,{id:this.id,chars:v.length});}});
 let tick=performance.now();setInterval(()=>{const now=performance.now();if(now-tick>250)events.push({kind:'lag',ms:now-tick-100,at:now});tick=now;},100);
});
let frame,start;const heartbeat=setInterval(()=>console.log('RUN '+mode+' '+(start?Math.round((Date.now()-start)/1000):0)+'s'),10000);
try{
 await page.goto(origin+'/workbuddy-integrated-studio.html?project='+id);await page.waitForFunction(()=>window.WorkbenchProjects&&!WorkbenchProjects.loading);
 await page.locator('#tab11').click();await page.waitForFunction(()=>document.querySelector('#im-ppt-frame')?.contentWindow?.WorkbenchPpt?.mcp.ready);
 frame=page.frames().find(f=>f.url().includes('06-ppt-report/prototype'));
 const before=await frame.evaluate(()=>({read:WorkbenchPpt.mcp.read(),perf:__pptPerf.length}));
 await frame.locator('#image-manager-btn').click();
 const choosing=page.waitForEvent('filechooser');await frame.locator('#batch-image-upload').click();const chooser=await choosing;
 start=Date.now();await chooser.setFiles(files);
 await frame.waitForFunction(()=>!WorkbenchPpt.busy(),null,{timeout:95000});
 const elapsedMs=Date.now()-start;
 await page.screenshot({animations:'disabled',path:join(qa,mode+'.png')});
 const data=await frame.evaluate(()=>({perf:__pptPerf,read:WorkbenchPpt.mcp.read(),toast:document.querySelector('#toast').textContent,status:document.querySelector('#link-status').textContent,rows:document.querySelectorAll('.image-upload-row').length,progress:document.querySelector('#batch-image-status')?.textContent}));
 const report={mode,files:files.length,elapsedMs,errors,beforeImages:before.read.images.filter(i=>i.present).length,revision:data.read.revision,placedImages:data.read.images.filter(i=>i.present).length,rows:data.rows,toast:data.toast,status:data.status,progress:data.progress,perf:data.perf.slice(before.perf)};
 await writeFile(join(qa,mode+'.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({...report,perf:undefined,summary:Object.fromEntries(['read','decode','render','json','cache','cache-error','fetch','lag'].map(kind=>{const p=report.perf.filter(x=>x.kind===kind);return [kind,{count:p.length,totalMs:p.reduce((n,x)=>n+x.ms,0),maxMs:Math.max(0,...p.map(x=>x.ms)),maxChars:Math.max(0,...p.map(x=>x.chars||0)),statuses:p.filter(x=>x.status).map(x=>x.status)}]}))}));
}catch(e){console.error(e);if(frame)await writeFile(join(qa,mode+'-failed.json'),JSON.stringify(await frame.evaluate(()=>({perf:__pptPerf,busy:WorkbenchPpt.busy(),toast:document.querySelector('#toast').textContent})),null,2));process.exitCode=1;}
finally{clearInterval(heartbeat);await browser.close();}
