import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {createApplication} from '../../deploy/baota/http-app.mjs';
import {calculationPdfApi,scanCalculationPdfs,uploadLocation} from '../../server/calculation-pdf-api.mjs';
const qa=fileURLToPath(new URL('../../qa/calculation-deployment/',import.meta.url));await mkdir(qa,{recursive:true});
const project='a'.repeat(32),batch='b'.repeat(32);

test('Linux明确拒绝本机盘符；选择的目录内可发现嵌套单体，并保持分组和自然排序',async()=>{
 await assert.rejects(scanCalculationPdfs('E:\\模型',{platform:'linux'}),/选择本机文件夹/);
 const root=await mkdtemp(join(qa,'nested-'));
 for(const path of ['模型/单体1/计算书/上部/10.pdf','模型/单体1/计算书/上部/2.pdf','模型/荷载校核图形/1.pdf','无关/9.pdf']){await mkdir(join(root,path,'..'),{recursive:true});await writeFile(join(root,path),'%PDF-1.4\nfixture');}
 const result=await scanCalculationPdfs(root,{metadata:async()=>({pages:1})});
 assert.deepEqual(result.files.map(f=>f.name),['1.pdf','2.pdf','10.pdf']);
});

test('上传限定项目批次与PDF目录，拒绝遍历、DWG及原始归档',()=>{
 for(const path of ['../上部/a.pdf','上部/../../a.pdf','上部/a.dwg','上部/C:\\a.pdf','无关/a.pdf','03_盈建科参数导出样本/上部/a.pdf'])assert.throws(()=>uploadLocation(qa,project,batch,path));
 assert.throws(()=>uploadLocation(qa,'../',batch,'上部/a.pdf'));
 assert.match(uploadLocation(qa,project,batch,'模型/计算书/上部/a.pdf').path,/a\.pdf$/);
});

test('宝塔 /work/ 鉴权下上传、扫描、预览、按同一目录顺序合并；错误不会产生假成功',async t=>{
 const root=await mkdtemp(join(qa,'api-')),seen=[];
 const app=createApplication({publicDir:root,basePath:'/work/',user:'qa',password:'test-only-password-123',plugins:[calculationPdfApi({CALCBOOK_UPLOAD_DIR:join(root,'uploads')},{metadata:async()=>({pages:1}),render:async()=>Buffer.from('png'),merge:async paths=>{seen.push(paths);return Buffer.from('%PDF-merged');}})]});
 const server=createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port+'/work/api/calculation-pdfs',headers={Authorization:'Basic '+Buffer.from('qa:test-only-password-123').toString('base64'),'X-Workbench-Request':'calculation-pdfs'};
 assert.equal((await fetch(base+'/scan')).status,401);
 const upload=async(path,body='%PDF-1.4\nfixture')=>fetch(base+'/upload?'+new URLSearchParams({project,batch,path}),{method:'POST',headers,body});
 assert.equal((await upload('上部/fake.pdf','bad')).status,400);
 assert.equal((await upload('../上部/a.pdf')).status,400);
 let saved;
 for(const path of ['模型/计算书/基础/1.pdf','模型/荷载校核/1.pdf']){const res=await upload(path);assert.equal(res.status,200);saved=await res.json();}
 assert.equal((await upload('模型/荷载校核/1.pdf')).status,400);
 const post=(path,data)=>fetch(base+path,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(data)});
 const result=await (await post('/scan',{path:saved.root})).json();assert.equal(result.files.length,2);
 assert.deepEqual(result.files.map(f=>f.group),['荷载校核','基础']);
 assert.equal((await fetch(base+'/page?'+new URLSearchParams({id:result.files[0].id,page:1}),{headers})).status,200);
 const ids=result.files.map(f=>f.id),res=await post('/export',{ids});assert.equal(res.status,200);assert.equal(await res.text(),'%PDF-merged');assert.equal(seen.length,1);
 assert.match(seen[0][0],/荷载校核/);
 assert.equal((await post('/export',{ids:[ids[0],ids[0]]})).status,400);
 assert.equal((await post('/export',{ids:['expired']})).status,400);
 await writeFile(seen[0][0],'%PDF-1.4\nchanged');assert.equal((await post('/export',{ids})).status,400);
 assert.equal(seen.length,1);
});
