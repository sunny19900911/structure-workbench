import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createServer} from 'node:http';
import {listenLocal} from '../../deploy/portable/listen-local.mjs';

test('reserved ports are skipped; OS chooses a port when the entire range is blocked',async()=>{
 class Blocked extends EventEmitter{
  ports=[];
  listen(port,host){assert.equal(host,'127.0.0.1');this.ports.push(port);queueMicrotask(()=>port?this.emit('error',Object.assign(Error('reserved'),{code:'EACCES'})):this.emit('listening'));}
  address(){return {port:55000};}
 }
 const server=new Blocked();assert.equal(await listenLocal(server,58720,{range:2}),55000);
 assert.deepEqual(server.ports,[58720,58721,0]);assert.equal(server.listenerCount('error'),0);assert.equal(server.listenerCount('listening'),0);
});
test('an occupied real listener is preserved and a different port is selected',async t=>{
 const owner=createServer(),other=createServer();
 await new Promise(r=>owner.listen(0,'127.0.0.1',r));
 t.after(()=>Promise.all([new Promise(r=>owner.close(r)),new Promise(r=>other.close(r))]));
 const selected=await listenLocal(other,owner.address().port,{range:1});
 assert.notEqual(selected,owner.address().port);assert.ok(owner.listening&&other.listening);
});
test('unrelated startup errors propagate without retry',async()=>{
 const server=new EventEmitter();let calls=0;server.listen=()=>{calls++;queueMicrotask(()=>server.emit('error',Object.assign(Error('bad'),{code:'EINVAL'})));};
 await assert.rejects(listenLocal(server,58720),{code:'EINVAL'});assert.equal(calls,1);
});
