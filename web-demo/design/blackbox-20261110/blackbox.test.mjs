import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,symlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {bindProjectFolder,scanProjectFolder,writeProjectArtifact} from '../../server/project-folders.mjs';
import {readPart,writePart} from '../../server/project-store.mjs';
import {createManager} from '../../deploy/blackbox/manager.mjs';
import {createBrowserBridge} from '../../server/mcp-browser-bridge.mjs';
import {createApplication} from '../../deploy/baota/http-app.mjs';
import {sourceIdentity} from '../../deploy/blackbox/identity.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
async function setup(){const parent=join(root,'qa/portable-release/blackbox/tests');await mkdir(parent,{recursive:true});const data=await mkdtemp(join(parent,'case-')),input=join(data,'工程输入 中文');await mkdir(input);return {paths:{appRoot:root,data,projects:join(data,'projects')},input};}
test('地勘读取器单独更新也改变后台版本指纹',async()=>{
 const {paths}=await setup(),folder=join(paths.data,'design/parallel-review-20261109/geotech/pdf');await mkdir(folder,{recursive:true});
 await writeFile(join(folder,'reader.py'),'version one');const before=await sourceIdentity(paths.data);
 await writeFile(join(folder,'reader.py'),'version two');assert.notEqual(await sourceIdentity(paths.data),before);
});
test('同目录稳定ID，重开保留人工数据，原件不变，成果按批次保留且不进入扫描',async()=>{
 const {paths,input}=await setup();await writeFile(join(input,'建筑.txt'),'原始建筑资料');await mkdir(join(input,'子目录'));await writeFile(join(input,'子目录','模型.OUT'),'原始模型');await writeFile(join(input,'api-key.txt'),'不可扫描');
 const first=await bindProjectFolder(paths,input),main=await readPart(paths.projects,first.projectId,'main');
 await writePart(paths.projects,first.projectId,'main',{...main.data,manual:'人工稿保留'},main.revision);
 const again=await bindProjectFolder(paths,join(input,'.'));assert.equal(first.projectId,again.projectId);assert.equal((await readPart(paths.projects,first.projectId,'main')).data.manual,'人工稿保留');
 const batchId='a'.repeat(32),one=await writeProjectArtifact(paths,Buffer.from('第一稿'),'扩初.docx','application/test',{projectId:first.projectId,batchId}),two=await writeProjectArtifact(paths,Buffer.from('第二稿'),'扩初.docx','application/test',{projectId:first.projectId,batchId});
 assert.notEqual(one.path,two.path);assert.equal(await readFile(one.path,'utf8'),'第一稿');assert.ok(one.path.startsWith(join(input,'工作台成果',batchId)));
 const scan=await scanProjectFolder(paths,first.projectId);assert.deepEqual(scan.files.map(f=>f.name).sort(),['建筑.txt','模型.OUT'].sort());assert.equal(await readFile(join(input,'建筑.txt'),'utf8'),'原始建筑资料');
 const legacy=await writeProjectArtifact(paths,Buffer.from('旧项目'),'旧成果.txt','text/plain',{projectId:'b'.repeat(32)});assert.ok(legacy.path.startsWith(join(paths.data,'exports','MCP')));
 const importedId='c'.repeat(32);await writePart(paths.projects,importedId,'folder-binding',(await readPart(paths.projects,first.projectId,'folder-binding')).data,0);
 const imported=await writeProjectArtifact(paths,Buffer.from('导入新项目'),'新成果.txt','text/plain',{projectId:importedId});assert.ok(imported.path.startsWith(join(paths.data,'exports','MCP')));
});
test('并发选择不生成重复ID；删除状态不被目录重开静默恢复',async()=>{
 const {paths,input}=await setup(),selected=await Promise.all([bindProjectFolder(paths,input),bindProjectFolder(paths,input)]);assert.equal(selected[0].projectId,selected[1].projectId);
 await writePart(paths.projects,selected[0].projectId,'lifecycle',{deleted:true},0);await assert.rejects(bindProjectFolder(paths,input),/已删除/);
});
test('拒绝成果目录作为输入，拒绝成果重定向，扫描不跟随目录链接',async()=>{
 const {paths,input}=await setup(),outside=join(paths.data,'outside');await mkdir(outside);await writeFile(join(outside,'不应扫描.txt'),'outside');await symlink(outside,join(input,'链接'),process.platform==='win32'?'junction':'dir');
 const selected=await bindProjectFolder(paths,input);assert.equal((await scanProjectFolder(paths,selected.projectId)).files.length,0);await assert.rejects(bindProjectFolder(paths,join(input,'工作台成果')),/不能选择/);
 const redirected=join(paths.data,'另一个工程');await mkdir(redirected);await symlink(outside,join(redirected,'工作台成果'),process.platform==='win32'?'junction':'dir');await assert.rejects(bindProjectFolder(paths,redirected),/链接|重定向/);
});
test('管理接口拒绝跨源、错误实例、活跃页面及任务；只退出本实例',async t=>{
 const {paths,input}=await setup();let now=Date.now(),stopped=0,active=1;const bridge=createBrowserBridge({now:()=>now});
 const manager=createManager({paths,instanceId:'own-instance',version:'QA',bridge,identity:await sourceIdentity(root),stop:()=>stopped++,activeRequests:()=>active,openExternal:async()=>{}});
 const server=createServer(createApplication({publicDir:root,localOnly:true,plugins:[manager.plugin]}));await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{bridge.close();server.close();server.closeAllConnections();});const base='http://127.0.0.1:'+server.address().port;
 async function post(path,body,headers={}){return fetch(base+'/api/launcher/'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Workbench-Request':'launcher',...headers},body:JSON.stringify(body)});}
 assert.equal((await post('select',{path:input},{origin:'https://example.org'})).status,403);
 assert.equal((await post('select',{path:input})).status,200);
 for(const client of ['kimi','workbuddy']){const response=await post('connect',{client});assert.equal(response.status,200);const result=await response.json(),config=JSON.parse(result.text).mcpServers['structure-workbench'];assert.equal(client==='kimi'?config.toolTimeoutMs:config.timeout,450000);assert.match(result.note,/实际验证/);}
 assert.equal((await post('stop',{instanceId:'other-instance'})).status,409);assert.equal(stopped,0);
 bridge.register({projectId:'a'.repeat(32)});assert.equal((await post('stop',{instanceId:'own-instance'})).status,409);
 now+=120001;active=2;assert.equal((await post('stop',{instanceId:'own-instance'})).status,409);active=1;
 const state=await(await fetch(base+'/api/launcher/status')).json();assert.equal(state.selected.inputPath,input);assert.ok(state.manifest.names.includes('workbench_expansion_subsection_edit'));assert.ok(state.manifest.names.includes('workbench_project_folder'));
 assert.equal((await post('stop',{instanceId:'own-instance'})).status,200);await new Promise(r=>setImmediate(r));assert.equal(stopped,1);
 assert.equal((await post('select',{path:input})).status,503);
});
