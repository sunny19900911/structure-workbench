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
 await page.waitForFunction(()=>{const e=document.querySelector('.office-editor-host iframe')?.contentWindow?.WorkbenchOfficeEditor;return e?.read().document.type==='docx'&&!window.WorkbenchOffice.busy;},{},{timeout:90000});
 assert.equal(await page.locator('.office-file-item').count(),3);
 let frame=page.frames().find(f=>f.url().includes('/office-editor.html'));
 await frame.locator('[contenteditable=true]').focus();await frame.locator('[contenteditable=true]').press('Control+Home');await page.keyboard.insertText('UI闭环Word保留文字。');await saved(frame);await download('结构初步设计说明','edited.docx');
 await page.screenshot({path:join(out,'word.png')});checks.push('首次成果入口生成三份原生文件并打开Word，实际输入、保存、下载');
 frame=await open('pptx','结构设计汇报 · PPT');assert.equal(await frame.locator('#word-sidepanel').count(),0);
 await frame.locator('.ppt-object[role=button]').filter({hasText:/\S/}).first().click();await frame.getByRole('textbox',{name:'幻灯片文字',exact:true}).fill('UI闭环PPT保留文字');await saved(frame);await download('结构设计汇报','edited.pptx');checks.push('PPT实际修改、保存、下载；无Word专用底栏');
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
 frame=await open('docx','结构初步设计说明 · Word');assert.ok(await frame.evaluate(()=>window.WorkbenchOfficeEditor.read().text.includes('UI闭环Word保留文字。')));
 frame=await open('pptx','结构设计汇报 · PPT');assert.ok(await frame.evaluate(()=>window.WorkbenchOfficeEditor.read().view.slides.some(s=>s.shapes.some(v=>v.text?.includes('UI闭环PPT保留文字')))));
 frame=await open('xlsx','结构参数与指标 · Excel');assert.equal(await frame.evaluate(()=>window.WorkbenchOfficeEditor.read().view.sheets[0].cells.find(c=>c.address==='F2')?.text),'UI闭环Excel保留文字');
 checks.push('三类文件切换重开后保留人工修改');
 await page.locator('[data-office=close]').click();await page.locator('#wp-export').click();assert.equal(await page.locator('.office-file-item').count(),3);checks.push('再次打开成果入口复用已保存文件，无重复生成');
 assert.deepEqual(errors,[]);
 await writeFile(join(out,'results.json'),JSON.stringify({checks,errors,url:page.url(),workflowPatch:process.argv.includes('--workflow')},null,2));console.log(JSON.stringify({out,checks,errors},null,2));
}catch(error){await page.screenshot({path:join(out,'failure.png')}).catch(()=>{});await writeFile(join(out,'failure.json'),JSON.stringify({message:error.message,checks,errors,url:page.url()},null,2));throw error;}
finally{await browser.close();}
