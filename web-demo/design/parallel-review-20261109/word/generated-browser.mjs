import {chromium} from 'file:///C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1104-2876-0_26.1104.2876.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules/playwright/index.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
const qa=resolve('qa/parallel-review-20261109/word'),{projectId}=JSON.parse(await readFile(join(qa,'workbench-result.json'),'utf8'));
const response=await fetch('http://127.0.0.1:5441/api/office-documents/'+projectId+'?type=docx',{method:'POST',headers:{'x-workbench-request':'office-documents','x-file-name':encodeURIComponent('扩初生成稿原生编辑'),'x-document-unit':encodeURIComponent('QA教学楼')},body:await readFile(join(qa,'expansion-downloaded.docx'))});
const {document}=await response.json();assert.ok(document);
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const page=await browser.newPage({viewport:{width:1500,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
const ready=()=>page.waitForFunction(()=>window.WorkbenchOfficeEditor&&!window.WorkbenchOfficeEditor.busy,{timeout:90000});
try{
 await page.goto(`http://127.0.0.1:5441/office-editor.html?project=${projectId}&document=${document.documentId}`);await ready();
 for(const [label,before,after] of [['桩基结构安全等级','一级','二级'],['基础结构重要性系数','1.1','1.0'],['桩基结构重要性系数','桩土承载力 1.0；桩身承载力 1.1','桩土承载力 1.0；桩身承载力 1.0']]){
  await page.evaluate(({label,before})=>{const c=window.WorkbenchOfficeEditor,anchor=c.find(label)[0];if(!anchor)throw Error(label+'不存在');const range=c.find(before).find(r=>r.from>anchor.to&&r.from-anchor.to<30);if(!range)throw Error(label+'取值未定位');c.selectRange(range);},{label,before});
  await page.keyboard.insertText(after);await page.getByRole('button',{name:'保存到本机',exact:true}).click();await page.waitForFunction(()=>!window.WorkbenchOfficeEditor.dirty&&!window.WorkbenchOfficeEditor.busy);
 }
 const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'下载副本',exact:true}).click();await(await downloaded).saveAs(join(qa,'generated-edited.docx'));
 await page.reload();await ready();const read=await page.evaluate(()=>window.WorkbenchOfficeEditor.read());
 assert.match(read.text,/桩基结构安全等级\s*二级/);assert.match(read.text,/基础结构重要性系数\s*1.0/);assert.match(read.text,/桩土承载力 1.0；桩身承载力 1.0/);assert.match(read.text,/\(1.0 \+ 0.0\)/);assert.match(read.text,/1.25（8 层）/);
 await page.evaluate(()=>{const c=window.WorkbenchOfficeEditor;c.selectRange(c.find('桩基结构安全等级')[0]);});await page.screenshot({path:join(qa,'generated-reopened.png')});
 await writeFile(join(qa,'generated-result.json'),JSON.stringify({status:'passed',errors,document:read.document,text:read.text},null,2));console.log(JSON.stringify({status:'passed',errors,revision:read.document.fileRevision}));
}catch(error){await page.screenshot({path:join(qa,'generated-failure.png')});console.error(JSON.stringify({error:error.message,errors}));throw error;}finally{await browser.close();}
