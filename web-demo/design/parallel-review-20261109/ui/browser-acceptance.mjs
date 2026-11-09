import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const out=join(root,'qa/parallel-review-20261109/ui','browser-'+Date.now());
await mkdir(out,{recursive:true});
const require=createRequire(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/qa.cjs'));
const {chromium}=require('playwright');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
const ready=()=>page.waitForFunction(()=>window.WorkbenchOffice&&!window.WorkbenchProjects.loading&&!document.querySelector('.wp-bar[aria-busy=true]'));
async function open(type,label){
 await page.getByRole('button',{name:label,exact:true}).click();
 await page.waitForFunction(type=>{const e=document.querySelector('.office-editor-host iframe')?.contentWindow?.WorkbenchOfficeEditor;return e&&e.read().document.type===type&&!window.WorkbenchOffice.busy;},type);
 return page.frames().find(f=>f.url().includes('/office-editor.html'));
}
async function saved(frame){await frame.getByRole('button',{name:'保存到本机',exact:true}).click();await frame.waitForFunction(()=>!window.WorkbenchOfficeEditor.dirty&&!window.WorkbenchOfficeEditor.busy);}
async function download(label,filename){const result=page.waitForEvent('download');await page.locator('.office-file-item').filter({hasText:label}).getByRole('link',{name:'下载',exact:true}).click();await(await result).saveAs(join(out,filename));}
async function cell(frame,name,value){const field=frame.getByRole('textbox',{name,exact:true});await field.dblclick();await field.fill(value);await field.press('Enter');await frame.waitForFunction(()=>!window.WorkbenchOfficeEditor.dirty&&!window.WorkbenchOfficeEditor.busy);}
try{
 await page.goto('http://127.0.0.1:5446/workbuddy-integrated-studio.html');await ready();
 await page.locator('.wp-management summary').click();
 for(const name of ['恢复刚删除项目','载入最新保存','设置','打印 / 存 PDF','复制全文'])assert.equal(await page.getByRole('button',{name,exact:true}).count(),0);
 await page.locator('#wp-name').fill('界面回归-'+Date.now());await page.locator('#wp-new').click();await ready();await page.locator('.wp-management summary').click();
 await page.locator('#wp-intake').click();
 if(process.argv.includes('--workflow')){
  assert.equal(await page.locator('#flow-kind,#flow-unit').count(),0);
  assert.ok(!(await page.locator('.flow-dialog').innerText()).includes('建筑与地勘供本项目共用'));
 }
 const fixture={name:process.argv.includes('--workflow')?'001.txt':'建筑说明.txt',mimeType:'text/plain',buffer:Buffer.from('建筑设计总说明\n项目名称：界面源资料验收\n本项目位于天津市。\n1号教学楼地上4层，地下0层，建筑面积3600平方米，建筑高度16.8米。')};
 await page.locator('#flow-files').setInputFiles(fixture);
 await page.waitForFunction(name=>window.WorkbenchIntake.capture().sources.some(s=>s.name===name&&s.slot==='bldg')&&!window.WorkbenchIntake.busy,fixture.name);
 await page.locator('#flow-jobs').getByText(/已保存/).waitFor();
 await page.locator('.flow-dialog [data-close]').click();await page.locator('#tab2').click();
 assert.equal(await page.locator('.ev-toolbar [data-action=local],.ev-toolbar [data-action=check],.ev-toolbar [data-action=export],#ev-issues').count(),0);
 checks.push('项目菜单、扩初工具栏精简；实际上传建筑文本并保存');
 await page.screenshot({path:join(out,'expansion.png')});
 await page.locator('#wp-export').click();
 assert.equal(await page.locator('.office-file-item').count(),0);
 assert.equal(await page.locator('#tab11:visible').count(),0);
 assert.equal(await page.locator('.office-workspace input[type=file]').getAttribute('accept'),'.xlsx');
 await page.locator('[data-office=generate]').click();
 await page.locator('.office-saved-preview[data-type=docx]').waitFor({timeout:90000});
 assert.equal(await page.locator('.office-file-item').count(),3);
 assert.equal(await page.locator('.office-editor-host iframe,.office-saved-preview [contenteditable]').count(),0);
 const wordText=await page.locator('.office-saved-preview').innerText();assert.ok(wordText.length>200);
 await download('结构初步设计说明','generated.docx');await page.screenshot({path:join(out,'word-preview.png')});
 checks.push('成果入口不隐式生成；主动生成三份原生文件后只读预览Word，下载成功');
 await page.getByRole('button',{name:'结构设计汇报 · PPT',exact:true}).click();
 await page.locator('.office-saved-preview[data-type=pptx]').waitFor();
 assert.ok(await page.locator('.office-preview-slide').count()>0);assert.equal(await page.locator('.office-editor-host iframe,.office-saved-preview [contenteditable]').count(),0);
 assert.equal(await page.locator('#im-ppt-frame').isVisible(),false);
 await download('结构设计汇报','generated.pptx');await page.screenshot({path:join(out,'ppt-preview.png')});checks.push('PPT导航退出主流程，生成组件隐藏，已保存PPT只读预览与下载成功');
 let frame;
 frame=await open('xlsx','结构参数与指标 · Excel');assert.equal(await frame.locator('#word-sidepanel').count(),0);
 await cell(frame,'项目参数 F2','UI闭环Excel保留文字');await frame.getByRole('button',{name:'结构单体',exact:true}).click();
 await cell(frame,'结构单体 A2','教学楼');await cell(frame,'结构单体 A3','实验楼');
 await cell(frame,'结构单体 B2','=2+3');
 assert.equal(await frame.evaluate(()=>window.WorkbenchOfficeEditor.read().view.sheets.find(s=>s.name==='结构单体').cells.find(c=>c.address==='B2').value),5);
 await frame.getByRole('textbox',{name:'单元格或选区',exact:true}).fill('A1:E3');await frame.getByRole('textbox',{name:'单元格或选区',exact:true}).press('Enter');
 await frame.locator('summary').filter({hasText:'筛选'}).click();await frame.getByRole('textbox',{name:'筛选值',exact:true}).fill('教学楼');await frame.getByRole('button',{name:'应用筛选',exact:true}).click();
 await frame.waitForFunction(()=>window.WorkbenchOfficeEditor.read().view.sheets.find(s=>s.name==='结构单体').hiddenRows.includes(3));
 await frame.locator('summary').filter({hasText:'筛选'}).click();await frame.getByRole('button',{name:'清除筛选',exact:true}).click();
 await frame.waitForFunction(()=>!window.WorkbenchOfficeEditor.read().view.sheets.find(s=>s.name==='结构单体').hiddenRows.length);
 await saved(frame);await download('结构参数与指标','edited.xlsx');await page.screenshot({path:join(out,'excel.png')});checks.push('Excel真实输入、公式=2+3得5、筛选隐藏第三行、解除、保存下载');
 await page.getByRole('button',{name:'结构初步设计说明 · Word',exact:true}).click();await page.locator('.office-saved-preview[data-type=docx]').waitFor();assert.equal(await page.locator('.office-saved-preview').innerText(),wordText);
 assert.equal(await page.locator('.office-saved-preview').getAttribute('data-revision'),'1');
 frame=await open('xlsx','结构参数与指标 · Excel');assert.equal(await frame.evaluate(()=>window.WorkbenchOfficeEditor.read().view.sheets[0].cells.find(c=>c.address==='F2')?.text),'UI闭环Excel保留文字');
 checks.push('Word预览不改文件版本；Excel切换重开保留人工修改');
 await page.locator('[data-office=close]').click();await page.locator('#wp-export').click();assert.equal(await page.locator('.office-file-item').count(),3);checks.push('再次打开成果入口复用已保存文件，无重复生成');
 assert.deepEqual(errors,[]);
 await writeFile(join(out,'results.json'),JSON.stringify({checks,errors,url:page.url(),workflowPatch:process.argv.includes('--workflow')},null,2));console.log(JSON.stringify({out,checks,errors},null,2));
}catch(error){await page.screenshot({path:join(out,'failure.png')}).catch(()=>{});await writeFile(join(out,'failure.json'),JSON.stringify({message:error.message,checks,errors,url:page.url()},null,2));throw error;}
finally{await browser.close();}
