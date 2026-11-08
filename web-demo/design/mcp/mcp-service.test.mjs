import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile,stat} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createWorkbenchMCP,MCP_VERSION} from '../../server/mcp-server.mjs';
import {createLocalClient,localURL,sourceFile} from '../../server/mcp-local-client.mjs';
import {RELEASE} from '../../deploy/portable/runtime.mjs';

const projectId='1234567890abcdef1234567890abcdef';
const root=fileURLToPath(new URL('../../qa/portable-release/mcp/',import.meta.url));
const text=result=>JSON.parse(result.content.find(c=>c.type==='text').text);
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const browserEnvelope=result=>({ok:true,result:{result,context:{projectId,unit:'教学楼',expectedRevisions:{main:4}}}});

async function folder(){await mkdir(root,{recursive:true});return mkdtemp(join(root,'服务 中文 '));}
async function linked(t,handler=async()=>({ok:true})){
 const calls=[],artifacts=[];
 const local={
  request:async(path,options)=>{calls.push({path,options});return handler(path,options);},
  artifact:async(bytes,filename,mime)=>{artifacts.push({bytes,filename,mime});return {path:'fixture://'+filename,filename,mime,bytes:bytes.length};},
  openBrowser:async id=>({projectId:id,opened:false,url:'http://127.0.0.1:58720'})
 };
 const server=createWorkbenchMCP({client:local}),client=new Client({name:'mcp-verification',version:'1.0.0'}),[clientSide,serverSide]=InMemoryTransport.createLinkedPair();
 await Promise.all([server.connect(serverSide),client.connect(clientSide)]);
 t.after(async()=>{await client.close();await server.close();});
 return {client,calls,artifacts};
}

test('SDK initialize/list 可发现业务工具、工程资源和提示词，无系统执行接口',async t=>{
 const {client,calls}=await linked(t);
 assert.equal(client.getServerVersion().name,'structure-workbench');assert.equal(client.getServerVersion().version,MCP_VERSION);
 assert.match(client.getInstructions(),/人工稿保留/);
 const {tools}=await client.listTools();
 for(const name of ['workbench_status','workbench_project_context','workbench_document_import','workbench_measures_update','workbench_ppt_export','workbench_engineering_check','workbench_seismic_lookup'])assert.ok(tools.some(tool=>tool.name===name),name);
 assert.equal(new Set(tools.map(tool=>tool.name)).size,tools.length);
 assert.ok(tools.every(tool=>tool.inputSchema.type==='object'&&tool.inputSchema.additionalProperties===false));
 assert.ok(!tools.some(tool=>/shell|exec_command|read_key|credential|javascript_eval/.test(tool.name)));
 const resources=await client.listResources();assert.ok(resources.resources.some(r=>r.uri==='workbench://engineering/workflow'));
 const prompts=await client.listPrompts();assert.ok(prompts.prompts.some(p=>p.name==='workbench_preliminary_design'));
 assert.equal(calls.length,0,'initialize/catalogue 不访问真实项目');
});

test('SDK resources/read 与 prompts/get 返回真实工程流程及明确项目上下文',async t=>{
 const {client}=await linked(t);
 const result=await client.readResource({uri:'workbench://engineering/workflow'});
 assert.match(result.contents[0].text,/source_id/);assert.match(result.contents[0].text,/不虚构|不可照搬|不臆定/);
 const prompt=await client.getPrompt({name:'workbench_preliminary_design',arguments:{projectId,unit:'教学楼'}});
 assert.match(prompt.messages[0].content.text,new RegExp(projectId));assert.match(prompt.messages[0].content.text,/教学楼/);
 await assert.rejects(client.readResource({uri:'file:///never-read.env'}));
 await assert.rejects(client.getPrompt({name:'workbench_preliminary_design',arguments:{projectId:'wrong',unit:'教学楼'}}));
});

