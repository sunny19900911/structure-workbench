import test from 'node:test';
import assert from 'node:assert/strict';
import {readAnswerStream} from './stream.mjs';
import {createRewriteService} from './service.mjs';
import {readRewriteResponse} from './response.js';
const chunk=(delta,finish=null)=>'data: '+JSON.stringify({model:'test-model',choices:[{delta,finish_reason:finish}]})+'\r\n\r\n';
function response(text){const bytes=new TextEncoder().encode(text);return new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=7)c.enqueue(bytes.slice(i,i+7));c.close();}}),{headers:{'content-type':'text/event-stream'}});}
test('分块中文逐字输出，只转发正文，完成标志必需',async()=>{
 const deltas=[];const answer=await readAnswerStream(response(chunk({reasoning_content:'不外传的思考'})+chunk({content:'场地'})+chunk({content:'平缓。'},'stop')+'data: [DONE]\n'),x=>deltas.push(x));
 assert.deepEqual(deltas,['场地','平缓。']);assert.equal(answer.text,'场地平缓。');
 await assert.rejects(readAnswerStream(response(chunk({content:'半段'}))),/未完整/);
 await assert.rejects(readAnswerStream(response(chunk({content:'过长'},'length'))),/未完整/);
});
test('对话模式不强制JSON，可选思考，保留用户编辑稿和多轮文字',async()=>{
 let sent;const run=createRewriteService({DEEPSEEK_API_KEY:'test-placeholder'},{fetch:async(u,o)=>{sent=JSON.parse(o.body);return response(chunk({content:'场地平缓。'},'stop'));}});
 const input={consent:true,format:'text',thinking:false,online:false,original:'场地总体平缓',instruction:'简洁些',currentDraft:'场地整体较为平缓。',context:{},history:[{role:'assistant',content:JSON.stringify({text:'上一稿'})}]};
 const deltas=[];const result=await run(input,undefined,()=>{},x=>deltas.push(x));
 assert.equal(sent.stream,true);assert.equal(sent.response_format,undefined);assert.equal(sent.thinking.type,'disabled');assert.equal(sent.messages[2].content,'上一稿');assert.match(sent.messages.at(-1).content,/场地整体较为平缓/);assert.equal(result.text,'场地平缓。');assert.deepEqual(deltas,['场地平缓。']);
 await run({...input,thinking:true});assert.equal(sent.thinking.type,'enabled');
});
test('前端边接收边展示，未完成流不能作为最终稿',async()=>{
 const deltas=[];const events=[{type:'delta',text:'第一句。'},{type:'delta',text:'第二句。'},{type:'result',data:{text:'第一句。第二句。'}}];
 const result=await readRewriteResponse(new Response(events.map(e=>JSON.stringify(e)).join('\n'),{headers:{'content-type':'application/x-ndjson'}}),()=>{},s=>deltas.push(s));
 assert.equal(result.text,deltas.join(''));
 await assert.rejects(readRewriteResponse(new Response(JSON.stringify(events[0])+'\n',{headers:{'content-type':'application/x-ndjson'}})),/未收到/);
});
test('简洁改写直接调用模型，不查询搜索服务；用户要求与选中文字原样送达',async()=>{
 const calls=[];let searchCalls=0;
 const run=createRewriteService({DEEPSEEK_API_KEY:'test-placeholder'},{search:async()=>{searchCalls++;throw Error('不应联网检索');},fetch:async(url,options)=>{calls.push(JSON.parse(options.body));return response(chunk({content:'场地平缓，周边岩石局部出露。'},'stop'));}});
 const result=await run({consent:true,format:'text',thinking:true,original:'场地整体地势较平缓、开阔。周边出露岩石。',instruction:'简洁一点，有条理一些',context:{},history:[]});
 assert.equal(searchCalls,0);assert.equal(calls.length,1);assert.match(calls[0].messages.at(-1).content,/场地整体地势较平缓、开阔。周边出露岩石。/);assert.match(calls[0].messages.at(-1).content,/简洁一点，有条理一些/);assert.equal(result.searchStatus,'off');assert.equal(result.warning,'');
});

test('普通文字改写关闭思考、精简上下文并沿用既有模型配置',async()=>{
 const input={consent:true,format:'text',original:'场地整体较平缓。',instruction:'改成一条一条的',context:{surrounding:'不相关的整章内容'.repeat(1000),parameters:{wind:'0.3'}},history:[]};
 for(const [env,model] of [[{},'deepseek-v4-pro'],[{DEEPSEEK_MODEL:'existing-model'},'existing-model'],[{DEEPSEEK_REWRITE_MODEL:'chosen-model'},'chosen-model'],[{DEEPSEEK_BASE_URL:'https://gateway.example/v1',DEEPSEEK_MODEL:'gateway-model'},'gateway-model']]){
  let sent;const run=createRewriteService({DEEPSEEK_API_KEY:'fixture-only',...env},{fetch:async(u,o)=>{sent=JSON.parse(o.body);return response(chunk({content:'1. 场地整体较平缓。'},'stop'));}});
  await run(input);assert.equal(sent.model,model);assert.equal(sent.thinking.type,'disabled');assert.ok(JSON.stringify(sent).length<2000);assert.equal(sent.max_tokens,10000);
  await run({...input,instruction:'根据项目资料核对这段话'});assert.match(sent.messages[1].content,/不相关的整章内容/);
  await run({...input,instruction:'有没有遗漏？'});assert.match(sent.messages[1].content,/不相关的整章内容/);
 }
});

test('收到模型完整结束标记即返回，不等待迟迟不关闭的连接',async()=>{
 let cancelled=false;
 const r=new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(chunk({content:'1. 场地平缓。'},'stop')));},cancel(){cancelled=true;}}));
 const result=await readAnswerStream(r);assert.equal(result.text,'1. 场地平缓。');assert.equal(cancelled,true);
});

test('前端收到最终结果即结束等待；错误及截断仍不得采用',async()=>{
 let cancelled=false;
 const r=new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify({type:'result',data:{text:'完整正文'}})+'\n'));},cancel(){cancelled=true;}}),{headers:{'content-type':'application/x-ndjson'}});
 assert.equal((await readRewriteResponse(r)).text,'完整正文');assert.equal(cancelled,true);
 await assert.rejects(readAnswerStream(response(chunk({content:'未完成正文'},'length'))),/未完整/);
});
