import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Readable} from 'node:stream';
import vm from 'node:vm';
import {officeDocumentApi} from '../../server/office-document-api.mjs';

const projectId='a'.repeat(32),unit='教学楼';
const source=await readFile(new URL('../../office-workbench.js',import.meta.url),'utf8');
const implementation=source.slice(source.indexOf(' async function generate(){'),source.indexOf(' async function run(action)'));
// Run the real orchestration function. Only its existing editor and persistence
// ports are replaced, to control asynchronous version changes and failed saves.
function fixture(options={}){
 const calls=[],notes=[],outputs=[],controls=[{disabled:false},{disabled:false}],main={inert:false},frame={inert:false};
 const snapshot={signed:options.signed||false,measuresVersion:options.measuresVersion??6,sections:{overview:{text:'工程师保留段落',manual:true}}};
 const W={id:projectId,parameterVersion:7,flush:async exclude=>{calls.push(['flush',exclude]);await options.flush?.();},setExporting:value=>calls.push(['exporting',value])};
 let readCount=0;
 const E={unit,capture:()=>structuredClone(snapshot),documentPackage:()=>({version:snapshot.measuresVersion,text:snapshot.sections.overview.text}),mcp:{
  generate:async()=>{calls.push(['sync-expansion']);snapshot.measuresVersion=W.parameterVersion;},
  read:()=>({tables:{units:{title:'单体信息',rows:[{values:['名称','高度']},{values:[unit,'23.7']}]}}})
 }};
 const ppt={read:()=>({projectId,unit,parameterVersion:++readCount<=(options.stalePptReads||0)?6:7}),export:async expected=>{calls.push(['ppt-export',expected]);return {blob:new Blob(['PPTX fixture']),projectId,unit,parameterVersion:options.exportVersion??7};}};
 const context={busy:false,opening:!!options.opening,commandPending:!!options.commandPending,W,E,frame,structuredClone,Blob,Date,setTimeout,
  crypto:{randomUUID:()=> '12345678-1234-1234-1234-123456789abc'},
  document:{querySelector:()=>main,querySelectorAll:()=>[]},dialog:{querySelectorAll:()=>controls},note:value=>notes.push(value),list:async()=>outputs,
  window:{WorkbenchModules:{mcp:{openPpt:async selected=>calls.push(['ppt-open',selected]),ppt}},WorkbenchLegacy:{params:()=>({project_name:'参数一致性验收',intensity:8})},
   WordDocumentView:{createBlob:async()=>{calls.push(['word-export']);await options.word?.(W,snapshot);return new Blob(['DOCX fixture']);}}},
  register:async(blob,type,title,identity)=>{calls.push(['register',type]);if(options.failRegister===type)throw Error('模拟登记失败');const record={type,title,projectId:identity.projectId,unit:identity.unit,batchId:identity.batchId,sourceParameterVersion:identity.version};outputs.push(record);return record;},
  api:async(path,request)=>{const spec=JSON.parse(request.body);calls.push(['xlsx-generate',spec]);const record={type:'xlsx',projectId,unit,batchId:spec.batchId,sourceParameterVersion:spec.sourceParameterVersion};outputs.push(record);return {document:record};}
 };
 vm.runInNewContext(implementation,context);return {generate:context.generate,context,calls,notes,outputs,snapshot,main,frame,controls,get readCount(){return readCount;}};
}

test('整套生成先同步非签发扩初、等待PPT目标版本，再保存同一批次同一参数版本三份文件',async()=>{
 const f=fixture({stalePptReads:2});const result=await f.generate();
 assert.equal(result.documents.length,3);assert.deepEqual(Array.from(result.documents,d=>d.sourceParameterVersion),[7,7,7]);
 assert.equal(new Set(result.documents.map(d=>d.batchId)).size,1);assert.equal(result.sourceParameterVersion,7);
 assert.equal(f.snapshot.sections.overview.text,'工程师保留段落');assert.equal(f.snapshot.sections.overview.manual,true);
 assert.equal(f.readCount,3);assert.deepEqual(f.calls.filter(c=>c[0]==='flush'),[['flush','office'],['flush','office']]);
 const pptExport=f.calls.findIndex(c=>c[0]==='ppt-export'),firstRegister=f.calls.findIndex(c=>c[0]==='register');assert.ok(pptExport<firstRegister);
 assert.deepEqual({...f.calls[pptExport][1]},{projectId,unit,parameterVersion:7});
 assert.equal(f.context.busy,false);assert.equal(f.main.inert,false);assert.equal(f.frame.inert,false);assert.ok(f.controls.every(b=>!b.disabled));
});

test('签发旧快照拒绝整套生成，不覆盖签发内容也不登记误标版本的文件',async()=>{
 const f=fixture({signed:{at:'历史签发'},measuresVersion:6});const before=structuredClone(f.snapshot);
 await assert.rejects(f.generate(),e=>e.code==='SOURCE_VERSION_MISMATCH'&&e.status===409);
 assert.deepEqual(f.snapshot,before);assert.equal(f.outputs.length,0);assert.ok(!f.calls.some(c=>c[0]==='sync-expansion'||c[0]==='word-export'));
 assert.equal(f.main.inert,false);assert.equal(f.context.busy,false);
});

test('签发稿和当前参数版本一致时允许生成，并保持签发正文',async()=>{
 const f=fixture({signed:{at:'当前签发'},measuresVersion:7});const result=await f.generate();
 assert.equal(result.documents.length,3);assert.ok(!f.calls.some(c=>c[0]==='sync-expansion'));assert.equal(f.snapshot.sections.overview.text,'工程师保留段落');
});

