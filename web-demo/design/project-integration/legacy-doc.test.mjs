import test from 'node:test';
import assert from 'node:assert/strict';
import {legacyDocCopy} from '../../server/legacy-doc.mjs';
function compound(size,version=3,shift=9){
  const b=Buffer.alloc(size,0x61);Buffer.from('d0cf11e0a1b11ae1','hex').copy(b);
  b.writeUInt16LE(version,26);b.writeUInt16LE(shift,30);return b;
}
test('带尾部数据的DOC只补齐读取副本，完整保留所有输入字节',()=>{
  const input=compound(1024+229),before=Buffer.from(input),result=legacyDocCopy(input);
  assert.equal(result.length,1536);assert.deepEqual(result.subarray(0,input.length),before);
  assert.deepEqual(input,before);assert.ok(result.subarray(input.length).every(b=>b===0));
});
test('标准对齐的DOC不增加空扇区，重复处理结果不变',()=>{
  const input=compound(1024);assert.deepEqual(legacyDocCopy(input),input);
  const padded=legacyDocCopy(compound(777));assert.deepEqual(legacyDocCopy(padded),padded);
});
test('依据CFB头识别4096字节扇区，并拒绝截断或非法文件头',()=>{
  const v4=compound(4097,4,12);assert.equal(legacyDocCopy(v4).length,8192);
  assert.throws(()=>legacyDocCopy(Buffer.alloc(8)),/有效/);
  assert.throws(()=>legacyDocCopy(compound(512,3,31)),/文件头/);
  assert.throws(()=>legacyDocCopy(Buffer.alloc(512)),/有效/);
});
