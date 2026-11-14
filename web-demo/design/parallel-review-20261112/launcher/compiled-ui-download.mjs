import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';

const reportPath=process.argv[2],qa=dirname(reportPath);
const original=JSON.parse(await readFile(reportPath,'utf8'));
const {chromium}=await import(pathToFileURL(join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
const browser=await chromium.launch({channel:'msedge',headless:true});
const result={projectId:original.exportProjectId,errors:[]};
try{
 const page=await browser.newPage({viewport:{width:1500,height:1000}});
 page.on('pageerror',error=>result.errors.push(error.message));
 await page.goto(original.target.url+'/workbuddy-integrated-studio.html?project='+original.exportProjectId,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.WorkbenchProjects&&!WorkbenchProjects.loading&&window.WorkbenchModules?.mcp);
 await page.locator('#tab11').click();
 await page.waitForFunction(()=>document.getElementById('im-ppt-frame')?.contentWindow?.WorkbenchPpt?.mcp?.ready);
 const frame=page.frames().find(item=>item.url().includes('06-ppt-report/prototype'));
 assert.equal(await frame.locator('#page-count').innerText(),'27页');
 await page.evaluate(()=>window.scrollTo(0,0));await frame.evaluate(()=>window.scrollTo(0,0));
 const downloaded=page.waitForEvent('download',{timeout:30000});
 await frame.locator('#generate-btn').click();
 const file=await downloaded;
 result.pptx=join(qa,'compiled-27-ui-download.pptx');
 await file.saveAs(result.pptx);assert.equal(await file.failure(),null);assert.deepEqual(result.errors,[]);
 await writeFile(join(qa,'ui-export-layout.json'),JSON.stringify({...original,pptx:result.pptx},null,2));
 result.filename=file.suggestedFilename();result.actualVisibleButton=true;
 console.log(JSON.stringify(result));
}catch(error){result.error=error.stack;throw error;}
finally{await browser.close();await writeFile(join(qa,'ui-download.json'),JSON.stringify(result,null,2));}
