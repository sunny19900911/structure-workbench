// Original PDF upload + final batch notice + persisted OCR candidates.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {basename,resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {sourceReview,completionSummary} from '../../../intake-review-summary.js';
const original=resolve(process.argv[2]),output=resolve(process.argv[3]);await mkdir(output,{recursive:true});
if(!process.env.QA_URL)throw Error('Explicit isolated QA_URL required');
const bytes=await readFile(original),hash=createHash('sha256').update(bytes).digest('hex');
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.QA_BROWSER}),page=await browser.newPage({viewport:{width:1440,height:1050}});
page.on('dialog',d=>d.accept());
try{
 await page.goto(process.env.QA_URL);await page.waitForFunction(()=>window.WorkbenchFlow&&!window.WorkbenchProjects.loading);
 if(!await page.locator('.wp-management').getAttribute('open'))await page.locator('.wp-management>summary').click();
 await page.locator('#wp-name').fill('OCR原件入口验收-'+Date.now());await page.locator('#wp-new').click();
 await page.waitForFunction(()=>document.querySelector('#wp-status').textContent.includes('空白项目已创建'));
 await page.locator('#wp-intake').click();
 await page.locator('#flow-files').setInputFiles([
  {name:basename(original),mimeType:'application/pdf',buffer:bytes},
  {name:'QA地勘补充.txt',mimeType:'text/plain',buffer:Buffer.from('地勘资料补充说明：本段仅供隔离流程验收。')}
 ]);
 await page.waitForFunction(()=>document.querySelector('#flow-task').textContent.startsWith('已处理'),{},{timeout:380000});
 const state=await page.evaluate(()=>({id:window.WorkbenchProjects.id,intake:window.WorkbenchIntake.capture(),notice:document.querySelector('#flow-task').textContent}));
 assert.equal(state.intake.sources.length,2);const source=state.intake.sources.find(s=>s.hash===hash);assert.ok(source);
 assert.ok(source.blocks.ocrReview.pages.some(p=>p.page===Number(process.env.QA_OCR_PAGE||17)&&p.lines.some(l=>l.text.includes('地层特性表'))));
 if(!source.blocks.paras.length&&!source.blocks.tables.length)assert.equal(state.intake.facts.filter(f=>f.source_id===source.source_id).length,0);
 const expected=completionSummary(state.intake.sources.map(s=>({review:sourceReview(s.blocks)})));
 assert.equal(state.notice,expected);assert.ok(state.notice.length<30);
 await page.locator('[data-source-preview]').first().locator('..').locator('summary').first().click();
 assert.match(await page.locator('[data-source-preview]').first().textContent(),/OCR待核/);
 const id=state.id;await page.reload();await page.waitForFunction(()=>window.WorkbenchIntake?.capture().sources.length===2&&!window.WorkbenchProjects.loading);
 const restored=await page.evaluate(hash=>window.WorkbenchIntake.capture().sources.find(s=>s.hash===hash),hash);
 assert.deepEqual(restored.blocks.ocrReview,source.blocks.ocrReview);
 assert.equal(createHash('sha256').update(await readFile(original)).digest('hex'),hash);
 const result={id,route:'original-file-upload',notice:state.notice,recognizedPages:source.blocks.ocrReview.pages.length,reviewOnly:source.blocks.ocrReview.automaticAdoption===false,persisted:true,originalUnchanged:true};
 await writeFile(join(output,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
