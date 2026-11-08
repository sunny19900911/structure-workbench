import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {documentFormatApi} from '../../server/document-format-api.mjs';

async function call(path,{method='POST',data=Buffer.from('qa'),headers={}}={},dependencies={}){
 let handler;documentFormatApi({},dependencies).configureServer({middlewares:{use:(route,fn)=>{if(route===path)handler=fn;}}});
 const req=Readable.from([data]);Object.assign(req,{url:'/',method,headers:{host:'127.0.0.1:5199','x-workbench-request':'portable-formats','x-file-name':encodeURIComponent('测试.docx'),...headers}});
 return new Promise((resolve,reject)=>handler(req,{writeHead(status){this.status=status;},end(text){resolve({status:this.status,data:JSON.parse(text)})}}).catch(reject));
}
test('真实文件名、字节和本地配置传入检测器，结果不猜Office版本',async()=>{
 const out=await call('/api/portable/formats',{}, {inspect:async(bytes,name)=>{assert.equal(name,'测试.docx');assert.equal(bytes.toString(),'qa');return {family:'word',format:'docx',formatVersion:'Office Open XML Transitional',creator:{application:'Word',version:'16.000'}};}});
 assert.equal(out.status,200);assert.equal(out.data.detected.format,'docx');assert.ok(!out.data.detected.installedVersion);
});
test('损坏/加密/伪装后缀原样保留识别错误，不给出成功结果',async()=>{
 for(const code of ['INVALID_FILE','ENCRYPTED_FILE','FORMAT_MISMATCH']){
  const out=await call('/api/portable/formats',{}, {inspect:async()=>{throw Object.assign(Error('检查失败'),{status:422,code,detected:{format:'xlsx'}});}});
  assert.equal(out.status,422);assert.equal(out.data.code,code);assert.equal(out.data.error,'检查失败');
 }
});
test('阻止跨来源请求和缺少专用标记的写入',async()=>{
 const dependencies={inspect:()=>{throw Error('must not run')}};
 assert.equal((await call('/api/portable/formats',{headers:{origin:'https://other.invalid'}},dependencies)).status,403);
 assert.equal((await call('/api/portable/formats',{headers:{'x-workbench-request':''}},dependencies)).status,403);
 assert.equal((await call('/api/portable/formats',{headers:{'x-file-name':'%zz'}},dependencies)).status,400);
});
test('本机能力采用独立接口，不创建Office实例',async()=>{
 const out=await call('/api/portable/capabilities',{method:'GET'}, {capabilities:async()=>({schema:1,installedApps:[{id:'word',detected:false,version:''}],features:[]})});
 assert.equal(out.status,200);assert.equal(out.data.installedApps[0].detected,false);
 assert.equal((await call('/api/portable/capabilities',{method:'POST'},{})).status,405);
});
