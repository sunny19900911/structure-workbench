// Experimental bundle ingress into an isolated QA app; this is not PDF upload integration.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve(process.argv[2]),out=join(root,'ui');await mkdir(out,{recursive:true});
const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
const browser=await chromium.launch({headless:true,executablePath:process.env.QA_BROWSER});
const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1050}}),page=await context.newPage(),results=[];
page.on('dialog',d=>d.accept());
try{
 await page.goto('http://127.0.0.1:5444/workbuddy-integrated-studio.html');
 await page.waitForFunction(()=>window.WorkbenchProjects&&!window.WorkbenchProjects.loading&&window.WorkbenchFlow);
 for(const item of manifest){
  const bundle=JSON.parse(await readFile(join(root,item.id,'bundle.json'),'utf8'));
  if(!await page.locator('.wp-management').getAttribute('open'))await page.locator('.wp-management>summary').click();
  await page.locator('#wp-name').fill('PDF新方法复提-'+item.id+'-'+Date.now());await page.locator('#wp-new').click();
  await page.waitForFunction(()=>document.querySelector('#wp-status').textContent.includes('空白项目已创建'));
  await page.evaluate(async bundle=>{await window.WorkbenchIntake.importBundle(bundle,{bundle_id:crypto.randomUUID(),source:'native PDF QA'});},bundle);
  await page.getByRole('button',{name:'扩充说明',exact:true}).click();
  await page.waitForTimeout(700);
  const capture=await page.evaluate(()=>({projectId:window.WorkbenchProjects.id,source:window.WorkbenchIntake.capture(),expansion:window.ExpansionWorkbench.capture(),package:window.ExpansionWorkbench.documentPackage()}));
  await writeFile(join(out,item.id+'-capture.json'),JSON.stringify(capture));
  const pending=page.waitForEvent('download',{timeout:180000});await page.locator('#wp-export').click();
  const download=await pending,docx=join(out,item.id+'.docx');await download.saveAs(docx);
  await page.reload();await page.waitForFunction(()=>window.WorkbenchProjects&&!window.WorkbenchProjects.loading&&window.WorkbenchIntake?.capture().sources.length);
  const restored=await page.evaluate(()=>({id:window.WorkbenchProjects.id,hashes:window.WorkbenchIntake.capture().sources.map(s=>s.hash)}));
  const inputs=bundle.sources[0].sourceSet?.members||[{input:item.input,hash:bundle.sources[0].hash}];
  const inputChecks=await Promise.all(inputs.map(async s=>({input:s.input,unchanged:createHash('sha256').update(await readFile(s.input)).digest('hex')===s.hash})));
  const result={id:item.id,inputChecks,route:'experimental-bundle',projectId:capture.projectId,outputHash:createHash('sha256').update(await readFile(docx)).digest('hex'),reopen:restored.id===capture.projectId&&restored.hashes.includes(bundle.sources[0].hash),inputUnchanged:inputChecks.every(s=>s.unchanged)};
  results.push(result);await writeFile(join(out,'ui-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(result));
 }
}finally{await browser.close();}
