import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {open,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readService,verifyService} from '../../deploy/portable/portable-service-lock.mjs';
import {RELEASE} from '../../deploy/portable/runtime.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),qa=join(root,'qa/portable-release/blackbox'),data=join(qa,'runtime');
const current=await readService(data);assert.ok(current?.url);await verifyService(current,data,RELEASE);
const before=await(await fetch(current.url+'/api/launcher/status')).json();assert.equal(resolve(before.dataRoot),resolve(data));
const previous=JSON.parse(await readFile(join(qa,'browser-result.json'),'utf8')),bytes=await readFile(previous.artifact.path);
const result=await fetch(current.url+'/api/launcher/stop',{method:'POST',headers:{'content-type':'application/json','x-workbench-request':'launcher'},body:JSON.stringify({instanceId:current.instanceId})});assert.equal(result.status,200,await result.text());
console.log('QA stop accepted');
async function probe(){try{return await readService(data);}catch(e){if(e.code==='SERVICE_UNRESPONSIVE')return {starting:true};throw e;}}
for(let i=0;i<50&&await probe();i++)await new Promise(r=>setTimeout(r,100));assert.equal(await probe(),null);
const env={...process.env,WORKBENCH_PORTABLE_DATA:data,WORKBENCH_SOURCE_MODE:'1',WORKBENCH_SOURCE_RUNTIME:join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies')};
const children=[];
for(let i=0;i<2;i++){const log=await open(join(qa,'restart-'+i+'.log'),'a'),child=spawn(process.execPath,[join(root,'deploy/portable/start.mjs'),'--port','5460'],{cwd:root,env,stdio:['ignore',log.fd,log.fd],windowsHide:true,detached:true});children.push(child);child.unref();await log.close();}
let after;for(let i=0;i<150;i++){const info=await probe();if(info?.url){after=info;break;}await new Promise(r=>setTimeout(r,200));}assert.ok(after?.url);assert.notEqual(after.instanceId,current.instanceId);await verifyService(after,data,RELEASE);
const status=await(await fetch(after.url+'/api/launcher/status')).json();assert.equal(status.selected.projectId,before.selected.projectId);assert.equal(status.updateAvailable,false);assert.deepEqual(await readFile(previous.artifact.path),bytes);
for(let i=0;i<50&&children.filter(c=>c.exitCode===null).length>1;i++)await new Promise(r=>setTimeout(r,100));assert.equal(children.filter(c=>c.exitCode===null).length,1);assert.equal(children.find(c=>c.exitCode!==null).exitCode,0);
const report={before:{instanceId:before.instanceId,updateAvailable:before.updateAvailable},after:{instanceId:status.instanceId,updateAvailable:status.updateAvailable},projectId:status.selected.projectId,checks:['退出仅关闭已核验QA实例','两次并发源码启动复用一个实例','重启后旧项目ID及原成果字节保持','运行指纹与当前源码一致','新工具仍可发现'],toolCount:status.manifest.count};
await writeFile(join(qa,'lifecycle-result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