test('输入 schema 拒绝错误项目ID、额外字段和无revision写入，不调用业务服务',async t=>{
 const {client,calls}=await linked(t);
 for(const input of [
  {name:'workbench_project_read',arguments:{projectId:'../../outside'}},
  {name:'workbench_status',arguments:{secret:'not-allowed'}},
  {name:'workbench_measures_update',arguments:{projectId,args:{values:{intensity:8}}}},
  {name:'workbench_measures_update',arguments:{projectId,expectedRevisions:{main:-1},args:{values:{intensity:8}}}}
 ]){const result=await client.callTool(input);assert.equal(result.isError,true);assert.equal(text(result).code,'INVALID_ARGUMENTS');}
 assert.equal(calls.length,0);
 await assert.rejects(client.callTool({name:'workbench_unknown',arguments:{}}),error=>error.code===-32602);
});

test('项目读取返回原revision，摘要缩短附件，409不会重试或伪报成功',async t=>{
 let reject=false;
 const record={revision:7,data:{parameters:{project_name:'合成项目'},image:'data:image/png;base64,AAAA'}};
 const {client,calls}=await linked(t,async()=>{if(reject)throw Object.assign(Error('修订冲突'),{code:'REVISION_CONFLICT',status:409});return {record};});
 const result=text(await client.callTool({name:'workbench_project_read',arguments:{projectId,part:'main'}}));
 assert.equal(result.revisions.main,7);assert.match(result.text,/附件内容省略/);assert.ok(!result.text.includes('AAAA'));
 reject=true;
 const failed=await client.callTool({name:'workbench_project_read',arguments:{projectId,part:'main'}});
 assert.equal(failed.isError,true);assert.equal(text(failed).code,'REVISION_CONFLICT');assert.equal(text(failed).status,409);assert.equal(calls.length,2);
});

test('浏览器工具透传项目、单体、revision和业务参数',async t=>{
 const {client,calls}=await linked(t,async()=>browserEnvelope({saved:true}));
 const expectedRevisions={main:4,intake:6,expansion:3,modules:0,ppt:2};
 const result=await client.callTool({name:'workbench_measures_update',arguments:{projectId,unit:'教学楼',expectedRevisions,args:{values:{wind:0.3}}}});
 assert.deepEqual(text(result).result,{saved:true});assert.equal(text(result).context.expectedRevisions.main,4);assert.equal(calls[0].path,'/api/mcp-browser/execute');
 assert.equal(calls[0].options.header,'mcp-browser');
 assert.deepEqual(calls[0].options.body,{projectId,unit:'教学楼',expectedRevisions,operation:'measures.update',args:{values:{wind:0.3}},timeoutMs:180000});
});

test('文档导入发送选定文件副本，保留原件和来源文件名',async t=>{
 const dir=await folder(),path=join(dir,'建筑 说明.docx'),bytes=Buffer.from('synthetic source bytes');await writeFile(path,bytes);
 const before=await stat(path),{client,calls}=await linked(t,async()=>browserEnvelope({imported:1}));
 await client.callTool({name:'workbench_document_import',arguments:{projectId,unit:'教学楼',expectedRevisions:{main:2},args:{slot:'bldg',filePaths:[path]}}});
 const input=calls[0].options.body.args;assert.equal(input.slot,'bldg');assert.equal(input.files[0].name,'建筑 说明.docx');assert.deepEqual(Buffer.from(input.files[0].base64,'base64'),bytes);assert.ok(!('filePaths'in input));
 assert.deepEqual(await readFile(path),bytes);assert.equal((await stat(path)).mtimeMs,before.mtimeMs);
});

