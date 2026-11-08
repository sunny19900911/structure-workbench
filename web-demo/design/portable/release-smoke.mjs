// Live HTTP acceptance against an already-running, isolated portable release.
// Never launches Office or uses a production project store.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {reportTable} from '../../reference-report.js';

const run=promisify(execFile);
const root=fileURLToPath(new URL('../../',import.meta.url));
const base=new URL(process.argv[2]||'http://127.0.0.1:58731');
if(!['127.0.0.1','localhost','[::1]'].includes(base.hostname)||base.protocol!=='http:')throw Error('Smoke test only permits a local HTTP service.');
const qa=resolve(root,'qa'),folder=join(qa,'portable-release','http-smoke-'+new Date().toISOString().replace(/[:.]/g,'-'));
const python=process.env.WORKBENCH_SMOKE_PYTHON;
if(!python)throw Error('Set WORKBENCH_SMOKE_PYTHON to the document Python used for independent artifact verification.');
const result={base:base.origin,startedAt:new Date().toISOString(),checks:[],limitations:['No Word COM/PDF rendering was launched.','HTTP acceptance does not replace visual browser interaction or other Office-version tests.']};
async function request(path,{body,headers={},method=body===undefined?'GET':'POST',timeout=60000}={}){
 return fetch(new URL(path,base),{method,headers,body:typeof body==='object'&&!Buffer.isBuffer(body)?JSON.stringify(body):body,signal:AbortSignal.timeout(timeout)});
}
async function json(path,body,kind){
 const response=await request(path,{body,headers:{'Content-Type':'application/json',...(kind?{'X-Workbench-Request':kind}:{})}});
 const value=await response.json();assert.ok(response.ok,path+' '+response.status+' '+JSON.stringify(value));return value;
}
async function binary(path,body,kind,file){
 const response=await request(path,{body,headers:{'Content-Type':'application/json',...(kind?{'X-Workbench-Request':kind}:{})},timeout:180000});
 if(!response.ok)throw Error(path+' '+response.status+' '+await response.text());
 const data=Buffer.from(await response.arrayBuffer());assert.ok(data.length>100,path+' empty output');await writeFile(join(folder,file),data);return data;
}
async function check(name,fn){
 try{const details=await fn();result.checks.push({name,passed:true,...(details?{details}:{})});console.log('PASS '+name);}
 catch(error){result.checks.push({name,passed:false,error:error.message});console.log('FAIL '+name+' '+error.message);}
 await writeFile(join(folder,'result.json'),JSON.stringify(result,null,2));
}

const health=await json('/api/portable/health');
assert.equal(health.app,'structure-workbench-portable');assert.equal(health.local,true);
const store=resolve(health.dataRoot),storeRelative=relative(qa,store);
assert.ok(storeRelative&&!storeRelative.startsWith('..')&&!isAbsolute(storeRelative),'Refusing a store outside this workspace QA directory: '+store);
assert.ok(store.replaceAll('\\','/').includes('/qa/portable-release/'),'Expected isolated portable-release store.');
await mkdir(folder,{recursive:true});result.health=health;result.output=folder;
const projectId=randomUUID().replaceAll('-',''),batch=randomUUID().replaceAll('-','');result.projectId=projectId;
await json('/api/workbench-projects/'+projectId+'/main',{expectedRevision:0,data:{parameters:{project_name:'QA portable HTTP '+projectId.slice(0,8)},mode:'blank',calculation:{sections:[]}}},'project-store');

await check('actual format: Word / Excel / PowerPoint / PDF',async()=>{
 const found=[];
 for(const [ext,family]of [['docx','word'],['xlsx','excel'],['pptx','powerpoint'],['pdf','pdf']]){
  const name='format-smoke.'+ext,response=await request('/api/portable/formats',{body:await readFile(join(qa,'portable-formats',name)),headers:{'X-Workbench-Request':'portable-formats','X-File-Name':encodeURIComponent(name)}}),payload=await response.json();
  assert.equal(response.status,200,JSON.stringify(payload));assert.equal(payload.detected.family,family);assert.equal(payload.detected.format,ext);found.push(payload.detected);
 }
 return found;
});
await check('renamed Office and truncated PDF rejected',async()=>{
 const renamed=await request('/api/portable/formats',{body:await readFile(join(qa,'portable-formats/format-smoke.xlsx')),headers:{'X-Workbench-Request':'portable-formats','X-File-Name':'wrong.docx'}});
 assert.equal(renamed.status,422);assert.equal((await renamed.json()).code,'FORMAT_MISMATCH');
 const bad=await request('/api/portable/formats',{body:Buffer.from('%PDF-1.7\nunfinished'),headers:{'X-Workbench-Request':'portable-formats','X-File-Name':'bad.pdf'}});assert.equal(bad.status,422);
});
await check('Word source numbers and table round-trip',async()=>{
 const response=await request('/api/intake/read-word',{body:await readFile(join(qa,'portable-formats/format-smoke.docx')),headers:{'X-Workbench-Request':'intake','X-File-Name':'format-smoke.docx','X-Word-Format':'docx'}}),payload=await response.json();
 assert.equal(response.status,200,JSON.stringify(payload));assert.equal(payload.paras[0],'QA source: Height 23.70 m; Floors 5; Area 1234.56 m2.');assert.equal(payload.tables[0][1][1],'23.70 m');return {paragraphs:payload.paras.length,tables:payload.tables.length,warnings:payload.warnings};
});

