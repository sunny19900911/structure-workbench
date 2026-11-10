// Usage: node ui-round.mjs <private-manifest.json> <private-output-directory>
// Manifest: [{id,label,input}]. Originals and browser outputs must stay ignored.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const manifest=JSON.parse(await readFile(process.argv[2],'utf8')),output=resolve(process.argv[3]);
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.QA_BROWSER?{executablePath:process.env.QA_BROWSER}:{})});
const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1050}});
const page=await context.newPage(),results=[];
page.on('dialog',d=>d.accept());
try{
 await page.goto('http://127.0.0.1:5444/workbuddy-integrated-studio.html');
 await page.waitForFunction(()=>window.WorkbenchProjects&&!window.WorkbenchProjects.loading&&window.WorkbenchFlow);
 for(const item of manifest){
  const hash=createHash('sha256').update(await readFile(item.input)).digest('hex');
  if(!await page.locator('.wp-management').getAttribute('open'))await page.locator('.wp-management>summary').click();
  await page.locator('#wp-name').fill(item.label);
  await page.locator('#wp-new').click();
  await page.waitForFunction(()=>document.querySelector('#wp-status').textContent.includes('空白项目已创建'));
  await page.locator('#wp-intake').click();
  await page.locator('#flow-kind').selectOption('geo');
  await page.locator('#flow-files').setInputFiles(item.input);
  await page.waitForFunction(()=>/已保存|失败/.test(document.querySelector('#flow-jobs')?.textContent||''),{},{timeout:180000});
  const job=await page.locator('#flow-jobs').innerText();
  if(job.includes('失败')){results.push({...item,inputHash:hash,job});console.log(item.id,job);await page.locator('.flow-dialog[open] [data-close]').click();continue;}
  await page.locator('#flow-result').click();
  await page.waitForTimeout(700);
  const capture=await page.evaluate(()=>({projectId:window.WorkbenchProjects.id,source:window.WorkbenchIntake.capture(),expansion:window.ExpansionWorkbench.capture(),package:window.ExpansionWorkbench.documentPackage()}));
  await writeFile(join(output,item.id+'-capture.json'),JSON.stringify(capture));
  const downloadPromise=page.waitForEvent('download',{timeout:180000});
  await page.locator('#wp-export').click();
  const download=await downloadPromise,docx=join(output,item.id+'.docx');await download.saveAs(docx);
  const outputHash=createHash('sha256').update(await readFile(docx)).digest('hex');
  await page.reload();
  await page.waitForFunction(()=>window.WorkbenchProjects&&!window.WorkbenchProjects.loading&&window.WorkbenchIntake?.capture().sources.length);
  const restored=await page.evaluate(()=>({projectId:window.WorkbenchProjects.id,source:window.WorkbenchIntake.capture().sources.filter(s=>s.slot==='geo').map(s=>s.hash),text:window.WorkbenchIntake.evidence('项目整体').document.geotech.text}));
  await page.getByRole('button',{name:'扩充说明',exact:true}).click();
  await page.locator('#paper2').screenshot({path:join(output,item.id+'-page.png')});
  const unchanged=createHash('sha256').update(await readFile(item.input)).digest('hex')===hash;
  const result={...item,inputHash:hash,output:docx,outputHash,projectId:capture.projectId,job,reopen:restored.projectId===capture.projectId&&restored.source.includes(capture.source.sources.find(s=>s.slot==='geo').hash),inputUnchanged:unchanged};
  results.push(result);console.log(JSON.stringify(result));
  await writeFile(join(output,'ui-results.json'),JSON.stringify(results,null,2));
 }
}finally{await browser.close();await writeFile(join(output,'ui-results.json'),JSON.stringify(results,null,2));}