test('工程检查读取指定项目保存分区，查表缺高度口径不猜结果',async t=>{
 const {client,calls}=await linked(t,async()=>({records:{main:{projectId,revision:2,data:{parameters:{project_name:'合成项目'}}}}}));
 const result=text(await client.callTool({name:'workbench_engineering_check',arguments:{projectId,unit:'教学楼'}}));
 assert.equal(calls[0].path,'/api/workbench-projects/'+projectId);assert.equal(result.projectId,projectId);assert.equal(result.written,false);assert.equal(result.engineeringApproval,false);
 const grade=text(await client.callTool({name:'workbench_seismic_lookup',arguments:{config:{height:18,structure:'框架结构'}}}));
 assert.equal(grade.status,'incomplete');assert.equal(grade.frame,'');assert.equal(grade.written,false);assert.equal(calls.length,1);
});

test('PDF页返回 MCP image，合并/PPT导出返回真实 artifact，而非虚构下载链接',async t=>{
 const png=Buffer.from([137,80,78,71]),pdf=Buffer.from('%PDF-1.7 synthetic'),pptx=Buffer.from('synthetic pptx');
 const {client,artifacts}=await linked(t,async path=>path.includes('/page?')?{bytes:png,mime:'image/png'}:path.endsWith('/export')?{bytes:pdf,mime:'application/pdf'}:browserEnvelope({base64:pptx.toString('base64'),filename:'教学楼.pptx',mime:'application/vnd.openxmlformats-officedocument.presentationml.presentation'}));
 const page=await client.callTool({name:'workbench_pdf_page',arguments:{id:'temporary-id',page:1}});
 assert.equal(page.content[0].type,'image');assert.equal(page.content[0].data,png.toString('base64'));
 const merged=text(await client.callTool({name:'workbench_pdf_merge',arguments:{ids:['first','second']}}));
 assert.equal(merged.artifact.bytes,pdf.length);assert.deepEqual(artifacts[0].bytes,pdf);
 const ppt=text(await client.callTool({name:'workbench_ppt_export',arguments:{projectId,unit:'教学楼',args:{}}}));
 assert.equal(ppt.draft,true);assert.equal(ppt.artifact.filename,'教学楼.pptx');assert.deepEqual(artifacts[1].bytes,pptx);
});

