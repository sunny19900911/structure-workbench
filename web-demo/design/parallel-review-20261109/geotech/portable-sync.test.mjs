import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {readGeotechPdfSource} from '../../../server/geotech-pdf-source.mjs';
import {browserCall} from '../../../server/mcp-tools.mjs';

test('portable and ordinary pages use the same native PDF handler, preserving tables',async()=>{
 const code=await readFile(new URL('../../../intake-workbench.js',import.meta.url),'utf8');
 const start=code.indexOf('async function readFiles('),end=code.indexOf('\n}',start)+2;
 for(const portable of [false,true]){
  const calls=[],saved=[];
  const blocks={paras:['原文'],tables:[[['层号','承载力'],['①','120']]],pdfReadReport:{engine:'native-layout-v1'}};
  const context={busy:false,importSlot:null,W:{id:'qa'},note:()=>{},action:async f=>f(),AbortSignal,
   window:{WorkbenchPortable:portable?{}:undefined,dispatchEvent:()=>{}},CustomEvent:class{},
   fetch:async(url)=>{calls.push(url);return {ok:true,json:async()=>blocks};},
   ingest:async(slot,name,value)=>saved.push(value),digest:async()=> 'hash',sourceReview:()=>({})};
  vm.createContext(context);vm.runInContext(code.slice(start,end),context);
  await context.readFiles('geo',[{name:'报告.pdf',size:10,arrayBuffer:async()=>new ArrayBuffer(10)}]);
  assert.deepEqual(calls,['/api/intake/read-pdf']);assert.deepEqual(saved,[blocks]);
 }
});
test('native reader uses this installation Poppler and isolated cache',async()=>{
 const blocks=await readGeotechPdfSource(Buffer.from('%PDF-1.7 test'),'a.pdf',{
  WORKBENCH_PYTHON:'C:/test/python/python.exe',WORKBENCH_PDFINFO:'C:/test/poppler/bin/pdfinfo.exe',WORKBENCH_CACHE_ROOT:'C:/test/data/cache'
 },{reader:async(_,o)=>{
  assert.match(o.poppler.replaceAll('\\','/'),/C:\/test\/poppler\/bin$/);
  assert.match(o.artifactRoot.replaceAll('\\','/'),/C:\/test\/data\/cache\/workbench-geotech-pdf$/);
  return {status:'extracted',source:{hash:'a'.repeat(64),blocks:{paras:['x'],tables:[]}}};
 }});assert.equal(blocks.pdfReadReport.engine,'native-layout-v1');
});
test('PDF MCP wait covers native reading and OCR without extending ordinary writes',async()=>{
 for(const [operation,args,expected] of [['document.import',{files:[{name:'地勘.pdf',base64:'AA=='}]},420000],['measures.update',{values:{wind:'0.3'}},180000]]){
  const client={request:async(_,options)=>{assert.equal(options.body.timeoutMs,expected);assert.equal(options.timeout,expected+10000);return {result:{result:{ok:true}}};}};
  assert.deepEqual(await browserCall(client,operation,{projectId:'a'.repeat(32),args}),{result:{ok:true},context:undefined});
 }
});
