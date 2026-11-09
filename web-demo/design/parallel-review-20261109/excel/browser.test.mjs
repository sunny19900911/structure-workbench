import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const base='http://127.0.0.1:5443',projectId='e'.repeat(32);
const qa=resolve('qa/parallel-review-20261109/excel'),out=join(qa,'acceptance-'+Date.now());await mkdir(out,{recursive:true});
const server=JSON.parse(await readFile(join(qa,'server.json'),'utf8'));
assert.equal(resolve(server.store),join(qa,'projects'));
const headers={'X-Workbench-Request':'office-documents','Content-Type':'application/json'};
const api=async(path,options={})=>{const response=await fetch(base+'/api/office-documents/'+projectId+'/'+path,options);const result=await response.json();assert.ok(response.ok,JSON.stringify(result));return result;};
const spec={title:'Excel专项实际按钮验收',unit:'教学楼',sourceParameterVersion:1,parameters:[{name:'结构高度',value:'24',unit:'m',source:'统一措施'},{name:'设防烈度',value:'7',unit:'度'},{name:'项目名称',value:'Excel隔离验收'},{name:'文字参数',value:'=保留原文'}],tables:[{name:'数据',rows:[['部位','数量','说明'],['首层','4','保留'],['二层','5','保留'],['三层','6','保留']]}]};
const {document:record}=await api('generate-xlsx',{method:'POST',headers,body:JSON.stringify(spec)});
const runtime=join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies');
const {chromium}=await import(pathToFileURL(join(runtime,'node/node_modules/playwright/index.mjs')).href);
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1600,height:1050},acceptDownloads:true});
await context.route('**/*',route=>/^(data:|blob:)/.test(route.request().url())||new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
const page=await context.newPage();page.setDefaultTimeout(20000);
const errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
const editor=page.locator('.office-excel'),cell=a=>editor.locator(`textarea[data-address="${a}"]`);
const revision=()=>page.evaluate(()=>window.WorkbenchOfficeEditor.read().document.fileRevision);
const saved=n=>page.waitForFunction(n=>window.WorkbenchOfficeEditor.read().document.fileRevision>n&&!window.WorkbenchOfficeEditor.busy&&!window.WorkbenchOfficeEditor.dirty,n);
const position=async range=>{await editor.getByRole('textbox',{name:'单元格或选区',exact:true}).fill(range);await editor.getByRole('textbox',{name:'单元格或选区',exact:true}).press('Enter');await page.waitForFunction(range=>window.WorkbenchOfficeEditor.read().selection.range=== (range.includes(':')?range:range+':'+range),range);};
const input=async(address,text)=>{await position(address);const n=await revision();await cell(address).dblclick();await cell(address).fill(text);await cell(address).press('Enter');await saved(n);};
const formula=async(address,text)=>{await position(address);const n=await revision();await editor.getByRole('textbox',{name:'公式或内容',exact:true}).fill(text);await editor.getByRole('textbox',{name:'公式或内容',exact:true}).press('Enter');await saved(n);};
const check=async(name,fn)=>{await fn();checks.push(name);console.log('PASS '+name);};
const open=async id=>{await page.goto(`${base}/office-editor.html?project=${projectId}&document=${id}`);await page.waitForFunction(()=>window.WorkbenchOfficeEditor);};
let downloadPath;
try{
 await open(record.documentId);
 await check('原生生成与项目参数回读',async()=>{assert.equal(await cell('B3').inputValue(),'24');assert.equal(await cell('B4').inputValue(),'7');});
 await check('常规直接输入、双击中文输入和公式结果',async()=>{
  await position('F3');const n=await revision();await cell('F3').click();await page.keyboard.type('4');await page.keyboard.press('Enter');await saved(n);
  await input('F4','中文说明保留');await formula('G3','=F3*3');assert.equal(await cell('G3').inputValue(),'12');
  await formula('G4','=1/0');assert.equal(await cell('G4').inputValue(),'#DIV/0!');
  await formula('G5','=ROUND(F3,0)');assert.equal(await cell('G5').inputValue(),'未计算');await cell('G5').click();assert.match(await editor.getByRole('status').textContent(),/ROUND/);
 });
 await check('中文组合输入事件期间不提交半成文字',async()=>{
  await position('F5');await cell('F5').click();const n=await revision();
  await cell('F5').evaluate(el=>{el.dispatchEvent(new KeyboardEvent('keydown',{key:'Process',keyCode:229,bubbles:true}));el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));el.value='组合输入';el.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true}));});
  await page.waitForTimeout(900);assert.equal(await revision(),n);assert.equal(await cell('F5').inputValue(),'组合输入');
  await cell('F5').evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'组合输入'})));await saved(n);
 });
 await check('公式工具栏：IF、重算、公式与结果切换',async()=>{
  await position('G6');await editor.getByRole('tab',{name:'公式',exact:true}).click();await editor.getByRole('button',{name:'IF 条件判断',exact:true}).click();
  assert.equal(await editor.getByRole('textbox',{name:'公式或内容'}).inputValue(),'=IF(A1>0,"是","否")');
  const n=await revision();await editor.getByRole('textbox',{name:'公式或内容'}).fill('=IF(G3=12,"是","否")');await editor.getByRole('textbox',{name:'公式或内容'}).press('Enter');await saved(n);assert.equal(await cell('G6').inputValue(),'是');
  const before=await revision();await editor.getByRole('button',{name:'重新计算',exact:true}).click();await saved(before);
  await editor.getByRole('button',{name:'显示公式',exact:true}).click();assert.equal(await cell('G3').inputValue(),'=F3*3');
  await editor.getByRole('button',{name:'显示结果',exact:true}).click();assert.equal(await cell('G3').inputValue(),'12');
 });
 await check('参数搜索、选择、插入和无匹配解除',async()=>{
  await editor.getByRole('tab',{name:'开始',exact:true}).click();await position('H3');await editor.locator('.excel-parameters summary').click();
  await editor.getByRole('searchbox',{name:'搜索参数'}).fill('不存在');assert.equal(await editor.getByRole('listbox',{name:'项目参数'}).locator('option').count(),0);assert.ok(await editor.getByRole('button',{name:'插入选中参数'}).isDisabled());
  await editor.getByRole('searchbox',{name:'搜索参数'}).fill('高度');assert.equal(await editor.getByRole('listbox',{name:'项目参数'}).locator('option').count(),1);await editor.getByRole('listbox',{name:'项目参数'}).selectOption('A3');
  const n=await revision();await editor.getByRole('button',{name:'插入选中参数'}).click();await saved(n);assert.equal(await cell('H3').inputValue(),'24');
  await position('H4');await editor.locator('.excel-parameters summary').click();await editor.getByRole('searchbox',{name:'搜索参数'}).fill('文字参数');const r=await revision();await editor.getByRole('button',{name:'插入选中参数'}).click();await saved(r);assert.equal(await cell('H4').inputValue(),'=保留原文');
 });
 await check('合并标题之外按指定列筛选、保存重开、解除筛选',async()=>{
  await input('B3','24.0');await position('A2:D6');await editor.getByRole('tab',{name:'数据',exact:true}).click();await editor.locator('details').filter({has:page.locator('summary',{hasText:'筛选'})}).locator('summary').click();
  await editor.getByLabel('筛选列',{exact:true}).selectOption('2');await editor.getByLabel('筛选条件',{exact:true}).selectOption('equal');await editor.getByLabel('筛选值',{exact:true}).fill('24');
  const n=await revision();await editor.getByRole('button',{name:'应用筛选',exact:true}).click();await saved(n);assert.equal(await cell('B3').count(),1);assert.equal(await cell('B4').count(),0);
  await page.reload();await page.waitForFunction(()=>window.WorkbenchOfficeEditor);assert.equal(await cell('B4').count(),0);
  await editor.locator('details').filter({has:page.locator('summary',{hasText:'筛选'})}).locator('summary').click();const r=await revision();await editor.getByRole('button',{name:'清除筛选',exact:true}).click();await saved(r);assert.equal(await cell('B4').inputValue(),'7');
 });
 await check('改值后依赖更新、撤销重做及原生下载',async()=>{
  await input('F3','5');assert.equal(await cell('G3').inputValue(),'15');assert.equal(await cell('G6').inputValue(),'否');
  let n=await revision();await editor.getByRole('button',{name:'撤销',exact:true}).click();await saved(n);assert.equal(await cell('G3').inputValue(),'12');
  n=await revision();await editor.getByRole('button',{name:'重做',exact:true}).click();await saved(n);assert.equal(await cell('G3').inputValue(),'15');
  await page.getByRole('button',{name:'保存到本机',exact:true}).click();
  const event=page.waitForEvent('download');await page.getByRole('button',{name:'下载副本',exact:true}).click();const download=await event;downloadPath=join(out,download.suggestedFilename());await download.saveAs(downloadPath);
  await page.screenshot({path:join(out,'实际编辑器.png'),fullPage:true});
 });
 await check('导出XLSX原生公式、缓存、文字类型和筛选解除',async()=>{
  const script='import sys,json;from openpyxl import load_workbook;w=load_workbook(sys.argv[1]);v=load_workbook(sys.argv[1],data_only=True);s=w["项目参数"];c=v["项目参数"];assert s["G3"].value=="=F3*3";assert c["G3"].value==15;assert c["G4"].value=="#DIV/0!";assert c["G5"].value is None;assert s["G5"].value=="=ROUND(F3,0)";assert c["G6"].value=="否";assert c["H3"].value==24;assert s["H4"].value=="=保留原文" and s["H4"].data_type=="s";assert s.auto_filter.ref is None;assert s["F4"].value=="中文说明保留";print("native XLSX assertions passed")';
  const result=await promisify(execFile)(join(runtime,'python/python.exe'),['-c',script,downloadPath],{windowsHide:true});console.log(result.stdout.trim());
 });
 await check('下载文件重新导入、重开与继续编辑',async()=>{
  const {document:imported}=await api('?type=xlsx',{method:'POST',headers:{'X-Workbench-Request':'office-documents','Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent('重新导入验收'),'X-Document-Unit':encodeURIComponent('教学楼')},body:await readFile(downloadPath)});
  await open(imported.documentId);assert.equal(await cell('G3').inputValue(),'15');assert.equal(await cell('H3').inputValue(),'24');await input('F3','6');assert.equal(await cell('G3').inputValue(),'18');await page.reload();await page.waitForFunction(()=>window.WorkbenchOfficeEditor);assert.equal(await cell('G3').inputValue(),'18');
 });
 assert.deepEqual(errors,[]);
 await writeFile(join(out,'results.json'),JSON.stringify({url:page.url(),record,checks,errors,downloadPath},null,2));console.log('EVIDENCE '+out);
}catch(error){await page.screenshot({path:join(out,'failure.png'),fullPage:true}).catch(()=>{});await writeFile(join(out,'failure.json'),JSON.stringify({message:error.stack,checks,errors,url:page.url()},null,2));throw error;}
finally{await browser.close();}