test('异步等待前即锁定生成，双击或编辑器切换不会启动第二批',async()=>{
 let release;const barrier=new Promise(resolve=>{release=resolve;});const f=fixture({flush:()=>barrier});
 const pending=f.generate();assert.equal(f.context.busy,true);assert.equal(f.main.inert,true);assert.ok(f.controls.every(b=>b.disabled));
 await assert.rejects(f.generate(),/正在生成或编辑/);release();await pending;assert.equal(f.outputs.length,3);
 for(const flag of ['opening','commandPending']){const other=fixture({[flag]:true});await assert.rejects(other.generate(),/正在生成或编辑/);assert.equal(other.calls.length,0);}
});

test('导出期间参数/正文变化或PPT实际输出版本不一致，登记前即失败',async()=>{
 for(const options of [{word:W=>{W.parameterVersion=8;}},{word:(_W,state)=>{state.sections.overview.text='异步更新';}},{exportVersion:6}]){
  const f=fixture(options);await assert.rejects(f.generate(),e=>e.code==='SOURCE_VERSION_MISMATCH'||e.code==='PPT_VERSION_MISMATCH');
  assert.equal(f.outputs.length,0);assert.ok(!f.calls.some(c=>c[0]==='register'));assert.equal(f.context.busy,false);
 }
});

test('部分登记失败保留已保存文件并明确提示未完整完成，不返回三份成功',async()=>{
 const f=fixture({failRegister:'pptx'});await assert.rejects(f.generate(),/尚未完整完成，已保存 1 份文件/);
 assert.equal(f.outputs.length,1);assert.equal(f.outputs[0].type,'docx');assert.match(f.notes.at(-1),/尚未完整完成/);
 assert.ok(!f.notes.includes('已生成 Word、PPT、Excel'));
});

test('生成恢复调用前的主页面inert状态，不解除外层MCP操作锁',async()=>{
 const f=fixture();f.main.inert=true;f.frame.inert=true;f.controls[0].disabled=true;await f.generate();
 assert.equal(f.main.inert,true);assert.equal(f.frame.inert,true);assert.equal(f.controls[0].disabled,true);assert.equal(f.controls[1].disabled,false);
});

async function importVersion(header){
 let route,received;
 officeDocumentApi({WORKBENCH_PORTABLE:'1'},{store:{create:async input=>{received=input;return input;}},generate:async()=>Buffer.from('fixture')}).configureServer({middlewares:{use(_path,handler){route=handler;}}});
 const req=Readable.from([Buffer.from('fixture')]);Object.assign(req,{url:'/'+projectId+'?type=docx',method:'POST',headers:{host:'127.0.0.1:5000','x-workbench-request':'office-documents','x-file-name':encodeURIComponent('测试'),'x-document-unit':encodeURIComponent(unit),...(header===undefined?{}:{'x-parameter-version':header})}});
 return new Promise((resolve,reject)=>route(req,{writeHead(status){this.status=status;},end(text){resolve({status:this.status,value:JSON.parse(text),received});}}).catch(reject));
}

test('Office请求头的数字参数版本规范为number，与JSON生成Excel一致，缺失不猜值',async()=>{
 for(const value of ['7','0007','0']){const result=await importVersion(value);assert.equal(result.status,201);assert.equal(result.received.sourceParameterVersion,Number(value));assert.equal(typeof result.received.sourceParameterVersion,'number');}
 assert.equal((await importVersion(undefined)).received.sourceParameterVersion,undefined);
 assert.equal((await importVersion('params-7')).received.sourceParameterVersion,'params-7');
 for(const value of ['-1','9007199254740993']){const result=await importVersion(value);assert.equal(result.status,400);assert.equal(result.received,undefined);}
});

const pptSource=await readFile(new URL('../parallel-tasks/06-ppt-report/prototype.js',import.meta.url),'utf8');
const pptImplementation=pptSource.slice(pptSource.indexOf('window.WorkbenchPpt.mcp={'),pptSource.indexOf('\n};',pptSource.indexOf('window.WorkbenchPpt.mcp={'))+3);
function pptAdapter({queued=false}={}){
 const state={snapshot:{project_id:projectId,parameter_version:6,output_version:'old'},edits:{},images:new Map(),exporting:false};let release;
 const snapshotQueue=queued?new Promise(resolve=>{release=()=>{state.snapshot={project_id:projectId,parameter_version:7,output_version:'new'};resolve();};}):Promise.resolve();
 const calls=[],scope={window:{WorkbenchPpt:{busy:()=>false}},state,snapshotQueue,draftStore:{revision:1},draftLoading:false,
  els:{unitName:{value:unit},projectName:{value:'本工程'}},buildCafeteriaSlides:snapshot=>{calls.push(snapshot.parameter_version);return [];},imageRequirements:[],
  cafeteriaBlob:async()=>new Blob(['pptx']),applyMeasureSnapshot:()=>{}};
 vm.runInNewContext(pptImplementation,scope);return {api:scope.window.WorkbenchPpt.mcp,state,calls,release};
}

test('PPT export等待实际快照队列并返回所用版本；不匹配在构建文件前拒绝',async()=>{
 const f=pptAdapter({queued:true});const pending=f.api.export({projectId,unit,parameterVersion:7});assert.deepEqual(f.calls,[]);f.release();
 const result=await pending;assert.equal(result.parameterVersion,7);assert.equal(result.outputVersion,'new');assert.equal(result.projectId,projectId);assert.equal(result.unit,unit);
 const old=pptAdapter();await assert.rejects(old.api.export({projectId,unit,parameterVersion:7}),e=>e.code==='PPT_VERSION_MISMATCH');assert.deepEqual(old.calls,[]);
 const legacy=await old.api.export();assert.equal(legacy.parameterVersion,6);assert.equal(legacy.draft,true);
});
