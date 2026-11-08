// Isolated frontend exercise: real DOCX bytes and local filesystem; API fixture is explicit.
import {createServer} from 'vite';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=process.cwd(),commands=true,built=true,qa=resolve(root,'qa/portable-release/mcp/office-word-extended'+(built?'-built':''));
await mkdir(qa,{recursive:true});
const {chromium}=await import(pathToFileURL(process.env.WORKBENCH_PLAYWRIGHT_ENTRY||'C:/Users/mj528/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const source=resolve(root,'qa/portable-release/mcp/office/A3双栏测试.docx');
const projectId='a'.repeat(32),documentId='b'.repeat(32);let rejectSave=false,saveRequests=0,revision=1,current=await readFile(source);await writeFile(join(qa,'source.docx'),current);
const metadata=()=>({projectId,documentId,type:'docx',title:'A3 双栏测试',unit:'测试教学楼',fileRevision:revision,sourceParameterVersion:1});
const server=await createServer({configFile:false,root:built?join(root,'dist'):root,cacheDir:join(qa,'vite-cache'),server:{host:'127.0.0.1',port:5393,strictPort:true},plugins:[{name:'office-test-api',configureServer(s){s.middlewares.use('/api/office-documents',async(req,res)=>{try{const url=new URL(req.url,'http://localhost');res.setHeader('Content-Type','application/json');if(req.method==='GET'&&url.pathname.endsWith('/content')){res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.wordprocessingml.document');return res.end(current);}if(req.method==='POST'){saveRequests++;if(rejectSave){res.statusCode=409;return res.end(JSON.stringify({error:'版本冲突（隔离测试）'}));}assert.equal(req.headers['x-workbench-request'],'office-documents');if(Number(url.searchParams.get('expectedRevision'))!==revision){res.statusCode=409;return res.end(JSON.stringify({error:'版本冲突'}));}const chunks=[];for await(const c of req)chunks.push(c);current=Buffer.concat(chunks);revision++;await writeFile(join(qa,'edited.docx'),current);}res.end(JSON.stringify({document:metadata()}));}catch(e){res.statusCode=500;res.end(JSON.stringify({error:e.message}));}});}}]});
await server.listen();const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page=await browser.newPage({viewport:{width:commands?1000:1600,height:1100}}),errors=[],external=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{if(!route.request().url().startsWith('http://127.0.0.1:5393')&&!/^(blob:|data:)/.test(route.request().url())){external.push(route.request().url());return route.abort();}return route.continue();});
try {
 await page.goto(`http://127.0.0.1:5393/office-editor.html?project=${projectId}&document=${documentId}`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.WorkbenchOfficeEditor,{timeout:90000});
 const outcomes=await page.evaluate(async()=>{
  const e=window.WorkbenchOfficeEditor,results=[],sectionId=e.sections()[0].address.sectionId;
  for(const [name,args] of [
   ['page.setup',{sectionId,paper:'A4',orientation:'portrait'}],
   ['page.margins',{sectionId,top:20,bottom:22,left:25,right:25}],
   ['page.columns',{sectionId,count:1,gap:10}],
   ['page.headerDistance',{sectionId,header:10,footer:12}],
   ['table.split',{targetText:'测试教学楼基本信息'}],['history.undo',{}],
   ['table.header',{targetText:'单体名称'}],['history.undo',{}],
   ['format.clear',{targetText:'图 1 测试总体示意图'}],
   ['link.set',{targetText:'图 1 测试总体示意图',url:'https://example.com/word'}],
   ['note.insert',{targetText:'本项目位于昆明市经开区。',type:'footnote',content:'脚注保存验收。'}],
   ['format.superscript',{targetText:'23.70'}],
   ['format.subscript',{targetText:'9.50'}],
   ['comment.add',{targetText:'此处为人工修改测试段落。',content:'批注内容验收。'}],
   ['table.background',{targetText:'单体名称',color:'#e8efff'}],
   ['format.grow',{targetText:'图 1 测试总体示意图'}],
   ['format.shrink',{targetText:'图 1 测试总体示意图'}],
   ['insert.pageBreak',{targetText:'25. 结构设计说明验收文本。'}],
   ['text.replaceAll',{search:'验收文本',text:'批量替换文本'}],
   ['review.replace',{targetText:'测试教学楼基本信息',text:'修订后的基本信息'}],
   ['toc.insert',{}],['toc.update',{}],
  ]) {try{await e.executeCommand({name,args,expectedRevision:e.read().document.fileRevision});results.push({name,passed:true});}catch(error){results.push({name,passed:false,error:error.message});}}
  await e.save();return {results,sections:e.sections(),notes:e.notes(),changes:e.changes(),stats:e.statistics(),outline:e.outline()};
 });
 await writeFile(join(qa,'extended-results.json'),JSON.stringify(outcomes,null,2));console.log(JSON.stringify(outcomes));
 await writeFile(join(qa,'with-revisions.docx'),current);
 await page.reload();await page.waitForFunction(()=>window.WorkbenchOfficeEditor,{timeout:90000});
 await page.setViewportSize({width:1600,height:1000});
 await page.getByRole('tab',{name:'页面',exact:true}).click();
 await page.screenshot({path:join(qa,'page-tools.png')});
 await page.getByRole('button',{name:'页边距',exact:true}).click();
 await page.locator('#word-dialog').waitFor();
 await page.screenshot({path:join(qa,'page-dialog.png')});
 await page.getByRole('button',{name:'取消',exact:true}).click();
 await page.getByRole('tab',{name:'引用',exact:true}).click();
 await page.getByRole('button',{name:'查看注释',exact:true}).click();
 assert.match(await page.locator('#word-panel-body').innerText(),/脚注保存验收/);
 await page.getByRole('button',{name:'关闭侧栏',exact:true}).click();
 await page.getByRole('tab',{name:'审阅',exact:true}).click();
 await page.screenshot({path:join(qa,'review-tools.png')});
 await page.getByRole('tab',{name:'开始',exact:true}).click();
 await page.screenshot({path:join(qa,'home-tools.png')});
 assert.match((await page.evaluate(()=>window.WorkbenchOfficeEditor.read())).text,/此处为人工修改测试段落/);
 // Visible form submits through the same revision-checked command path.
 await page.getByRole('tab',{name:'页面',exact:true}).click();
 await page.getByRole('button',{name:'页边距',exact:true}).click();
 await page.getByLabel('上边距（mm）',{exact:true}).fill('21');
 await page.locator('#word-dialog').getByRole('button',{name:'应用',exact:true}).click();
 await page.getByRole('button',{name:'保存到本机',exact:true}).click();
 await page.waitForFunction(()=>!window.WorkbenchOfficeEditor.dirty);
 // Native reject then accept persist actual revision contents.
 const decisions=await page.evaluate(async()=>{const e=window.WorkbenchOfficeEditor;
  await e.executeCommand({name:'review.rejectAll',args:{},expectedRevision:e.read().document.fileRevision});
  const rejected=e.read().text.includes('测试教学楼基本信息')&&!e.read().text.includes('修订后的基本信息');
  await e.executeCommand({name:'review.replace',args:{targetText:'测试教学楼基本信息',text:'已接受的基本信息'},expectedRevision:e.read().document.fileRevision});
  await e.executeCommand({name:'review.acceptAll',args:{},expectedRevision:e.read().document.fileRevision});
  await e.save();return {rejected,text:e.read().text};});
 assert.equal(decisions.rejected,true);assert.match(decisions.text,/已接受的基本信息/);
 await writeFile(join(qa,'accepted.docx'),current);
 await page.getByRole('tab',{name:'视图',exact:true}).click();
 await page.getByRole('button',{name:'查找替换',exact:true}).first().click();
 await page.locator('#word-search').fill('批量替换文本');await page.locator('#word-find').click();
 assert.match(await page.locator('#word-search-count').innerText(),/25/);
 await page.locator('#word-panel-close').click();
 await page.locator('#ribbon-mode').selectOption('hidden');assert.equal(await page.locator('#office-ribbon').isVisible(),false);
 await page.keyboard.press('Control+F1');assert.equal(await page.locator('#office-ribbon').isVisible(),true);
 await page.locator('#ribbon-mode').selectOption('compact');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(qa,'mobile-tools.png')});
 await page.locator('#ribbon-mode').selectOption('full');
 assert.ok(outcomes.results.every(r=>r.passed));assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log('extended browser passed');
} catch(e) {await page.screenshot({path:join(qa,'failure.png')}).catch(()=>{});throw e;}finally{await browser.close();await server.close();}
