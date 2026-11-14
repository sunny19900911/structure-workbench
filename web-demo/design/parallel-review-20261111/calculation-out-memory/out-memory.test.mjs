import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../../../calculation-book.js',import.meta.url),'utf8');
const canonical=['WMASS.OUT','WDISP.OUT','WZQ.OUT'];
const bytes=text=>Buffer.from(text).toString('base64');
function model(unit='A',tag='A') {return {identity:{unit},model:{batch:tag,sourceIds:canonical.map((_,i)=>tag+i),files:canonical},sources:canonical.map((name,i)=>({name:unit+'-'+name,text:tag+' 原文 '+name,unit,slot:'yjk',source_id:tag+i}))};}
async function host({fetchImpl}={}) {
 const elements=new Map(['calcbook-ready','calcbook-out-list','calcbook-out-state'].map(id=>[id,{textContent:'',innerHTML:'',style:{},classList:{toggle(){}}}]));
 const handlers=new Map(),requests=[];let snapshot=model();
 const window={WORKBENCH_PORTABLE:true,WorkbenchProjects:{id:'p1',loading:false,mode:'blank',scheduleSave(){}},ExpansionWorkbench:{unit:'A',modelContext:()=>({identity:snapshot.identity,model:snapshot.model}),capture:()=>structuredClone(snapshot)},addEventListener(name,fn){handlers.set(name,fn)}};
 const context=vm.createContext({window,document:{getElementById:id=>elements.get(id)||null,querySelector:()=>null,querySelectorAll:()=>[]},fetch:async url=>{requests.push(url);return fetchImpl?fetchImpl(url):{ok:true,json:async()=>({ready:true,sections:[],workbooks:[]})};},location:{protocol:'http:',href:'http://127.0.0.1/'},localStorage:{getItem:()=>null},URL,URLSearchParams,AbortSignal,TextEncoder,Uint8Array,btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),setTimeout,clearTimeout,console});
 vm.runInContext(source,context);await window.CalculationBook.ready;await window.CalculationBook.loadProject({},'blank');
 return {window,requests,elements,run:code=>vm.runInContext(code,context),snapshot:value=>{snapshot=value;window.ExpansionWorkbench.unit=value.identity.unit;handlers.get('workbuddy:expansion-changed')?.();},emit:name=>handlers.get(name)?.(),book:window.CalculationBook};
}
const plain=v=>JSON.parse(JSON.stringify(v));

