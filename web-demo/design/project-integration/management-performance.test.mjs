import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,mkdtemp} from 'node:fs/promises';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {projectStoreApi,readPart,writePart} from '../../server/project-store.mjs';
import {projectPart} from '../../project-store-client.js';
import {createDocumentComposer,composeDocument} from '../../document-intake.js';

test('新建分区无需空读，首次保存仍使用零修订并保留冲突保护',async()=>{
 const previous=globalThis.fetch,storage=globalThis.localStorage,memory=new Map(),requests=[];
 globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
 globalThis.fetch=async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({record:{revision:1}})};};
 try{const part=projectPart('1'.repeat(32),'intake');assert.equal(await part.load({fresh:true}),null);assert.equal(requests.length,0);part.initializeEmpty({facts:[]});await part.save({facts:[]});assert.equal(requests.length,0);await part.save({facts:[{value:'本次编辑'}]});assert.equal(requests[0].body.expectedRevision,0);assert.equal(part.revision,1);assert.equal(part.recovery().dirty,false);part.initializeEmpty({facts:[]});await part.save({facts:[]});assert.equal(requests.length,2);}
 finally{globalThis.fetch=previous;globalThis.localStorage=storage;}
});

test('大资料保存只回传小确认，扩初读取不重复下载建筑地勘和PPT；完整备份仍保留',async()=>{
 const base=new URL('../../qa/interaction-fixes-20261015/',import.meta.url);await mkdir(base,{recursive:true});
 const root=await mkdtemp(new URL('store-test-',base)),id='2'.repeat(32);let handler;
 projectStoreApi({WORKBENCH_PROJECT_STORE:root}).configureServer({middlewares:{use:(path,fn)=>handler=fn}});
 const server=createServer((req,res)=>handler(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+server.address().port;
 try{
  const data={sources:[{text:'大型资料'.repeat(250000)}]};
  const r=await fetch(url+'/'+id+'/intake?ack=1',{method:'POST',headers:{'X-Workbench-Request':'project-store'},body:JSON.stringify({data,expectedRevision:0})});
  const body=await r.text();assert.equal(r.status,200);assert.ok(body.length<200);assert.equal((await readPart(root,id,'intake')).data.sources[0].text.length,data.sources[0].text.length);
  const context={identity:{unit:'A'},parameters:{intensity:'7'},model:{confirmed:true,metrics:{periods:'1.2'}},regulations:[{selected:true,code:'当前规范'}]};
  await writePart(root,id,'expansion-12345678',{...context,text:'扩初稿',reportImages:{site:{data:'x'.repeat(8*1024*1024)}},history:[{text:'人工原稿'}]},0);await writePart(root,id,'ppt',{images:['large']},0);
  const selected=await (await fetch(url+'/'+id+'?prefix=expansion-')).json();assert.deepEqual(Object.keys(selected.records),['expansion-12345678']);
  const archive=await (await fetch(url+'/'+id)).json();assert.ok(archive.records.intake);assert.ok(archive.records.ppt);
  const response=await fetch(url+'/'+id+'?prefix=expansion-&view=context'),compact=await response.text();assert.ok(compact.length<1000);assert.deepEqual(JSON.parse(compact).records['expansion-12345678'].data,context);
  assert.equal(archive.records['expansion-12345678'].data.reportImages.site.data.length,8*1024*1024);
  assert.equal((await fetch(url+'/'+id+'?view=context')).status,400);
  const conflict=await fetch(url+'/'+id+'/intake?ack=1',{method:'POST',headers:{'X-Workbench-Request':'project-store'},body:JSON.stringify({data:{wrong:true},expectedRevision:0})});assert.equal(conflict.status,409);
 }finally{await new Promise(r=>server.close(r));}
});

test('删除不下载全量备份，先保存再软删除；保存失败保留当前项目',async()=>{
 const source=await readFile(new URL('../../project-workspace.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('async function removeCurrent('),source.indexOf('async function restoreRemoved('));
 for(const failure of [null,Object.assign(Error('版本冲突'),{status:409}),Error('网络中断')]){
  const events=[],projects=[{id:'remaining'}];
  const context={confirm:()=>true,status:message=>events.push(['status',message]),progress(){},id:'deleted-id',operationStarted:0,
   flush:async()=>{events.push(['flush']);if(failure)throw failure;},download:()=>assert.fail('删除不应下载备份'),
   projectPart:(id,part)=>{assert.equal(part,'lifecycle');return {load:async()=>events.push(['read-lifecycle']),save:async data=>events.push(['delete',id,data.deleted])};},
   localStorage:{setItem:(key,value)=>events.push(['remember',value])},projectRequest:async path=>{assert.equal(path,'/');return {projects};},load:async(id)=>events.push(['load',id])};
  const remove=vm.runInNewContext(code+';removeCurrent',context);
  if(failure){await assert.rejects(remove(),failure);assert.deepEqual(events,[['flush']]);}
  else{await remove();assert.deepEqual(events.slice(0,3),[['flush'],['read-lifecycle'],['delete','deleted-id',true]]);assert.ok(events.some(e=>e[0]==='load'));}
 }
});

test('同一项目资料只编排一次；更换资料、单体、分类和项目后正确刷新',()=>{
 const composer=createDocumentComposer(),sources=[{source_id:'arch',slot:'bldg',hash:'1',fragments:[{id:'F1',locator:'段落1',text:'项目名称：性能测试学校。本段仅用于自动测试。'}]}];
 const first=composer(sources);assert.deepEqual(first,composeDocument(sources));
 assert.equal(composer(sources),first);assert.deepEqual(composer(sources,'教学楼'),composeDocument(sources,'教学楼'));
 sources.push({source_id:'geo',slot:'geo',fragments:[{id:'F1',locator:'段落1',text:'这是隔离测试地勘资料，不是实际工程结论。'}]});
 const added=composer(sources);assert.notEqual(added,first);assert.deepEqual(added,composeDocument(sources));
 sources[0].slot='geo';assert.deepEqual(composer(sources),composeDocument(sources));
 sources[0]={...sources[0],slot:'bldg',hash:'2',fragments:[{id:'F1',locator:'段落1',text:'项目名称：新测试学校。本段仅用于自动测试。'}]};
 assert.deepEqual(composer(sources),composeDocument(sources));
 assert.deepEqual(composer([]),composeDocument([]));assert.deepEqual(composer(JSON.parse(JSON.stringify(sources))),composeDocument(sources));
});

test('专项载入只预读判断所需上下文，完整文稿及图片留到打开PPT',async()=>{
 const source=await readFile(new URL('../../integrated-modules.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('async function load('),source.indexOf('window.WorkbenchModules='));
 for(const decisions of [[],[{unit:'另一单体',status:'confirmed'}]]){
  const calls=[],fresh=()=>({decisions:[]}),data={decisions};
  const context={W:{id:'test'},loading:false,saveTimer:0,clearTimeout(){},dialog:{close(){}},frame:null,fresh,note(){},render(){},emit(){},PROJECT:'项目整体',
   projectPart:()=>({load:async()=>data}),refreshExpansions:async contextOnly=>calls.push(contextOnly)};
  await vm.runInNewContext(code+';load()',context);
  assert.deepEqual(calls,decisions.length?[true]:[]);
 }
 assert.match(source,/async function openPpt\(\)\{[^\n]*await refreshExpansions\(\)/);
});

test('打开已有列表中的旧项目不重新扫描整个项目库',async()=>{
 const source=await readFile(new URL('../../project-workspace.js',import.meta.url),'utf8'),main={inert:false},select={options:[{value:'old-id'}],value:'old-id'};
 const context={loading:false,modules:new Map(),timer:0,clearTimeout(){},progress(){},document:{querySelector:()=>main},projectPart:()=>({load:async()=>({mode:'blank',parameters:{project_name:'已保存的旧项目'}}),revision:2}),clone:v=>v,
  legacy:{apply(){},params:()=>({project_name:'已保存的旧项目'}),publish(){}},window:{dispatchEvent(){}},sessionStorage:{setItem(){}},localStorage:{setItem(){}},URL,location:{href:'http://localhost/app'},history:{replaceState(){}},render(){},busy:false,CustomEvent:class{},q:()=>select,list:()=>assert.fail('切换已知项目不应扫描库'),status(){}};
 const code=source.slice(source.indexOf('async function load('),source.indexOf('async function create('));
 await vm.runInNewContext(code+";load('old-id')",context);
 assert.equal(context.id,'old-id');assert.equal(select.options[0].textContent,'已保存的旧项目');assert.equal(main.inert,false);
});

test('管理操作先显示进度、防止重复点击；请求失败后恢复按钮和编辑',async()=>{
 const source=await readFile(new URL('../../project-workspace.js',import.meta.url),'utf8'),messages=[];
 const main={inert:false},button={textContent:'新建空白项目',disabled:false},select={value:'A',disabled:false};let reject,calls=0;
 const context={busy:false,loading:false,operation:'',operationStarted:0,id:'A',modules:new Map([['workflow',{}]]),document:{querySelector:()=>main},bar:{setAttribute(){},removeAttribute(){},querySelectorAll:()=>[button,select]},q:()=>select,status:s=>messages.push(s),progress:s=>messages.push(s),setInterval:()=>1,clearInterval(){},setTimeout:fn=>fn()};
 const action=vm.runInNewContext(source.slice(source.indexOf('async function action('),source.indexOf('window.WorkbenchProjects='))+';action',context);
 const pending=action(()=>{calls++;return new Promise((_,no)=>reject=no);},button);await Promise.resolve();
 assert.equal(button.disabled,true);assert.equal(main.inert,true);assert.match(messages[0],/新建空白项目/);await action(()=>calls++,button);assert.equal(calls,1);
 reject(Error('模拟断线'));await pending;assert.equal(button.disabled,false);assert.equal(main.inert,false);assert.equal(button.textContent,'新建空白项目');assert.match(messages.at(-1),/模拟断线/);
});