await check('measures DOCX generated without Office',async()=>{
 const html='<h1>QA unified measures</h1><p>Height 23.70 m; area 1234.56 m2; elevation -1.250 m.</p><table><tr><th rowspan="2">Unit</th><th colspan="2">Parameters</th></tr><tr><th>Height</th><th>Area</th></tr><tr><td>QA A</td><td>23.70</td><td>1234.56</td></tr></table>';
 const bytes=await binary('/api/expansion/document',{kind:'measures',format:'docx',html},'expansion','measures.docx');assert.equal(bytes.subarray(0,2).toString(),'PK');return {bytes:bytes.length};
});
await check('native expansion DOCX generated without Office',async()=>{
 const state={parameters:{},document:{units:[{name:'QA A',floors:'5',area:'1234.56',planningHeight:'23.70'}]},regulations:[]};
 const template={version:1,blocks:[{kind:'title',text:'QA expansion'},{kind:'p',text:'Height 23.70 m; area 1234.56 m2; elevation -1.250 m.'},reportTable(state,'units')]};
 await writeFile(join(folder,'native-spec.json'),JSON.stringify(template,null,2));
 const bytes=await binary('/api/expansion/document',{kind:'expansion',format:'docx',template},'expansion','expansion.docx');assert.equal(bytes.subarray(0,2).toString(),'PK');return {bytes:bytes.length};
});
await check('calculation Word cover/catalog without historical seals',async()=>{
 const status=await json('/api/calculation-book/status?project='+projectId);assert.equal(status.ready,true);
 const bytes=await binary('/api/calculation-book/export',{confirmed:true,project_id:projectId,project_name:'QA Calculation 23.70 1234.56 -1.250',sections:[{title:'QA catalog',items:['QA Height 23.70 m','QA area 1234.56 m2','QA elevation -1.250 m']},{title:'QA upper structure',items:['QA check']}],out_files:[],excel_blocks:[]},null,'calculation.docx');
 assert.equal(bytes.subarray(0,2).toString(),'PK');return {bytes:bytes.length};
});

const pdfRoot=join(qa,'calculation-release','盈建科模型');
const sources=['荷载校核图形/1.pdf','单体一/计算书/上部/2.pdf','单体一/计算书/基础/3.pdf','单体一/计算书/施工图/4.pdf'];
await writeFile(join(folder,'pdf-sources.json'),JSON.stringify(sources.map(path=>join(pdfRoot,path)),null,2));
await check('PDF folder upload, scan, preview and ordered merge',async()=>{
 let uploaded;
 // Deliberately upload in reverse order; the scan must recover group order.
 for(const path of [...sources].reverse()){
  const response=await request('/api/calculation-pdfs/upload?'+new URLSearchParams({project:projectId,batch,path}),{body:await readFile(join(pdfRoot,path)),headers:{'X-Workbench-Request':'calculation-pdfs'}});
  uploaded=await response.json();assert.equal(response.status,200,JSON.stringify(uploaded));
 }
 const scan=await json('/api/calculation-pdfs/scan',{path:uploaded.root},'calculation-pdfs');assert.equal(scan.files.length,4);assert.deepEqual(scan.files.map(x=>x.group),['荷载校核','上部','基础','施工图']);assert.ok(scan.files.every(x=>x.pages===1));
 for(const i of [0,1,3]){
  const preview=await request('/api/calculation-pdfs/page?'+new URLSearchParams({id:scan.files[i].id,page:'1'}));assert.equal(preview.status,200);const png=Buffer.from(await preview.arrayBuffer());assert.equal(png.subarray(1,4).toString(),'PNG');await writeFile(join(folder,'source-'+(i+1)+'.png'),png);
 }
 const merged=await binary('/api/calculation-pdfs/export',{ids:scan.files.map(x=>x.id)},'calculation-pdfs','merged.pdf');assert.equal(merged.subarray(0,5).toString(),'%PDF-');
 await json('/api/workbench-projects/'+projectId+'/main',{expectedRevision:1,data:{parameters:{project_name:'QA portable HTTP '+projectId.slice(0,8)},mode:'blank',calculation:{pdfSources:{root:uploaded.root,files:scan.files}}}},'project-store');
 return {files:scan.files.map(({name,pages,group})=>({name,pages,group})),bytes:merged.length};
});
await check('independent DOCX / PDF artifact inspection',async()=>{
 const {stdout}=await run(python,[fileURLToPath(new URL('./release-smoke-verify.py',import.meta.url)),folder],{timeout:60000,maxBuffer:1024*1024,windowsHide:true});
 const inspected=JSON.parse(stdout);assert.equal(inspected.passed,true,JSON.stringify(inspected));await writeFile(join(folder,'artifact-verification.json'),JSON.stringify(inspected,null,2));return inspected;
});
result.finishedAt=new Date().toISOString();result.passed=result.checks.every(x=>x.passed);await writeFile(join(folder,'result.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({passed:result.passed,checks:result.checks.length,failed:result.checks.filter(x=>!x.passed),output:folder,projectId},null,2));
if(!result.passed)process.exitCode=1;
