// Isolated frontend exercise: real DOCX bytes and local filesystem; API fixture is explicit.
import {createServer} from 'vite';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=process.cwd(),real=process.argv.includes('--real'),commands=process.argv.includes('--commands'),qa=resolve(root,'qa/portable-release/mcp/office'+(real?'/real-template':commands?'/commands':''));
await mkdir(qa,{recursive:true});
const {chromium}=await import(pathToFileURL(process.env.WORKBENCH_PLAYWRIGHT_ENTRY||'C:/Users/mj528/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const source=real?JSON.parse(await readFile(resolve(root,'qa/portable-release/mcp/最终验收 1108/acceptance/artifacts.json'),'utf8')).find(x=>x.filename==='结构初步设计说明.docx').path:resolve(root,'qa/portable-release/mcp/office/A3双栏测试.docx');
const projectId='a'.repeat(32),documentId='b'.repeat(32);let revision=1,current=await readFile(source);await writeFile(join(qa,'source.docx'),current);
const metadata=()=>({projectId,documentId,type:'docx',title:'A3 双栏测试',unit:'测试教学楼',fileRevision:revision,sourceParameterVersion:1});
const server=await createServer({configFile:false,root,server:{host:'127.0.0.1',port:58841,strictPort:true},plugins:[{name:'office-test-api',configureServer(s){s.middlewares.use('/api/office-documents',async(req,res)=>{try{const url=new URL(req.url,'http://localhost');res.setHeader('Content-Type','application/json');if(req.method==='GET'&&url.pathname.endsWith('/content')){res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.wordprocessingml.document');return res.end(current);}if(req.method==='POST'){assert.equal(req.headers['x-workbench-request'],'office-documents');if(Number(url.searchParams.get('expectedRevision'))!==revision){res.statusCode=409;return res.end(JSON.stringify({error:'版本冲突'}));}const chunks=[];for await(const c of req)chunks.push(c);current=Buffer.concat(chunks);revision++;await writeFile(join(qa,'edited.docx'),current);}res.end(JSON.stringify({document:metadata()}));}catch(e){res.statusCode=500;res.end(JSON.stringify({error:e.message}));}});}}]});
await server.listen();const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page=await browser.newPage({viewport:{width:commands?1000:1600,height:1100}}),errors=[],external=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{if(!route.request().url().startsWith('http://127.0.0.1:58841')&&!/^(blob:|data:)/.test(route.request().url())){external.push(route.request().url());return route.abort();}return route.continue();});
try{
 await page.goto(`http://127.0.0.1:58841/office-editor.html?project=${projectId}&document=${documentId}`,{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(()=>window.WorkbenchOfficeEditor,{timeout:90000});
 const read=await page.evaluate(()=>window.WorkbenchOfficeEditor.read());assert.match(read.text,real?/MCP人工改稿保留验收/:/昆明市经开区/);assert.equal(read.dirty,false);
 const untouched=await page.evaluate(async()=>Array.from(new Uint8Array(await(await window.WorkbenchOfficeEditor.exportBlob()).arrayBuffer())));await writeFile(join(qa,'untouched.docx'),Buffer.from(untouched));
 await page.evaluate(expectedText=>window.WorkbenchOfficeEditor.executeCommand({name:'text.replace',expectedRevision:1,args:{expectedText,text:'网页已经修改并保存。'}}),real?'本段为MCP人工改稿保留验收。':'此处为人工修改测试段落。');
 assert.equal((await page.evaluate(()=>window.WorkbenchOfficeEditor.read())).dirty,true);
 await page.getByRole('button',{name:'保存到本机',exact:true}).click();await page.waitForFunction(()=>window.WorkbenchOfficeEditor.read().document.fileRevision===2);
 await page.screenshot({path:join(qa,'word-editor.png'),fullPage:false});
 await page.reload();await page.waitForFunction(()=>window.WorkbenchOfficeEditor,{timeout:90000});
 assert.match((await page.evaluate(()=>window.WorkbenchOfficeEditor.read())).text,/网页已经修改并保存/);
 const old=await page.evaluate(async()=>{try{await window.WorkbenchOfficeEditor.executeCommand({name:'text.replace',expectedRevision:1,args:{expectedText:'网页已经修改并保存。',text:'不应写入。'}});return false;}catch{return true;}});assert.equal(old,true);
 if(commands){
  const image='data:image/png;base64,'+(await readFile(resolve(root,'qa/portable-release/mcp/office/picture.png'))).toString('base64');
  const outcomes=await page.evaluate(async image=>{const e=window.WorkbenchOfficeEditor,run=(name,args={})=>e.executeCommand({name,args,expectedRevision:2});const outcomes=[];for(const name of ['format.bold','format.italic','format.underline']){await run(name,{targetText:'网页已经修改并保存。'});outcomes.push(name);}await run('format.size',{targetText:'网页已经修改并保存。',size:14});await run('format.font',{targetText:'网页已经修改并保存。',font:'仿宋'});await run('paragraph.center',{targetText:'图 1 测试总体示意图'});await run('paragraph.left',{targetText:'图 1 测试总体示意图'});await run('paragraph.justify',{targetText:'图 1 测试总体示意图'});await run('table.addRow',{targetText:'测试连廊'});await run('table.deleteRow',{targetText:'测试连廊'});await run('history.undo');await run('history.redo');await run('image.insert',{targetText:'图 1 测试总体示意图',data:image,width:180});await run('table.insert',{targetText:'图 1 测试总体示意图',rows:2,columns:2});await e.save();return {outcomes,read:e.read()};},image);
  assert.equal(outcomes.read.document.fileRevision,3);await writeFile(join(qa,'commands.json'),JSON.stringify(outcomes,null,2));
 }
 assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 await writeFile(join(qa,'browser-verification.json'),JSON.stringify({passed:commands?19:5,revision,external,errors,operations:['open-native-docx','replace-text','save-native-docx','reopen-edited-docx','reject-old-revision']},null,2));console.log(JSON.stringify({passed:commands?19:5,qa,revision}));
}catch(e){await page.screenshot({path:join(qa,'failure.png')}).catch(()=>{});await writeFile(join(qa,'failure.json'),JSON.stringify({message:e.message,errors,external,body:await page.locator('body').innerText()},null,2));throw e;}finally{await browser.close();await server.close();}
