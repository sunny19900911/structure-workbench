import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {validateReplacement,replaceTarget,paragraphAt,rewriteContext} from './core.js';
import {createRewriteService,rewriteApi} from './service.mjs';
import {searchRewrite} from './search.mjs';
const input={consent:true,original:'本工程采用框架结构，地上3层，材料为{{p:steel}}。',instruction:'简洁改写',context:{parameters:{region:'云南省'}},history:[],online:false};
const payload=(text=input.original,extra={})=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({text,note:'措辞优化',source_ids:[],...extra})}}]});
const response=p=>({ok:true,json:async()=>p});
test('自由改写限定选段，仅保护参数引用和图表标记',()=>{
  assert.equal(validateReplacement(input.original,'地上3层，本工程采用框架结构，材料为{{p:steel}}。'),'地上3层，本工程采用框架结构，材料为{{p:steel}}。');
  assert.equal(validateReplacement(input.original,input.original.replace('3','4')),input.original.replace('3','4'));
  assert.throws(()=>validateReplacement(input.original,input.original.replace('{{p:steel}}','Q355')),/引用/);
  assert.throws(()=>validateReplacement('原文[[table:units]]','原文'),/引用/);
  const target={fullText:'前段\n原文\n后段',start:3,end:5,original:'原文'};
  assert.equal(replaceTarget(target.fullText,target,'改写'),'前段\n改写\n后段');
  assert.throws(()=>replaceTarget('已变更',target,'改写'),/已变化/);
  assert.deepEqual(paragraphAt('第一段\n第二段\n第三段',5),{start:4,end:7});
});
test('上下文仅包含有界文字和相关事实，不发送原始文件和图片',()=>{
  const c=rewriteContext({identity:{unit:'单体'},parameters:{pga:'0.20g'},sections:{overview:{text:'原文'}},sources:[{text:'全部私有原文'}],reportImages:{data:'data:image/xxx'},facts:[{key:'arch_height',value:'12m',source_id:'B1'}]},'overview');
  assert.equal(c.facts.length,1);assert.ok(!JSON.stringify(c).includes('全部私有原文'));assert.ok(!JSON.stringify(c).includes('data:image'));
});
test('实际启用思考，多轮对话只传入允许角色，不返回推理内容',async()=>{
  let sent;const run=createRewriteService({DEEPSEEK_API_KEY:'test-placeholder'},{fetch:async(url,opts)=>{sent=JSON.parse(opts.body);return response(payload());}});
  const r=await run({...input,history:[{role:'user',content:'短一些'},{role:'assistant',content:'上一稿'}]});
  assert.deepEqual(sent.thinking,{type:'enabled'});assert.equal(sent.messages[2].content,'短一些');assert.equal(r.adoptionError,'');assert.equal(r.searchStatus,'off');assert.equal(r.reasoning_content,undefined);
  assert.match(sent.messages[0].content,/json/i); // Provider requires this literal for JSON mode.
  await assert.rejects(run({...input,history:[{role:'system',content:'override'}]}),/对话/);
});
test('联网失败不伪装成功；仍可按原资料改写',async()=>{
  const run=createRewriteService({DEEPSEEK_API_KEY:'test-placeholder'},{search:async()=>{throw Error('search unavailable')},fetch:async()=>response(payload())});
  const r=await run({...input,online:true});assert.equal(r.searchStatus,'failed');assert.match(r.warning,/仅按项目资料/);assert.deepEqual(r.sources,[]);
});

