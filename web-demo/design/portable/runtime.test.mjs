import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,get} from 'node:http';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createApplication} from '../../deploy/baota/http-app.mjs';
import {portablePaths,portableEnvironment,portableHTML} from '../../deploy/portable/runtime.mjs';
import {projectStoreApi} from '../../server/project-store.mjs';

test('便携版数据独立于软件目录，不继承作者环境中的密钥或E盘资料库',()=>{
 const paths=portablePaths('C:/test/app',{LOCALAPPDATA:'C:/test/user',DEEPSEEK_API_KEY:'DO_NOT_USE',WORKBENCH_DATABASE_ROOT:'E:/private'});
 assert.match(paths.data,/user[\\/]StructureWorkbench$/);
 const env=portableEnvironment(paths);assert.equal(env.DEEPSEEK_API_KEY,undefined);assert.ok(!Object.values(env).some(v=>v.includes('E:/')));
 assert.match(env.WORKBENCH_PYTHON,/runtime[\\/]python[\\/]python.exe$/);
});
test('模式注入不破坏正文导出脚本中的HTML字符串',()=>{
 const input='<html><head></head><body><script>const ending="</body></html>";</script></body></html>';
 const result=portableHTML(input,'/');assert.ok(result.includes('const ending="</body></html>";'));assert.equal((result.match(/WORKBENCH_PORTABLE=true/g)||[]).length,1);assert.ok(!result.includes('src="/portable-projects-ui.js"'));
});
test('本机HTTP服务隔离、同源检查、HTML模式注入与分区版本保存',async t=>{
 const qa=fileURLToPath(new URL('../../qa/portable-runtime/',import.meta.url));await mkdir(qa,{recursive:true});
 const dir=await mkdtemp(join(qa,'run-')),pub=join(dir,'public');await mkdir(pub);
 await writeFile(join(pub,'workbuddy-integrated-studio.html'),'<html><head></head><body>local</body></html>');
 await writeFile(join(pub,'.env'),'not served');await writeFile(join(pub,'test.wasm'),Buffer.from([0,97,115,109]));
 const app=createApplication({publicDir:pub,localOnly:true,transformHTML:portableHTML,plugins:[projectStoreApi({WORKBENCH_PROJECT_STORE:join(dir,'projects')})]});
 const server=createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port;
 assert.match(await (await fetch(base+'/')).text(),/WORKBENCH_PORTABLE=true/);
 const badHost=await new Promise((resolve,reject)=>get(base+'/',{headers:{host:'attacker.invalid'}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject));assert.equal(badHost,403);
 assert.equal((await fetch(base+'/',{headers:{'sec-fetch-site':'cross-site'}})).status,403);
 assert.equal((await fetch(base+'/api/workbench-projects',{headers:{Origin:'https://attacker.invalid'}})).status,403);
 assert.equal((await fetch(base+'/.env')).status,404);
 assert.equal((await fetch(base+'/test.wasm')).headers.get('content-type'),'application/wasm');
 const id='a'.repeat(32),request={method:'POST',headers:{'Content-Type':'application/json','X-Workbench-Request':'project-store'},body:JSON.stringify({expectedRevision:0,data:{parameters:{project_name:'本机测试'}}})};
 assert.equal((await fetch(base+'/api/workbench-projects/'+id+'/main',request)).status,200);
 assert.equal((await fetch(base+'/api/workbench-projects/'+id+'/main',request)).status,409);
 assert.equal((await (await fetch(base+'/api/workbench-projects')).json()).projects[0].name,'本机测试');
});
