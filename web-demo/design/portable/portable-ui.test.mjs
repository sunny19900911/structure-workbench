import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {fragments} from '../../intake-core.js';
import {composeDocument} from '../../document-intake.js';
const source=readFileSync(new URL('../../portable-mode.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../../workbuddy-integrated-studio.html',import.meta.url),'utf8');
function environment({portable=true,result={detected:{family:'pdf',format:'pdf',formatVersion:'1.7',encrypted:false,extensionMatches:true,warnings:[]}},ok=true}={}){
  let calls=0;const context={URL,WeakMap,AbortController,setTimeout,clearTimeout,CustomEvent:class{constructor(type,value){this.type=type;Object.assign(this,value);}},navigator:{onLine:true},fetch:async(url,options)=>{calls++;assert.equal(url,'/api/portable/formats');assert.equal(options.headers['X-Workbench-Request'],'portable-formats');return {ok,json:async()=>result};},window:{WORKBENCH_PORTABLE:portable,dispatchEvent(){}},document:{currentScript:{src:'http://127.0.0.1:5197/portable-mode.js'},documentElement:{classList:{add(){}}},readyState:'loading',addEventListener(){}}};
  vm.createContext(context);vm.runInContext(source,context);return {context,api:context.window.WorkbenchPortable,calls:()=>calls};
}
test('online profile is unchanged and portable libraries use only local URLs',()=>{
  assert.equal(environment({portable:false}).api,undefined);
  const {api}=environment();for(const value of Object.values(api.resources))assert.ok(value.startsWith('http://127.0.0.1:5197/vendor/'));
});
test('actual format is inspected once per File and incompatible import is rejected',async()=>{
  const {api,calls}=environment(),file={name:'中文报告.pdf',size:100};
  assert.equal((await api.inspectFile(file,'pdf')).formatVersion,'1.7');
  await api.inspectFile(file,'pdf');assert.equal(calls(),1);
  await assert.rejects(api.inspectFile(file,'excel'),/实际为 PDF/);
});
test('encrypted, renamed and damaged files cannot be reported as successful',async()=>{
  for(const patch of [{encrypted:true},{extensionMatches:false},{family:undefined}]){
    const {api}=environment({result:{detected:{family:'word',format:'docx',...patch}}});
    await assert.rejects(api.inspectFile({name:'报告.docx',size:100}));
  }
  const {api}=environment({ok:false,result:{error:'ZIP内容损坏'}});
  await assert.rejects(api.inspectFile({name:'报告.docx',size:100}),/ZIP内容损坏/);
  await assert.rejects(api.inspectFile({name:'报告.pdf',size:65*1024*1024}),/64 MB/);
});
test('failed checks may be retried and a known macro flag is retained without execution',async()=>{
  const {api,calls}=environment({ok:false,result:{error:'服务暂未就绪'}}),file={name:'x.xls',size:10};
  await assert.rejects(api.inspectFile(file));await assert.rejects(api.inspectFile(file));assert.equal(calls(),2);
  const macro=environment({result:{detected:{family:'excel',format:'xlsm',macros:true,extensionMatches:true,warnings:['宏不会执行']}}});
  assert.equal((await macro.api.inspectFile({name:'x.xlsm',size:50},'excel')).macros,true);
});
test('only matching, verified regulation links are visible; local PDF works offline',()=>{
  const {api,context}=environment(),record={source_id:'SRC-TEST',source_url:'https://example.gov.cn/test.pdf'};
  assert.equal(api.regulationLink(record),null);
  context.window.WorkbenchRegulationLinks={records:{'SRC-TEST':{source_url:record.source_url,url:record.source_url,status:'verified',contentMatches:false,checkedAt:'2026-10-30'}}};
  assert.equal(api.regulationLink(record),null);
  const check=context.window.WorkbenchRegulationLinks.records['SRC-TEST'];check.contentMatches=true;
  assert.equal(api.regulationLink(record).url,record.source_url);
  context.navigator.onLine=false;assert.equal(api.regulationLink(record),null);
  check.localPath='vendor/regulations/test.pdf';assert.equal(api.regulationLink(record).label,'查看本地资料');
  check.localPath='vendor/regulations/../../test.pdf';assert.equal(api.regulationLink(record),null);
});
test('portable Excel reads real formats using SheetJS and rejects missing formula results',async()=>{
  const start=html.indexOf('async function stReadXlsx(file){'),end=html.indexOf('/* ── 导入 ── */',start);
  let worksheet={A1:{v:'楼层'},A2:{v:23,f:'SUM(B1:B3)'},'!ref':'A1:A2'},checked=0,parsed;
  const context={window:{WorkbenchPortable:{inspectFile:async()=>{checked++;}}},Uint8Array,
    loadSheetJS:async()=>({read:()=>({SheetNames:['用量'],Sheets:{'用量':worksheet}})}),
    sheetGrid:sheet=>[[sheet.A2.v]],stParseRebarGrid:grid=>{parsed=grid;return [{kg:grid[0][0]}];},
    xlsxGrids:()=>{throw Error('portable profile must not use the incomplete fallback');}};
  vm.createContext(context);vm.runInContext(html.slice(start,end),context);
  const file={name:'旧版.xls',arrayBuffer:async()=>new ArrayBuffer(8)};
  assert.equal((await context.stReadXlsx(file))[0].kg,23);assert.equal(checked,1);assert.equal(parsed[0][0],23);
  worksheet.A2={f:'SUM(B1:B3)'};
  await assert.rejects(context.stReadXlsx(file),/公式没有保存计算结果/);
});
test('all main-page classic inline scripts remain valid JavaScript',()=>{
  for(const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)){
    if(/type="module"/.test(match[1])||!match[2].trim())continue;
    new vm.Script(match[2]);
  }
});
test('PDF text extraction records unreadable pages and closes the document',async()=>{
  const start=html.indexOf('async function readPdfJs(file){'),end=html.indexOf('/* 表头匹配',start);
  let report,destroyed=false,options;
  const document={numPages:2,getPage:async n=>({getTextContent:async()=>({items:n===1?[{str:'工程概况',transform:[1,0,0,1,0,0]}]:[]})}),destroy:async()=>{destroyed=true;}};
  const context={Uint8Array,window:{WorkbenchPortable:{resources:{pdfCmaps:'/vendor/cmaps/',pdfFonts:'/vendor/fonts/'},inspectFile:async()=>({}),pdfReadReport:(_file,value)=>{report=value;}}},loadPdfJs:async()=>({getDocument:input=>{options=input;return {promise:Promise.resolve(document)};}})};
  vm.createContext(context);vm.runInContext(html.slice(start,end),context);
  assert.match(await context.readPdfJs({arrayBuffer:async()=>new ArrayBuffer(8)}),/工程概况/);
  assert.equal(report.pageCount,2);assert.deepEqual(Array.from(report.pagesWithoutText),[2]);assert.match(report.warnings[0],/未作为文字资料编入/);assert.equal(options.isEvalSupported,false);assert.equal(destroyed,true);
  destroyed=false;document.getPage=async()=>{throw Error('页树损坏');};
  await assert.rejects(context.readPdfJs({arrayBuffer:async()=>new ArrayBuffer(8)}),/页树损坏/);assert.equal(destroyed,true);
});
test('PDF reading warnings remain metadata and cannot become report paragraphs',()=>{
  const marker='第 2、5 页未提取到文字（可能为图纸、扫描页或空白页），这些页未作为文字资料编入说明';
  const blocks={paras:['项目名称：本地验收学校建设项目','建设地点：测试市中心片区规划道路北侧','拟建场地所有钻孔未测到地下水，调查记录见本次勘察报告。'],tables:[],warnings:[marker],format:{family:'pdf',formatVersion:'1.7',warnings:[marker]},pdfReadReport:{pageCount:5,pagesWithoutText:[2,5],warnings:[marker]}};
  const pieces=fragments(blocks);
  assert.ok(pieces.every(piece=>!piece.text.includes(marker)));
  const document=composeDocument([{slot:'geo',source_id:'pdf-warning-test',name:'勘察报告.pdf',blocks,fragments:pieces}]);
  assert.ok(!JSON.stringify(document).includes(marker));
  assert.ok(blocks.warnings.includes(marker));
});
test('portable storage messages use local wording while revision writes stay unchanged',async()=>{
  const module=readFileSync(new URL('../../project-store-client.js',import.meta.url),'utf8').replace(/\bexport\s+/g,''),values=new Map(),messages=[];
  const context={window:{WORKBENCH_PORTABLE:true},JSON,AbortController,setTimeout,clearTimeout,localStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)},fetch:async(url,options)=>{assert.match(url,/\/api\/workbench-projects\/test\/main\?ack=1/);assert.equal(JSON.parse(options.body).expectedRevision,0);return {ok:true,json:async()=>({record:{revision:1}})};}};
  vm.createContext(context);vm.runInContext(module,context);
  const part=context.projectPart('test','main',value=>messages.push(value));
  assert.equal(await part.save({title:'test'}),1);assert.equal(part.revision,1);
  assert.ok(messages.some(value=>value==='已保存至本机项目 · 修订 1'));
  assert.ok(messages.every(value=>!value.includes('603')));
});
test('portable AI setup opens the local settings without developer paths',()=>{
  const assistant=readFileSync(new URL('../../deepseek-assistant.js',import.meta.url),'utf8'),start=assistant.indexOf('function renderSetupHint()'),end=assistant.indexOf('function collectContext()',start);
  let appended,opened=false;const button={};
  const context={window:{WORKBENCH_PORTABLE:true,WorkbenchPortable:{openSettings:()=>{opened=true;}}},setOpen:()=>{},document:{querySelector:selector=>selector==='.wb-ai-messages'?{appendChild:value=>{appended=value;}}:null,createElement:()=>({querySelector:()=>button})}};
  vm.createContext(context);vm.runInContext(assistant.slice(start,end),context);context.renderSetupHint();
  assert.match(appended.innerHTML,/本机状态/);assert.doesNotMatch(appended.innerHTML,/\.env|Demo|web-demo/);
  button.onclick();assert.equal(opened,true);
});
