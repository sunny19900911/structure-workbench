import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fixture} from './fixture.mjs';
const require=createRequire(process.env.WORKBENCH_BROWSER_DEPENDENCIES?join(process.env.WORKBENCH_BROWSER_DEPENDENCIES,'package.json'):import.meta.url);
const {chromium}=require('playwright');
const f=await fixture();let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.WORKBENCH_BROWSER_CHANNEL?{channel:process.env.WORKBENCH_BROWSER_CHANNEL}:{})});const page=await browser.newPage({viewport:{width:1365,height:1000},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(f.origin+'/qa.html?id='+f.record.documentId);await page.waitForFunction(()=>window.controller);
 await page.getByRole('button',{name:'选择 Text 0',exact:true}).first().click();
 await page.getByRole('textbox',{name:'幻灯片文字',exact:true}).fill('结构方案调整稿\n教学楼');
 await page.waitForFunction(()=>!controller.dirty&&!controller.busy);
 assert.equal(await page.evaluate(()=>controller.read().view.slides[0].shapes[0].text),'结构方案调整稿\n教学楼');
 await page.getByLabel('字号',{exact:true}).fill('36');await page.getByLabel('字号',{exact:true}).press('Tab');await page.waitForFunction(()=>!controller.busy);
 await page.getByText('位置与大小',{exact:true}).click();await page.getByLabel('X (cm)',{exact:true}).fill('3');await page.getByLabel('高 (cm)',{exact:true}).fill('3');await page.getByRole('button',{name:'应用位置尺寸'}).click();await page.waitForFunction(()=>!controller.busy);
 assert.equal(await page.evaluate(()=>controller.read().view.slides[0].shapes[0].x),1080000);
 await page.locator('.ppt-ribbon-menu>summary').click();await page.getByRole('button',{name:'复制页',exact:true}).click();await page.waitForFunction(()=>controller.read().view.slides.length===3&&!controller.busy);
 await page.locator('.ppt-ribbon-menu>summary').click();await page.getByRole('button',{name:'下移',exact:true}).click();await page.waitForFunction(()=>!controller.busy);
 await page.getByRole('button',{name:'文本框',exact:true}).click();await page.waitForFunction(()=>!controller.busy);
 const count=await page.evaluate(()=>controller.read().view.slides[2].shapes.length);
 await page.getByRole('button',{name:'撤销',exact:true}).click();await page.waitForFunction(()=>!controller.busy);
 assert.equal(await page.evaluate(()=>controller.read().view.slides[2].shapes.length),count-1);
 await page.getByRole('button',{name:'重做',exact:true}).click();await page.waitForFunction(()=>!controller.busy);
 assert.equal(await page.evaluate(()=>controller.read().view.slides[2].shapes.length),count);
 const imagePath=join(f.directory,'model.png');
 await promisify(execFile)(process.env.WORKBENCH_PYTHON||join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'),['-c','from PIL import Image,ImageDraw; import sys; im=Image.new("RGB",(600,300),"#edf3f8"); d=ImageDraw.Draw(im); [d.line((x,30,x,270),fill="#386f9b",width=3) for x in range(30,600,90)]; [d.line((30,y,570,y),fill="#386f9b",width=3) for y in range(30,300,60)]; im.save(sys.argv[1])',imagePath],{windowsHide:true});
 await page.locator('input[type=file]').setInputFiles(imagePath);await page.waitForFunction(()=>controller.read().view.slides[2].shapes.some(s=>s.type==='pic')&&!controller.busy);
 await page.getByText('位置与大小',{exact:true}).click();await page.getByLabel('X (cm)',{exact:true}).fill('16');await page.getByLabel('Y (cm)',{exact:true}).fill('8');await page.getByRole('button',{name:'应用位置尺寸'}).click();await page.waitForFunction(()=>!controller.busy);
 assert.equal(await page.evaluate(()=>controller.read().view.slides[2].shapes.find(s=>s.type==='pic').x),5760000);
 // MCP calls the same controller command, with the same file revision check.
 await page.evaluate(async()=>{const r=controller.read();await controller.executeCommand({name:'shape.format',expectedRevision:r.document.fileRevision,args:{slide:3,shapeId:r.view.slides[2].shapes[0].id,bold:false,color:'#345678'}});});
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'下载',exact:true}).click();await(await download).saveAs(join(f.directory,'浏览器导出.pptx'));
 await page.screenshot({path:join(f.directory,'editor.png'),fullPage:true});
 const revision=await page.evaluate(()=>controller.read().document.fileRevision);
 await page.reload();await page.waitForFunction(()=>window.controller);assert.equal(await page.evaluate(()=>controller.read().document.fileRevision),revision);
 // Rejected stale command cannot overwrite; pending draft blocks competing commands.
 await page.getByRole('button',{name:'选择 Text 0',exact:true}).first().click();await page.getByRole('textbox',{name:'幻灯片文字',exact:true}).fill('保留未提交草稿');
 const blocked=await page.evaluate(async()=>{try{await controller.executeCommand({name:'slide.delete',args:{slide:1},expectedRevision:controller.read().document.fileRevision});return false;}catch{return true;}});assert.equal(blocked,true);
 await page.keyboard.press('Control+s');await page.waitForFunction(()=>!controller.dirty&&!controller.busy);
 // A confirmed server rejection retains typed text and does not change file revision.
 await page.route('**/command',route=>route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({error:'隔离保存失败'})}));
 await page.getByRole('textbox',{name:'幻灯片文字',exact:true}).fill('失败时保留文字');await page.keyboard.press('Control+s');await page.waitForFunction(()=>!controller.busy&&controller.dirty);
 assert.equal(await page.getByRole('textbox',{name:'幻灯片文字',exact:true}).inputValue(),'失败时保留文字');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,revision,directory:f.directory,checks:['auto-save','format','geometry','duplicate','order','add-text','undo-redo','image-insert-resize','shared-command','download','reopen','pending-guard','failure-retains-draft']}));
}finally{await browser?.close();await f.close();}
