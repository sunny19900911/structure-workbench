import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request as httpRequest} from 'node:http';
import {once} from 'node:events';
import {mkdtemp,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {homedir} from 'node:os';
import {Document,Packer,Paragraph} from 'docx';
import {officeDocumentApi} from '../../server/office-document-api.mjs';
import {createApplication} from '../../deploy/baota/http-app.mjs';
import {writePart} from '../../server/project-store.mjs';

const projectA='a'.repeat(32),projectB='b'.repeat(32);
const parent=resolve('qa/portable-release/mcp/office');
const python=process.env.WORKBENCH_PYTHON||join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
async function fixture(t,portable='1'){
  await mkdir(parent,{recursive:true});const directory=await mkdtemp(join(parent,'api-'));
  const env={WORKBENCH_PORTABLE:portable,WORKBENCH_PYTHON:python,WORKBENCH_PROJECT_STORE:join(directory,'projects')};
  await writePart(env.WORKBENCH_PROJECT_STORE,projectA,'main',{parameters:{project_name:'隔离工程甲'}},0);
  await writePart(env.WORKBENCH_PROJECT_STORE,projectB,'main',{parameters:{project_name:'隔离工程乙'}},0);
  const app=createApplication({publicDir:directory,localOnly:true,plugins:[officeDocumentApi(env)]});
  const server=createServer(app);server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolveClose=>{server.close(resolveClose);server.closeAllConnections();}));
  const url='http://127.0.0.1:'+server.address().port;
  const request=async(path,{method='GET',body,headers={}}={})=>{
    const result=await fetch(url+'/api/office-documents/'+path,{method,headers:{...(method==='POST'?{'x-workbench-request':'office-documents'}:{}),...headers},body});
    const buffer=Buffer.from(await result.arrayBuffer());
    return {status:result.status,headers:result.headers,buffer,json:result.headers.get('content-type')?.startsWith('application/json')?JSON.parse(buffer.toString()):null};
  };
  return {request,env,url};
}
const word=text=>Packer.toBuffer(new Document({sections:[{children:[new Paragraph(text)]}]}));
const importWord=(request,bytes,headers={})=>request(projectA+'?type=docx',{method:'POST',body:bytes,headers:{'x-file-name':encodeURIComponent('结构扩初说明'),'x-document-unit':encodeURIComponent('教学楼'),...headers}});

test('HTTP DOCX import, metadata, exact content, manual save, immutable history and conflicts',async t=>{
  const {request}=await fixture(t);const original=await word('工程甲初稿');
  const created=await importWord(request,original);
  assert.equal(created.status,201,JSON.stringify(created.json));
  const document=created.json.document,id=document.documentId;
  assert.equal(document.type,'docx');assert.equal(document.unit,'教学楼');assert.equal(document.fileRevision,1);
  const metadata=await request(projectA+'/'+id);assert.equal(metadata.status,200);assert.equal(metadata.json.document.sha256,document.sha256);
  const content=await request(projectA+'/'+id+'/content');assert.equal(content.status,200);assert.deepEqual(content.buffer,original);assert.equal(content.headers.get('x-document-revision'),'1');
  const changed=await word('工程甲人工改稿');
  const saved=await request(`${projectA}/${id}/save?expectedRevision=1`,{method:'POST',body:changed});
  assert.equal(saved.status,200,JSON.stringify(saved.json));assert.equal(saved.json.document.fileRevision,2);
  const stale=await request(`${projectA}/${id}/save?expectedRevision=1`,{method:'POST',body:original});assert.equal(stale.status,409);
  const history=await request(`${projectA}/${id}/history`);assert.equal(history.status,200);assert.equal(history.json.versions.length,2);
  const old=await request(`${projectA}/${id}/content?revision=1`);assert.deepEqual(old.buffer,original);
  const current=await request(`${projectA}/${id}/content`);assert.deepEqual(current.buffer,changed);
  const noVersion=await request(`${projectA}/${id}/save`,{method:'POST',body:original});assert.equal(noVersion.status,400);
  const badBytes=await request(`${projectA}/${id}/save?expectedRevision=2`,{method:'POST',body:Buffer.from('damaged file')});assert.equal(badBytes.status,422);
  assert.equal((await request(`${projectA}/${id}`)).json.document.fileRevision,2);
});