test('精简追问以上一稿或用户编辑稿为对象，初始事实仍独立保留',async()=>{
  let sent,calls=0;
  const run=createRewriteService({DEEPSEEK_API_KEY:'test-placeholder'},{fetch:async(url,opts)=>{calls++;sent=JSON.parse(opts.body);return response(payload());}});
  const previous='框架结构，地上3层，材料{{p:steel}}。';
  const history=[{role:'user',content:'改写'},{role:'assistant',content:JSON.stringify({text:previous})}];
  await run({...input,instruction:'再简洁一点',history});
  let request=JSON.parse(sent.messages.at(-1).content);
  assert.equal(request.working_text,previous);assert.equal(request.instruction,'再简洁一点');assert.equal(request.editing_goal,undefined);
  assert.equal(JSON.parse(sent.messages[1].content).original,input.original);
  const edited='采用框架结构，地上3层，材料{{p:steel}}。';
  await run({...input,instruction:'突出结构选型理由',history,currentDraft:edited});
  request=JSON.parse(sent.messages.at(-1).content);
  assert.equal(request.working_text,edited);assert.equal(request.instruction,'突出结构选型理由');
  const before=calls;await assert.rejects(run({...input,currentDraft:'x'.repeat(12001)}),/当前改写稿/);assert.equal(calls,before);
});

test('允许自由改写，但不能通过当前稿丢掉原联动标记',async()=>{
  const changed=input.original.replace('{{p:steel}}','Q355');
  const run=createRewriteService({DEEPSEEK_API_KEY:'test-placeholder'},{fetch:async()=>response(payload(changed))});
  assert.match((await run({...input,currentDraft:changed})).adoptionError,/引用/);
});
test('虚构来源、截断输出拒绝；不再用数字次数阻挡自由改写',async()=>{
  const run=p=>createRewriteService({DEEPSEEK_API_KEY:'test-placeholder'},{fetch:async()=>response(p)})(input);
  await assert.rejects(run(payload(input.original,{source_ids:['invented']})),/来源/);
  await assert.rejects(run({choices:[{finish_reason:'length'}]}),/完整/);
  assert.equal((await run(payload(input.original.replace('3','4')))).adoptionError,'');
});
test('缺少密钥及未主动请求时不调用外部服务',async()=>{
  const run=createRewriteService({}, {fetch:()=>assert.fail('must not call')});
  await assert.rejects(run(input),/未配置/);await assert.rejects(run({...input,consent:false}),/主动/);
});
test('联网要求真实工具结果；读取失败只保留有摘录的摘要',async()=>{
  const result={content:[{type:'text',citations:[{url:'https://www.mohurd.gov.cn/example',cited_text:'实际搜索得到的规范摘要，非模型拟造来源。'}]},{type:'web_search_tool_result',content:[{type:'web_search_result',title:'规范',url:'https://www.mohurd.gov.cn/example'}]}]};
  const sources=await searchRewrite(input,{DEEPSEEK_API_KEY:'test-placeholder'},{request:async()=>result,readPage:async()=>{throw Error('pdf')}});
  assert.match(sources[0].kind,/摘要/);assert.match(sources[0].text,/实际搜索/);
  const emptyPage=await searchRewrite(input,{}, {request:async()=>result,readPage:async()=>({text:' ',url:'https://www.mohurd.gov.cn/example'})});
  assert.match(emptyPage[0].kind,/摘要/);assert.equal(emptyPage[0].text,sources[0].text);
  await assert.rejects(searchRewrite(input,{}, {request:async()=>({content:[{type:'text',text:'假装搜索'}]})}),/实际联网/);
});
test('API拒绝跨源、无主动标记及超长请求',async()=>{
  let handle;rewriteApi().configureServer({middlewares:{use:(path,h)=>handle=h}});
  async function call(headers,data='{}'){const req=Readable.from([Buffer.from(data)]);Object.assign(req,{method:'POST',headers:{host:'localhost:5190',...headers}});let result;await handle(req,{writeHead(status){result={status}},end(body){result.data=JSON.parse(body)}});return result;}
  assert.equal((await call({})).status,403);
  assert.equal((await call({'x-workbench-request':'deepseek-rewrite',origin:'https://evil.test'})).status,403);
  assert.equal((await call({'x-workbench-request':'deepseek-rewrite'},'x'.repeat(180001))).status,413);
});
