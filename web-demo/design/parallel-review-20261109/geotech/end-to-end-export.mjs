// Continue the fresh-original acceptance run through the actual Word exporter.
// QA_URL must point to an isolated project store; never a production instance.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(process.argv[2]),manifest=JSON.parse(await readFile(process.argv[3],'utf8'));
const parsed=JSON.parse(await readFile(join(root,'results.json'),'utf8'));
assert.equal(parsed.stage,'original-to-current-parser-to-shared-composer');assert.ok(parsed.cases.every(c=>c.status==='pass'));
if(!process.env.QA_URL)throw Error('Explicit isolated QA_URL required');
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=join(root,'ui');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.QA_BROWSER});
const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:1050}});page.on('dialog',d=>d.accept());
const results=[];
try{
 await page.goto(process.env.QA_URL);await page.waitForFunction(()=>window.WorkbenchFlow&&!window.WorkbenchProjects.loading);
 for(const c of manifest.cases){
  assert.ok(parsed.cases.some(r=>r.id===c.id&&r.status==='pass'));
  const source=JSON.parse(await readFile(join(root,c.id,'source.json'),'utf8'));
  assert.equal(source.hash,c.originalHash);
  if(!await page.locator('.wp-management').getAttribute('open'))await page.locator('.wp-management>summary').click();
  await page.locator('#wp-name').fill('原件端到端-'+c.id+'-'+Date.now());await page.locator('#wp-new').click();
  await page.waitForFunction(()=>document.querySelector('#wp-status').textContent.includes('空白项目已创建'));
  await page.evaluate(async source=>window.WorkbenchIntake.importBundle({sources:[source],facts:[],unmapped:[],issues:[],confirmations:[]},{bundle_id:crypto.randomUUID(),source:'fresh-original-acceptance'}),source);
  await page.getByRole('button',{name:'扩充说明',exact:true}).click();
  await page.waitForFunction(()=>!!window.ExpansionWorkbench?.capture()?.document?.geotech);
  const capture=await page.evaluate(()=>({projectId:window.WorkbenchProjects.id,source:window.WorkbenchIntake.capture(),package:window.ExpansionWorkbench.documentPackage()}));
  await writeFile(join(out,c.id+'-capture.json'),JSON.stringify(capture));
  const pending=page.waitForEvent('download',{timeout:180000});await page.locator('#wp-export').click();
  await (await pending).saveAs(join(out,c.id+'.docx'));
  await page.reload();await page.waitForFunction(()=>window.WorkbenchIntake?.capture().sources.length&&!window.WorkbenchProjects.loading);
  const restored=await page.evaluate(()=>window.WorkbenchIntake.capture().sources[0]);
  assert.deepEqual(restored.blocks,source.blocks);
  assert.equal(createHash('sha256').update(await readFile(c.original)).digest('hex'),c.originalHash);
  results.push({id:c.id,projectId:capture.projectId,originalUnchanged:true,reopen:true,ocrReviewPersisted:!!restored.blocks.ocrReview,route:'fresh-parser-output-to-real-Word-export'});
  await writeFile(join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results.at(-1)));
 }
}finally{await browser.close();}
