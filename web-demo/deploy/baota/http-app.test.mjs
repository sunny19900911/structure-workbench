import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApplication} from './http-app.mjs';
import {projectStoreApi} from '../../server/project-store.mjs';

test('个人部署入口拒绝空密码和短密码',()=>{
 assert.throws(()=>createApplication({user:'test',password:''}));
 assert.throws(()=>createApplication({user:'test',password:'short'}));
});
test('登录保护、静态隔离与项目API挂载',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wb-baota-test-')),password=randomBytes(24).toString('hex');
 await writeFile(join(dir,'workbuddy-integrated-studio.html'),'<h1>Workbench</h1>');
 await writeFile(join(dir,'.env'),'test fixture must not be served');
 const app=createApplication({publicDir:dir,user:'test',password,plugins:[projectStoreApi({WORKBENCH_PROJECT_STORE:join(dir,'store')})]});
 const server=createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port,headers={Authorization:'Basic '+Buffer.from('test:'+password).toString('base64')};
 try{
  assert.equal((await fetch(base+'/')).status,401);
  assert.equal((await fetch(base+'/api/workbench-projects')).status,401);
  assert.equal((await fetch(base+'/',{headers})).status,200);
  assert.equal((await fetch(base+'/.env',{headers})).status,404);
  assert.equal((await fetch(base+'/vite.config.js',{headers})).status,404);
  assert.equal((await fetch(base+'/api/workbench-projects',{headers:{...headers,Origin:'https://other.invalid'}})).status,403);
  const list=await fetch(base+'/api/workbench-projects',{headers});assert.equal(list.status,200);
  assert.ok((await list.text()).includes('projects'));
 }finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});

test('/work/ 子路径保持认证、静态资源和带版本的项目保存',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wb-baota-subpath-test-')),password=randomBytes(24).toString('hex');
 const publicDir=join(dir,'dist'),storeDir=join(dir,'store');
 await mkdir(join(publicDir,'assets'),{recursive:true});
 await writeFile(join(publicDir,'workbuddy-integrated-studio.html'),'<h1>Subpath Workbench</h1>');
 await writeFile(join(publicDir,'assets','app.js'),'export const mounted = true;');
 const app=createApplication({publicDir,basePath:'/work/',user:'test',password,plugins:[projectStoreApi({WORKBENCH_PROJECT_STORE:storeDir})]});
 const server=createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port,headers={Authorization:'Basic '+Buffer.from('test:'+password).toString('base64')};
 const id=randomBytes(16).toString('hex'),endpoint=base+'/work/api/workbench-projects/'+id+'/main';
 try{
  for(const pathname of ['/work','/work/','/work/assets/app.js','/work/api/workbench-projects'])assert.equal((await fetch(base+pathname,{redirect:'manual'})).status,401);
  const redirect=await fetch(base+'/work?project='+id,{headers,redirect:'manual'});
  assert.equal(redirect.status,308);assert.equal(redirect.headers.get('location'),'/work/?project='+id);
  const page=await fetch(base+'/work/',{headers});assert.equal(page.status,200);assert.equal(await page.text(),'<h1>Subpath Workbench</h1>');
  const resource=await fetch(base+'/work/assets/app.js?version=2',{headers});assert.equal(resource.status,200);assert.equal(await resource.text(),'export const mounted = true;');
  const head=await fetch(base+'/work/assets/app.js',{method:'HEAD',headers});assert.equal(head.status,200);assert.equal(await head.text(),'');
  for(const pathname of ['/','/api/workbench-projects','/assets/app.js','/work-other/','/work/api/unknown'])assert.equal((await fetch(base+pathname,{headers})).status,404);
  assert.equal((await fetch(base+'/work/api/workbench-projects',{headers:{...headers,Origin:'https://other.invalid'}})).status,403);
  const request={method:'POST',headers:{...headers,Origin:base,'Content-Type':'application/json','X-Workbench-Request':'project-store'},body:JSON.stringify({expectedRevision:0,data:{mode:'blank',parameters:{project_name:'子路径回归项目'}}})};
  const saved=await fetch(endpoint,request);assert.equal(saved.status,200);assert.equal((await saved.json()).record.revision,1);
  const loaded=await fetch(endpoint+'?check=1',{headers});assert.equal(loaded.status,200);const record=(await loaded.json()).record;
  assert.equal(record.projectId,id);assert.equal(record.data.parameters.project_name,'子路径回归项目');
  const list=await fetch(base+'/work/api/workbench-projects',{headers});assert.equal(list.status,200);assert.deepEqual((await list.json()).projects.map(p=>p.id),[id]);
  assert.equal((await fetch(endpoint,request)).status,409);
  assert.equal((await fetch(endpoint,{...request,headers:{...request.headers,Origin:'https://other.invalid'}})).status,403);
 }finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
