import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),qa=resolve(root,'qa/parallel-review-20261109/word');
const runtime=process.env.WORKBENCH_RUNTIME||'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1104-2876-0_26.1104.2876.0_x64__3k8sg7r9htsxt/dependencies';
const {chromium}=await import(pathToFileURL(join(runtime,'node/node_modules/playwright/index.mjs')).href);
const session=JSON.parse(await readFile(join(qa,'session.json'),'utf8'));
const created=await fetch('http://127.0.0.1:5441/api/office-documents/'+session.projectId+'?type=docx',{method:'POST',headers:{'x-workbench-request':'office-documents','x-file-name':encodeURIComponent('Word真实验收'),'x-document-unit':encodeURIComponent('QA教学楼')},body:await readFile(join(qa,'word-input.docx'))});
const createdBody=await created.json();if(!created.ok)throw Error(JSON.stringify(createdBody));session.documentId=createdBody.document.documentId;await writeFile(join(qa,'session.json'),JSON.stringify(session));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const wait=()=>page.waitForFunction(()=>window.WorkbenchOfficeEditor&&!window.WorkbenchOfficeEditor.busy,{timeout:90000});
const save=async()=>{await wait();await page.getByRole('button',{name:'保存到本机',exact:true}).click();await page.waitForFunction(()=>!window.WorkbenchOfficeEditor.dirty&&!window.WorkbenchOfficeEditor.busy);};
const select=async(text,end=false)=>{await wait();await page.evaluate(({text,end})=>{const c=window.WorkbenchOfficeEditor,m=c.find(text);if(m.length!==1)throw Error('选区不唯一：'+text);c.selectRange(end?{from:m[0].to,to:m[0].to}:m[0]);},{text,end});};
try {
 await page.goto(`http://127.0.0.1:5441/office-editor.html?project=${session.projectId}&document=${session.documentId}`);await wait();
 await select('这是需要在线修改的正文。');await page.keyboard.insertText('网页键盘输入已生效。');await save();
 await select('二级');await page.keyboard.insertText('一级');await save();
 await select('桩土承载力 1.0；桩身承载力 1.1');await page.keyboard.insertText('桩土承载力 1.0；桩身承载力 1.0');await save();
 await select('基础结构重要性系数');await page.keyboard.press('ArrowRight');
 // Select the value in its own cell; it is the only separate paragraph with this exact text.
 await page.evaluate(()=>{const c=window.WorkbenchOfficeEditor,m=c.find('1.0').filter(x=>x.text==='1.0');if(m.length!==1)throw Error('基础系数单元格不唯一');c.selectRange(m[0]);});
 await page.keyboard.insertText('1.1');await save();
 await select('参数插入位置：',true);await page.getByRole('button',{name:'参数',exact:true}).click();
 const filter=page.locator('#word-parameter-filter'),options=page.locator('#word-parameter-list');await filter.fill('不存在的参数');assert.equal(await options.getByRole('option').count(),0);
 await filter.fill('项目编号');await options.getByRole('option',{name:'项目编号：QA-WORD-01'}).click();await page.getByRole('button',{name:'插入所选参数'}).click();await save();
 await page.locator('#word-panel-close').click();
 await select('网页键盘输入已生效。');await page.getByRole('button',{name:'加粗',exact:true}).click();await save();
 await page.screenshot({path:join(qa,'word-edited.png')});
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'下载副本'}).click();const download=await downloadPromise;await download.saveAs(join(qa,'word-downloaded.docx'));
 await page.reload();await wait();const read=await page.evaluate(()=>window.WorkbenchOfficeEditor.read());
 assert.match(read.text,/网页键盘输入已生效/);assert.match(read.text,/参数插入位置：QA-WORD-01/);assert.match(read.text,/一级/);assert.match(read.text,/桩身承载力 1.0/);assert.equal(read.dirty,false);
 await page.screenshot({path:join(qa,'word-reopened.png')});
 await writeFile(join(qa,'browser-result.json'),JSON.stringify({status:'passed',errors,document:read.document,text:read.text,checks:['keyboard text','three table cells','parameter filter empty/name/select/insert','bold','save','reload','DOCX download']},null,2));
 console.log(JSON.stringify({status:'passed',errors,revision:read.document.fileRevision}));
} catch(error){await page.screenshot({path:join(qa,'browser-failure.png')});console.error(JSON.stringify({error:error.message,errors,state:await page.locator('#office-state').textContent(),notice:await page.locator('#office-error').textContent()}));throw error;}
finally {await browser.close();}