test('Word导出沿用网页规格再交给原有文档服务',async t=>{
 const {client,calls,artifacts}=await linked(t,async path=>path==='/api/mcp-browser/execute'?browserEnvelope({html:'<p>合成说明</p>',kind:'expansion',template:{type:'fixture'}}):{bytes:Buffer.from('fixture docx'),mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
 const result=text(await client.callTool({name:'workbench_export_document',arguments:{projectId,unit:'教学楼',kind:'expansion',format:'docx'}}));
 assert.equal(calls[0].options.body.operation,'document.package');assert.equal(calls[1].path,'/api/expansion/document');
 assert.deepEqual(calls[1].options.body,{html:'<p>合成说明</p>',kind:'expansion',template:{type:'fixture'},format:'docx'});
 assert.equal(result.draft,true);assert.equal(artifacts[0].filename,'结构初步设计说明.docx');
});

test('Excel母件导入保留portable-assets revision，文件字节按原件发送',async t=>{
 const dir=await folder(),path=join(dir,'计算母件.xlsx'),bytes=Buffer.from('synthetic excel');await writeFile(path,bytes);
 const {client,calls}=await linked(t,async()=>({revision:9}));
 const result=text(await client.callTool({name:'workbench_calculation_source_import',arguments:{projectId,slot:'jump-column',expectedRevision:8,filePath:path}}));
 const url=new URL(calls[0].path,'http://127.0.0.1');assert.equal(url.searchParams.get('project'),projectId);assert.equal(url.searchParams.get('revision'),'8');assert.equal(url.searchParams.get('slot'),'jump-column');
 assert.deepEqual(calls[0].options.body,bytes);assert.equal(result.revision,9);
});

test('读母件清单与改计算书目录工具名称独立，Word计算书实际经过原导出接口',async t=>{
 const payload={project_id:projectId,confirmed:true,sections:[{title:'计算书目录',items:['合成内容']}],excel_blocks:[]};
 const {client,calls,artifacts}=await linked(t,async path=>path.includes('/status?')?{workbooks:[]}:
  path==='/api/mcp-browser/execute'?browserEnvelope(payload):{bytes:Buffer.from('synthetic calculation docx'),mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
 await client.callTool({name:'workbench_calculation_sources',arguments:{projectId}});
 assert.ok(calls[0].path.startsWith('/api/calculation-book/status?'));assert.equal(calls.length,1);
 const invalid=await client.callTool({name:'workbench_calculation_export',arguments:{projectId,confirmed:false}});assert.equal(invalid.isError,true);assert.equal(calls.length,1);
 const result=text(await client.callTool({name:'workbench_calculation_export',arguments:{projectId,confirmed:true}}));
 assert.equal(calls[1].options.body.operation,'calculation.package');assert.equal(calls[2].path,'/api/calculation-book/export');assert.deepEqual(calls[2].options.body,payload);
 assert.equal(result.artifact.filename,'结构计算书.docx');assert.equal(artifacts.length,1);
});

test('项目包导出保留附件警告，导入仅发送选定包副本不指定覆盖ID',async t=>{
 const dir=await folder(),file=join(dir,'合成项目.workbench.zip'),bytes=Buffer.from('synthetic archive');await writeFile(file,bytes);
 const warnings=['合成缺少附件提醒'];
 const {client,calls,artifacts}=await linked(t,async path=>path.startsWith('/api/portable-projects/export')?{bytes,mime:'application/zip',warnings:encodeURIComponent(JSON.stringify(warnings))}:{projectId:'abcdef1234567890abcdef1234567890'});
 const backup=text(await client.callTool({name:'workbench_project_backup',arguments:{projectId}}));assert.deepEqual(backup.warnings,warnings);assert.deepEqual(artifacts[0].bytes,bytes);
 const imported=text(await client.callTool({name:'workbench_project_import',arguments:{filePath:file}}));assert.notEqual(imported.projectId,projectId);
 assert.equal(calls[1].path,'/api/portable-projects/import');assert.equal(calls[1].options.header,'portable-projects');assert.deepEqual(calls[1].options.body,bytes);assert.deepEqual(await readFile(file),bytes);
});

test('本地URL拒绝远程、凭据、路径和非HTTP地址',()=>{
 assert.equal(localURL('http://127.0.0.1:58720'),'http://127.0.0.1:58720');
 for(const value of ['https://127.0.0.1:58720','http://example.com:58720','http://localhost:58720','http://127.0.0.1:58720/api','http://127.0.0.1:58720/?a=1','http://user:pass@127.0.0.1:58720','file:///tmp/data'])assert.throws(()=>localURL(value));
});

test('指定端口只有应用、版本、数据目录均匹配才连接，未知服务不误认',async()=>{
 const data=await folder(),base='http://127.0.0.1:58998';
 for(const health of [{app:'other-app',version:RELEASE,dataRoot:data},{app:'structure-workbench-portable',version:'old',dataRoot:data},{app:'structure-workbench-portable',version:RELEASE,dataRoot:data+'other'}]){
  const client=createLocalClient({env:{WORKBENCH_MCP_URL:base,WORKBENCH_PORTABLE_DATA:data},fetchImpl:async()=>json(health)});
  await assert.rejects(client.base(),error=>error.code==='SERVICE_MISMATCH');
 }
 const client=createLocalClient({env:{WORKBENCH_MCP_URL:base,WORKBENCH_PORTABLE_DATA:data},fetchImpl:async()=>json({app:'structure-workbench-portable',version:RELEASE,dataRoot:data})});
 assert.equal(await client.base(),base);
});

test('端口扫描选择同一用户匹配版本，旧版同库明确拒绝，不启动额外服务',async()=>{
 const data=await folder(),requests=[];
 const fetchImpl=async url=>{requests.push(url);return json(url.includes(':58723/')?{app:'structure-workbench-portable',version:RELEASE,dataRoot:data}:{app:'unrelated'});};
 const client=createLocalClient({env:{WORKBENCH_PORTABLE_DATA:data},fetchImpl});assert.equal(await client.base(),'http://127.0.0.1:58723');assert.equal(requests.length,20);
 const old=createLocalClient({env:{WORKBENCH_PORTABLE_DATA:data},fetchImpl:async url=>json(url.includes(':58724/')?{app:'structure-workbench-portable',version:'previous',dataRoot:data}:{app:'unrelated'})});
 await assert.rejects(old.base(),error=>error.code==='OLDER_SERVICE_RUNNING');
});

test('本机HTTP wrapper 保留业务请求头与冲突，拒绝重定向策略，不跟随未知地址',async()=>{
 const data=await folder(),base='http://127.0.0.1:58998',requests=[];
 const client=createLocalClient({env:{WORKBENCH_MCP_URL:base,WORKBENCH_PORTABLE_DATA:data},fetchImpl:async(url,options)=>{
  requests.push({url,options});if(url.endsWith('/health'))return json({app:'structure-workbench-portable',version:RELEASE,dataRoot:data});
  return json({error:'别处已修改'},409);
 }});
 await assert.rejects(client.request('/api/workbench-projects/'+projectId+'/main',{method:'POST',header:'project-store',body:{expectedRevision:4,data:{}}}),error=>error.code==='REVISION_CONFLICT'&&error.status===409);
 const request=requests.at(-1);assert.equal(request.options.redirect,'error');assert.equal(request.options.headers['x-workbench-request'],'project-store');assert.equal(JSON.parse(request.options.body).expectedRevision,4);
 await assert.rejects(client.request('https://example.com/api/test'),/接口路径无效/);
});

test('只读源文件只接受绝对工程文件路径，排除凭据、禁扫归档和过大文件',async()=>{
 const dir=await folder(),file=join(dir,'勘察报告.docx'),bytes=Buffer.from('read only fixture');await writeFile(file,bytes);
 const before=await stat(file),result=await sourceFile(file);assert.deepEqual(result.bytes,bytes);assert.equal(result.name,'勘察报告.docx');
 assert.equal((await stat(file)).mtimeMs,before.mtimeMs);await assert.rejects(sourceFile('relative.docx'),/绝对路径/);
 const credential=join(dir,'密码.txt');await writeFile(credential,'synthetic rejected fixture');await assert.rejects(sourceFile(credential),/凭据/);
 const archived=join(dir,'03_盈建科参数导出样本','wmass.out');await mkdir(join(archived,'..'),{recursive:true});await writeFile(archived,'synthetic archived fixture');await assert.rejects(sourceFile(archived),/归档禁用目录/);
 await assert.rejects(sourceFile(file,{maxBytes:2}),/大小限制/);
 const executable=join(dir,'file.exe');await writeFile(executable,'synthetic executable');await assert.rejects(sourceFile(executable),/工程资料/);
});

test('artifact只写隔离数据目录，文件名不能逃逸，重复生成保留旧输出且哈希对应实际内容',async()=>{
 const data=await folder(),client=createLocalClient({env:{WORKBENCH_PORTABLE_DATA:data},fetchImpl:async()=>{throw Error('artifact不需要联网');}}),bytes=Buffer.from('synthetic generated output');
 const first=await client.artifact(bytes,'../../结构计算书.pdf','application/pdf'),second=await client.artifact(bytes,'../../结构计算书.pdf','application/pdf');
 assert.ok(!relative(join(data,'exports','MCP'),first.path).startsWith('..'));assert.notEqual(first.path,second.path);
 assert.deepEqual(await readFile(first.path),bytes);assert.equal(first.sha256,createHash('sha256').update(bytes).digest('hex'));assert.equal(first.bytes,bytes.length);
});
