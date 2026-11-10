import test from 'node:test';
import assert from 'node:assert/strict';
import {readNativePdfUpload} from './read-native-upload.mjs';
test('rejects invalid payloads and implicit execution paths before work starts',async()=>{
 await assert.rejects(readNativePdfUpload(new Uint8Array()),/payload/);
 await assert.rejects(readNativePdfUpload(Buffer.from('not a PDF')),/signature/);
 await assert.rejects(readNativePdfUpload(Buffer.from('%PDF-1.7')),/absolute/);
});
test('an already cancelled job never starts a child or creates artifacts',async()=>{
 const controller=new AbortController();controller.abort(new Error('cancelled by caller'));
 await assert.rejects(readNativePdfUpload(Buffer.from('%PDF-1.7'),{
  python:process.execPath,artifactRoot:process.cwd(),signal:controller.signal}),/cancelled by caller/);
});

test('a supplement for different PDF bytes is rejected before extraction',async()=>{
 await assert.rejects(readNativePdfUpload(Buffer.from('%PDF-1.7'),{
  python:process.execPath,artifactRoot:process.cwd(),
  imageSupplement:{schemaVersion:1,sourcePDFSha256:'a'.repeat(64),images:[]}
 }),/another PDF/);
});
