import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import vm from 'node:vm';
import {scanCalculationPdfs,calculationPdfApi} from '../../server/calculation-pdf-api.mjs';
const qa=fileURLToPath(new URL('../../qa/calculation-pdfs/',import.meta.url));await mkdir(qa,{recursive:true});
async function fixture(){
 const root=await mkdtemp(join(qa,'scan-'));
 for(const path of ['荷载校核图形/荷载校核.pdf','计算书/上部/设计结果简图.PDF','计算书/基础/基础计算及设计结果.pdf','计算书/施工图/板计算简图.pdf','无关资料/private.pdf','03_盈建科参数导出样本/荷载校核/no.pdf']){
  const full=join(root,path);await mkdir(join(full,'..'),{recursive:true});await writeFile(full,'%PDF-1.4\nfixture');
 }
 await writeFile(join(root,'计算书/上部/编号.dwg'),'not a PDF');
 await writeFile(join(root,'计算书/上部/损坏.pdf'),'not a PDF');
 return root;
}
const metadata=async()=>({pages:3});
test('扫描四类PDF、大小写扩展名，忽略DWG和无关/禁止归档；原件保持只读',async()=>{
 const root=await fixture(),result=await scanCalculationPdfs(root,{metadata});
 assert.equal(result.files.length,4);assert.deepEqual(new Set(result.files.map(f=>f.group)),new Set(['荷载校核','上部','基础','施工图']));
 assert.equal(result.warnings.length,1);assert.match(result.warnings[0],/不是有效 PDF/);
 assert.equal(await readFile(join(root,'荷载校核图形/荷载校核.pdf'),'utf8'),'%PDF-1.4\nfixture');
 const direct=await scanCalculationPdfs(join(root,'计算书/基础'),{metadata});assert.equal(direct.files.length,1);
 await assert.rejects(scanCalculationPdfs('relative/path'),/绝对路径/);
 await assert.rejects(scanCalculationPdfs(join(root,'03_盈建科参数导出样本'),{metadata}),/绝对路径/);
});
test('不跨链接读取其他位置，扫描上限和无法解析的PDF均显式提示',async()=>{
 const root=await fixture(),outside=await fixture();
 await symlink(join(outside,'计算书/基础'),join(root,'计算书/上部/外部目录'),'junction');
 const result=await scanCalculationPdfs(root,{metadata,maxFiles:2});assert.equal(result.files.length,2);assert.ok(result.warnings.some(x=>x.includes('上限')));
 const failed=await scanCalculationPdfs(root,{metadata:async()=>{throw Error('parser unavailable');}});
 assert.equal(failed.files.length,4);assert.ok(failed.files.every(f=>f.pages===0&&f.error));
});
test('PDF接口要求主动同源扫描，按授权文件读页，拒绝任意路径、越界页和文件变化',async t=>{
 const root=await fixture();let handler;
 calculationPdfApi({}, {metadata,render:async()=>Buffer.from('rendered page')}).configureServer({middlewares:{use:(route,fn)=>{handler=fn;}}});
 const server=createServer((req,res)=>handler(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise(r=>server.close(r)));const url='http://127.0.0.1:'+server.address().port;
 const scan=(headers={})=>fetch(url+'/scan',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({path:root})});
 assert.equal((await scan()).status,403);
 assert.equal((await scan({'X-Workbench-Request':'calculation-pdfs',Origin:'https://foreign.example'})).status,403);
 const response=await scan({'X-Workbench-Request':'calculation-pdfs'});assert.equal(response.status,200);
 const result=await response.json(),file=result.files[0];assert.ok(file.id);assert.equal(file.path,undefined);
 assert.equal((await fetch(url+'/page?id='+file.id+'&page=1')).status,200);
 assert.equal((await fetch(url+'/page?id='+file.id+'&page=0')).status,400);
 assert.equal((await fetch(url+'/page?id='+file.id+'&page=4')).status,400);
 assert.equal((await fetch(url+'/file?id=unknown&path='+encodeURIComponent(join(root,file.relativePath)))).status,400);
 const download=await fetch(url+'/file?id='+file.id);assert.equal(download.headers.get('content-type'),'application/pdf');
 assert.equal(await download.text(),'%PDF-1.4\nfixture');
 await writeFile(join(root,file.relativePath),'%PDF-1.4\nchanged fixture');
 assert.equal((await fetch(url+'/page?id='+file.id+'&page=1')).status,400);
});
test('完整27项目录用于新项目和旧占位目录迁移，人工编辑不被覆盖',async()=>{
 const context=vm.createContext({window:{},document:{getElementById:()=>null}});
 vm.runInContext(await readFile(new URL('../../calculation-book-catalog.js',import.meta.url),'utf8'),context);
 const source=await readFile(new URL('../../calculation-book.js',import.meta.url),'utf8');
 vm.runInContext(source.split("document.getElementById('calcbook-add')")[0],context);
 const full=vm.runInContext('calcbookProjectSections({})',context);
 assert.deepEqual(Array.from(full,s=>s.items.length),[1,13,8,5]);
 assert.match(full[1].items.join(' '),/各层梁裂缝宽度简图/);assert.match(full[2].items.join(' '),/桩身承载力验算/);
 assert.equal(full[3].title,'其它由设计根据工程自行确定需要补充的计算内容。');
 context.saved={sections:[{items:['计算书封面及目录']},{items:['计算信息-小震（wmass、wdisp、wzq）']},{items:[]},{items:[]}]};
 assert.equal(vm.runInContext('calcbookProjectSections(saved)[1].items.length',context),13);
 context.saved.catalogVersion=2;assert.equal(vm.runInContext('calcbookProjectSections(saved)[1].items.length',context),1);
 delete context.saved.catalogVersion;context.saved.sections[1].items.push('人工补充');
 assert.equal(vm.runInContext('calcbookProjectSections(saved)[1].items.length',context),2);
});

test('切换项目丢弃迟到扫描，清单按项目恢复且不保存临时文件授权',async()=>{
 const elements=new Map();
 const el=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',innerHTML:'',listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},querySelectorAll:()=>[],removeAttribute(){}});return elements.get(id);};
 let finish;
 const context=vm.createContext({document:{getElementById:el},window:{WorkbenchProjects:{id:'first',scheduleSave(){}}},URL,URLSearchParams,fetch:()=>new Promise(resolve=>{finish=resolve;})});
 vm.runInContext(await readFile(new URL('../../calculation-pdfs.js',import.meta.url),'utf8'),context);
 el('calcbook-pdf-path').value='C:/model-a';
 const oldRequest=el('calcbook-pdf-scan').listeners.click();
 context.window.WorkbenchProjects.id='second';
 context.window.CalculationPDFs.load({path:'C:/model-b',files:[{id:'stale',name:'B.pdf',relativePath:'计算书/基础/B.pdf',group:'基础',pages:2}]});
 finish({ok:true,json:async()=>({root:'C:/model-a',files:[{name:'A.pdf',id:'late',group:'上部',pages:2}]})});await oldRequest;
 const saved=context.window.CalculationPDFs.capture();assert.equal(saved.path,'C:/model-b');assert.equal(saved.files[0].name,'B.pdf');assert.equal(saved.files[0].id,undefined);
 assert.equal(el('calcbook-pdf-scan').disabled,false);assert.match(el('calcbook-pdf-list').innerHTML,/disabled/);
});
