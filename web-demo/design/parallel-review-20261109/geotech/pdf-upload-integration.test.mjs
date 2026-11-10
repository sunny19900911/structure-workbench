import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {EventEmitter} from 'node:events';
import {readGeotechPdfSource} from '../../../server/geotech-pdf-source.mjs';
import {intakeApi} from '../../../server/intake-api.mjs';

const bytes=Buffer.from('%PDF-1.7 test');
const sample={status:'extracted',source:{hash:'a'.repeat(64),blocks:{paras:['原文'],tables:[[['层号','侧阻力'],['①','25']]],
  tableMeta:[{page:10}],ordered:[{type:'p',index:0},{type:'table',index:0}],pdfReadReport:{ocrReviewPages:[11]},warnings:['第11页图片待复核']}}};
test('native upload preserves tables, page/review metadata and source hash',async()=>{
  const blocks=await readGeotechPdfSource(bytes,'报告.pdf',{}, {reader:async(payload,options)=>{
    assert.deepEqual(payload,bytes);assert.equal(options.filename,'报告.pdf');return structuredClone(sample);
  }});
  assert.deepEqual(blocks.tables,sample.source.blocks.tables);
  assert.deepEqual(blocks.tableMeta,[{page:10}]);assert.deepEqual(blocks.pdfReadReport.ocrReviewPages,[11]);
  assert.equal(blocks.pdfReadReport.sourceHash,'a'.repeat(64));assert.equal(blocks.pdfReadReport.engine,'native-layout-v1');
  assert.deepEqual(blocks.warnings,['第11页图片待复核']);assert.equal(blocks.artifactDirectory,undefined);
});
test('empty/scanned-only, failed and concurrent readers cannot return a false success',async()=>{
  await assert.rejects(readGeotechPdfSource(Buffer.from('bad'),'x.pdf'),{status:415});
  await assert.rejects(readGeotechPdfSource(bytes,'x.pdf',{}, {reader:async()=>({status:'no-native-content'})}),{status:422});
  await assert.rejects(readGeotechPdfSource(bytes,'x.pdf',{}, {reader:async()=>{throw Error('missing runtime');}}),{status:503});
  let release,started;const gate=new Promise(r=>{started=r;});
  const running=readGeotechPdfSource(bytes,'x.pdf',{}, {reader:async()=>{started();await new Promise(r=>release=r);return sample;}});
  await gate;
  await assert.rejects(readGeotechPdfSource(bytes,'y.pdf',{}, {reader:async()=>sample}),/另一份PDF/);
  release();await running;
  const controller=new AbortController();controller.abort();
  await assert.rejects(readGeotechPdfSource(bytes,'x.pdf',{}, {signal:controller.signal,reader:async()=>sample}),{name:'AbortError'});
  assert.ok(await readGeotechPdfSource(bytes,'x.pdf',{}, {reader:async()=>sample}));
});
async function request({origin='http://localhost',marker='intake',body=bytes}={}){
  let route,calls=0;
  intakeApi({}, {readGeotechPdfSource:async(data,name,env,options)=>{calls++;assert.equal(name,'报告.pdf');assert.deepEqual(data,bytes);assert.ok(options.signal);return sample.source.blocks;}})
    .configureServer({middlewares:{use:(path,fn)=>{assert.equal(path,'/api/intake');route=fn;}}});
  const req=Readable.from([body]);Object.assign(req,{method:'POST',url:'/read-pdf',headers:{host:'localhost',origin,'x-workbench-request':marker,'x-file-name':encodeURIComponent('报告.pdf')}});
  const res=new EventEmitter();let result;
  res.writeHead=status=>{res.statusCode=status;};res.end=data=>{res.writableEnded=true;result=JSON.parse(data);};
  await route(req,res);return {status:res.statusCode,result,calls};
}
test('real intake middleware exposes the native route with existing origin and size guards',async()=>{
  const success=await request();assert.equal(success.status,200);assert.deepEqual(success.result,sample.source.blocks);
  assert.equal((await request({origin:'http://evil.example'})).status,403);
  assert.equal((await request({marker:'wrong'})).calls,0);
  const large=await request({body:Buffer.alloc(30*1024*1024+1)});assert.equal(large.status,413);assert.equal(large.calls,0);
});
