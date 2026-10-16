import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {firstRewriteTarget} from './core.js';
import {readRewriteResponse} from './response.js';
import {rewriteApi} from './service.mjs';

test('未选段也能打开本章第一段正文，跳过图表和标题，保留引用',()=>{
 const text='3.1 地震作用\n\n[[table:earthquake]]\n\n本工程采用{{p:struct_sys}}。\n第二段。';
 const target=firstRewriteTarget(text);assert.equal(target.original,'本工程采用{{p:struct_sys}}。');assert.equal(text.slice(target.start,target.end),target.original);
 assert.equal(firstRewriteTarget('3.1 地震作用\n[[table:earthquake]]'),null);
});
test('部署登录过期或代理超时显示明确原因',async()=>{
 await assert.rejects(readRewriteResponse(new Response('Login required',{status:401})),/重新登录/);
 await assert.rejects(readRewriteResponse(new Response('<html>Timeout</html>',{status:504})),/网站改写服务连接超时/);
});
test('反向代理长等待期间持续发送心跳，完整结果可采用',async()=>{
 let release;const hold=new Promise(r=>release=r),events=[];
 const plugin=rewriteApi({DEEPSEEK_API_KEY:'fixture-only'},{heartbeatMs:5,fetch:async()=>{await hold;return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({text:'测试完整改写。'})}}]});}});
 let handler;plugin.configurePreviewServer({middlewares:{use:(path,fn)=>handler=fn}});
 const server=createServer((req,res)=>handler(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const response=await fetch('http://127.0.0.1:'+server.address().port,{method:'POST',headers:{'X-Workbench-Request':'deepseek-rewrite',Accept:'application/x-ndjson'},body:JSON.stringify({consent:true,original:'测试原文。',instruction:'简洁一些',context:{},online:false})});
  const reader=response.body.getReader(),decoder=new TextDecoder();let text='';
  while(!text.includes('heartbeat')){const chunk=await reader.read();text+=decoder.decode(chunk.value);}
  release();for(;;){const chunk=await reader.read();if(chunk.done)break;text+=decoder.decode(chunk.value);}
  events.push(...text.trim().split('\n').map(x=>JSON.parse(x)));
  assert.ok(events.some(e=>e.type==='heartbeat'));assert.equal(events.at(-1).data.text,'测试完整改写。');
 }finally{release();await new Promise(r=>server.close(r));}
});