test('HTTP XLSX generation reads exact current inputs, command edit changes native file and refuses stale target',async t=>{
  const {request}=await fixture(t);
  const generated=await request(projectA+'/generate-xlsx',{method:'POST',body:JSON.stringify({unit:'教学楼',title:'工程甲参数',sourceParameterVersion:7,batchId:'qa-batch-1',parameters:[{name:'场地',value:'昆明市'}],tables:[{name:'当前单体',rows:[['名称','高度'],['教学楼','23.7']]}]})});
  assert.equal(generated.status,201,JSON.stringify(generated.json));const id=generated.json.document.documentId;
  assert.equal(generated.json.document.origin,'generated');assert.equal(generated.json.document.sourceParameterVersion,7);
  const view=await request(`${projectA}/${id}/view`);assert.equal(view.status,200);assert.equal(view.json.view.type,'xlsx');
  assert.equal(view.json.view.sheets.find(s=>s.name==='当前单体').cells.find(c=>c.address==='B2').text,'23.7');
  const command={op:'cell.set',sheet:'当前单体',address:'B2',expectedText:'23.7',text:'24.5'};
  const result=await request(`${projectA}/${id}/command`,{method:'POST',body:JSON.stringify({expectedRevision:1,command})});
  assert.equal(result.status,200,JSON.stringify(result.json));assert.equal(result.json.document.fileRevision,2);
  assert.equal((await request(`${projectA}/${id}/view`)).json.view.sheets.find(s=>s.name==='当前单体').cells.find(c=>c.address==='B2').text,'24.5');
  const staleRevision=await request(`${projectA}/${id}/command`,{method:'POST',body:JSON.stringify({expectedRevision:1,command})});assert.equal(staleRevision.status,409);
  const staleText=await request(`${projectA}/${id}/command`,{method:'POST',body:JSON.stringify({expectedRevision:2,command})});assert.equal(staleText.status,409);
  assert.equal((await request(`${projectA}/${id}/history`)).json.versions.length,2);
});

test('HTTP project and unit isolation, missing project and deleted lifecycle',async t=>{
  const {request,env}=await fixture(t);const a=await importWord(request,await word('工程甲资料'));assert.equal(a.status,201);const id=a.json.document.documentId;
  const listA=await request(projectA);assert.equal(listA.json.documents.length,1);
  const listB=await request(projectB);assert.equal(listB.json.documents.length,0);
  assert.equal((await request(`${projectA}?unit=${encodeURIComponent('教学楼')}`)).json.documents.length,1);
  assert.equal((await request(`${projectA}?unit=${encodeURIComponent('宿舍楼')}`)).json.documents.length,0);
  assert.equal((await request(`${projectB}/${id}/content`)).status,404);
  assert.equal((await request('c'.repeat(32))).status,404);
  await writePart(env.WORKBENCH_PROJECT_STORE,projectA,'lifecycle',{deleted:true},0);
  assert.equal((await request(`${projectA}/${id}/content`)).status,410);
  assert.equal((await request(projectA)).status,410);
});

test('HTTP local-only and mutation headers enforce access before data processing',async t=>{
  const {request,url}=await fixture(t);const bytes=await word('来源检查');
  const wrongOrigin=await importWord(request,bytes,{origin:'https://unrelated.invalid'});assert.equal(wrongOrigin.status,403);
  const noHeader=await importWord(request,bytes,{'x-workbench-request':''});assert.equal(noHeader.status,403);
  const crossSite=await request(projectA,{headers:{'sec-fetch-site':'cross-site'}});assert.equal(crossSite.status,403);
  const wrongHost=await new Promise((resolveStatus,reject)=>{
    const req=httpRequest(url+'/api/office-documents/'+projectA,{headers:{host:'example.invalid'}},res=>{res.resume();res.on('end',()=>resolveStatus(res.statusCode));});req.on('error',reject);req.end();
  });assert.equal(wrongHost,403);
  const method=await request(projectA,{method:'DELETE'});assert.equal(method.status,405);
  const disabled=await fixture(t,'0');assert.equal((await disabled.request(projectA)).status,404);
  assert.equal((await request(projectA)).json.documents.length,0);
});