test('Excel DOM entirely absent: initialization, restore and export retain data without fetching sheets',async()=>{
 const h=await host();const saved={edits:{'old::sheet':{A1:'retained'}},linkedExcel:{workbook:'old',sheet:'sheet',edits:{A1:'retained'}},workbookKey:'old',sheetName:'sheet'};
 await h.book.loadProject(saved);assert.equal(h.elements.get('calcbook-ready').textContent,'Word 生成已就绪');
 const restored=h.book.capture();assert.deepEqual(plain(restored.edits),saved.edits);assert.deepEqual(plain(restored.linkedExcel),saved.linkedExcel);
 assert.equal(restored.workbookKey,'old');assert.equal(restored.sheetName,'sheet');assert.ok(h.requests.every(url=>url.includes('/status')));
 assert.equal(h.book.mcp.package({confirmed:true}).excel_blocks.length,1);
});
test('restored expansion raw texts and prefixed case-insensitive names supply all three files',async()=>{
 const h=await host();const s=model();s.sources[0].name='A_wMaSs.oUt';h.snapshot(s);
 const payload=h.book.mcp.package({confirmed:true});assert.deepEqual(plain(payload.out_files.map(x=>x.name)),canonical);
 assert.equal(payload.out_files[0].originalName,'A_wMaSs.oUt');assert.equal(Buffer.from(payload.out_files[0].content_base64,'base64').toString(),'A 原文 WMASS.OUT');
 assert.match(h.elements.get('calcbook-out-state').textContent,/3\/3/);assert.deepEqual(plain(h.book.capture().outFiles),[],'inherited raw text is not duplicated into main');
});
test('only current batch and explicit unit; metrics, deleted sources and duplicates never synthesize OUT',async()=>{
 const h=await host();const s=model();s.sources[0].text='';s.sources[1].unit='B';s.model.metrics={mass:'123'};h.snapshot(s);
 assert.equal(h.book.mcp.read().outFiles.length,1);
 s.sources.push({...s.sources[2],source_id:'duplicate'});s.model.sourceIds.push('duplicate');s.model.batch='changed';h.snapshot(s);assert.equal(h.book.mcp.read().outFiles.length,0);
 assert.match(h.book.mcp.read().outProblems.join(),/重复/);
 s.model=null;h.snapshot(s);assert.equal(h.book.mcp.package().out_files.length,0);
});
test('legacy embedded sourceFiles are readable, unscoped calculation files stay preserved without guessing unit',async()=>{
 const h=await host();await h.book.loadProject({outFiles:[{name:'WMASS.OUT',content_base64:bytes('legacy')}],edits:{x:{A1:'old'}}});
 h.snapshot({identity:{unit:'A'},modelBatch:{batch:'legacy'},sourceFiles:canonical.map(name=>({name,text:'legacy raw '+name}))});
 assert.equal(h.book.mcp.read().outFiles.length,3);assert.equal(h.book.capture().outFiles.length,1);
 h.snapshot({identity:{unit:'B'},model:{metrics:{mass:999}},sources:[]});assert.equal(h.book.mcp.read().outFiles.length,0);assert.match(h.elements.get('calcbook-out-state').textContent,/未标明单体/);
});
test('manual selection remains authoritative for its unit after save/reload and later expansion import',async()=>{
 const h=await host();await h.book.mcp.model([{name:'A-WMASS.OUT',size:6,arrayBuffer:async()=>Buffer.from('manual')}]);
 const saved=h.book.capture();h.snapshot(model('A','new-source'));assert.equal(h.book.mcp.read().outFiles.length,1);
 await h.book.loadProject(saved);assert.equal(Buffer.from(h.book.mcp.package().out_files[0].content_base64,'base64').toString(),'manual');
 h.snapshot(model('B','B'));assert.equal(h.book.mcp.read().outFiles.length,3);
 h.snapshot(model('A','new-source'));assert.equal(h.book.mcp.read().outFiles.length,1);
 assert.equal('outOverrides' in h.book.mcp.read(),false,'MCP read does not leak saved binary blobs');
});
test('switch project and late manual file reads never write into the new project',async()=>{
 const h=await host();let finish;const pending=h.book.mcp.model([{name:'WMASS.OUT',size:4,arrayBuffer:()=>new Promise(resolve=>finish=resolve)}]);
 h.window.WorkbenchProjects.id='p2';await h.book.loadProject({});h.snapshot({identity:{unit:'A'},model:null,sources:[]});
 finish(Buffer.from('late'));await assert.rejects(pending,/切换/);assert.equal(h.book.mcp.read().outFiles.length,0);assert.deepEqual(plain(h.book.capture().outOverrides),{});
});
test('unit A to B to A rejects a late manual selection, and the most recent selection wins',async()=>{
 const h=await host();let finish;const pending=h.book.mcp.model([{name:'WMASS.OUT',size:4,arrayBuffer:()=>new Promise(resolve=>finish=resolve)}]);
 h.snapshot(model('B'));h.snapshot(model('A'));finish(Buffer.from('late'));await assert.rejects(pending,/切换/);
 let old;const first=h.book.mcp.model([{name:'WMASS.OUT',size:3,arrayBuffer:()=>new Promise(resolve=>old=resolve)}]);
 await h.book.mcp.model([{name:'WZQ.OUT',size:3,arrayBuffer:async()=>Buffer.from('new')}]);old(Buffer.from('old'));await assert.rejects(first,/切换/);
 assert.deepEqual(plain(h.book.mcp.read().outFiles.map(x=>x.name)),['WZQ.OUT']);
});

test('late project initialization cannot overwrite newer project state; PDF source state is retained',async()=>{
 const pending=[];let delay=false,pdf;
 const h=await host({fetchImpl:async()=>delay?new Promise(resolve=>pending.push(resolve)):{ok:true,json:async()=>({ready:true,sections:[],workbooks:[]})}});
 h.window.CalculationPDFs={load(value){pdf=value;},capture:()=>pdf};delay=true;
 const first=h.book.loadProject({workbookKey:'old',pdfSources:{root:'old'}});
 h.window.WorkbenchProjects.id='p2';const latest=h.book.loadProject({workbookKey:'new',pdfSources:{root:'QA PDF path',files:[]}});
 pending[1]({ok:true,json:async()=>({ready:true,sections:[],workbooks:[]})});await latest;
 pending[0]({ok:true,json:async()=>({ready:false,sections:[],workbooks:[]})});await first;
 assert.equal(h.book.capture().workbookKey,'new');assert.deepEqual(plain(h.book.capture().pdfSources),{root:'QA PDF path',files:[]});assert.equal(h.elements.get('calcbook-ready').textContent,'Word 生成已就绪');
});
