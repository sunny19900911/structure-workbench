import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {callServiceTool} from '../../../server/mcp-tools.mjs';
const data=fileURLToPath(new URL('../../../qa/parallel-review-20261109/integration',import.meta.url));
const origin='http://127.0.0.1:5450';
async function request(path,{method='GET',header,body,binary=false}={}){
 const headers={};if(header)headers['X-Workbench-Request']=header;
 if(body&&!(body instanceof Uint8Array)){headers['Content-Type']='application/json';body=JSON.stringify(body);}
 const r=await fetch(origin+path,{method,headers,body});
 if(!r.ok){const value=await r.json();throw Object.assign(Error(value.error),{code:value.code,status:r.status});}
 return binary?{bytes:Buffer.from(await r.arrayBuffer()),mime:r.headers.get('content-type')}:r.json();
}
test('未在浏览器打开的隔离项目：保存读取及Excel服务生成/下载可用，context和整套生成仍需要网页',async()=>{
 const health=await request('/api/portable/health');assert.equal(resolve(health.dataRoot),resolve(data));
 const projectId=randomUUID().replaceAll('-',''),unit='后台接口验收';
 await request('/api/workbench-projects/'+projectId+'/main',{method:'POST',header:'project-store',body:{expectedRevision:0,data:{parameters:{project_name:'MCP无网页依赖核查'},parameterVersion:1,mode:'blank'}}});
 assert.ok(!(await request('/api/mcp-browser/status')).clients.some(c=>c.projectId===projectId));
 const out=join(data,'mcp-audit-'+Date.now());await mkdir(out,{recursive:true});
 const client={request,artifact:async(bytes,name)=>{const path=join(out,name);await writeFile(path,bytes);return {path,size:bytes.length};}};
 const saved=await callServiceTool(client,'workbench_project_read',{projectId,part:'main',view:'full'});assert.equal(saved.revisions.main,1);
 const {document}=await request('/api/office-documents/'+projectId+'/generate-xlsx',{method:'POST',header:'office-documents',body:{title:'后台生成验证',unit,sourceParameterVersion:1,parameters:[{name:'测试值',value:'5',source:'合成QA'}],tables:[]}});
 const listed=await callServiceTool(client,'workbench_office_list',{projectId,unit});assert.equal(listed.documents.length,1);
 const download=await callServiceTool(client,'workbench_office_download',{projectId,documentId:document.documentId});assert.ok(download.artifact.size>1000);
 const failures={};
 for(const operation of ['project_context','office_generate']){
  await assert.rejects(callServiceTool(client,'workbench_'+operation,{projectId,unit,args:{},expectedRevisions:{main:1}}),error=>{failures[operation]=error.code;return error.code==='BROWSER_REQUIRED';});
 }
 await writeFile(join(out,'results.json'),JSON.stringify({projectId,unit,readRevision:saved.revisions.main,serverGeneratedXlsx:document.documentId,downloadBytes:download.artifact.size,failures,scope:'调用真实MCP分派函数及HTTP服务；未启用STDIO客户端，未测试WorkBuddy/Kimi账户连接'},null,2));
 console.log('MCP依赖核查证据：'+out);
});
