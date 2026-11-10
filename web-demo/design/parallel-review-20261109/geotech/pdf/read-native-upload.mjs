// Server-side integration seam. No project writes, network calls or OCR adoption.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {join,basename,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {nativeReportSource} from './compose-native-report.mjs';
const run=promisify(execFile);

export async function readNativePdfUpload(bytes,{filename='report.pdf',python,artifactRoot,poppler,
 timeoutMs=120000,signal,ignoreFillBackgrounds=false,imageSupplement,renderOcrImages=true}={}){
 if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>64*1024*1024)throw new Error('PDF byte payload must be 1 byte to 64 MiB');
 const snapshot=Buffer.from(bytes);
 if(!snapshot.subarray(0,1024).includes(Buffer.from('%PDF-')))throw new Error('PDF signature missing');
 if(!python||!isAbsolute(python)||!artifactRoot||!isAbsolute(artifactRoot))throw new Error('Explicit absolute Python and artifact paths required');
 if(!Number.isFinite(timeoutMs)||timeoutMs<=0)throw new Error('Positive timeout required');
 signal?.throwIfAborted();
 const expectedHash=createHash('sha256').update(snapshot).digest('hex');
 // Freeze the reviewed crop inventory before the first await, just like bytes.
 const imageSnapshot=imageSupplement===undefined?undefined:structuredClone(imageSupplement);
 if(imageSnapshot&&(imageSnapshot.schemaVersion!==1||imageSnapshot.sourcePDFSha256!==expectedHash))throw new Error('Image supplement belongs to another PDF');
 await mkdir(artifactRoot,{recursive:true});
 const dir=await mkdtemp(join(artifactRoot,'native-upload-'));
 const input=join(dir,'input.pdf'),manifest=join(dir,'manifest.json'),output=join(dir,'result');
 await writeFile(input,snapshot,{flag:'wx'});
 await writeFile(manifest,JSON.stringify([{id:'upload',input}]),{flag:'wx'});
 const args=[fileURLToPath(new URL('./extract-native-report.py',import.meta.url)),manifest,output,'--verify-numeric'];
 if(ignoreFillBackgrounds)args.push('--ignore-fill-backgrounds');
 if(!renderOcrImages)args.push('--skip-ocr-images');
 const started=Date.now();
 try{
  if(imageSnapshot)await writeFile(join(dir,'image-supplement.json'),JSON.stringify(imageSnapshot),{flag:'wx'});
  await run(python,args,{windowsHide:true,timeout:timeoutMs,maxBuffer:1024*1024,signal,
   env:{...process.env,PYTHONUTF8:'1',...(poppler?{POPPLER_BIN:poppler}:{})}});
  const report=JSON.parse(await readFile(join(output,'upload','native-report.json'),'utf8'));
  report.name=basename(filename)||'report.pdf';
  const source=nativeReportSource(report,{expectedHash,imageSupplement:imageSnapshot});
  const hasContent=source.blocks.paras.length>0||source.blocks.tables.length>0;
  const result={status:hasContent?'extracted':'no-native-content',source,artifactDirectory:dir,
   elapsedMs:Date.now()-started,requiresOcrReview:source.blocks.pdfReadReport.ocrReviewPages.length>0,
   attachedImageCount:source.blocks.images.length};
  await writeFile(join(dir,'status.json'),JSON.stringify({status:result.status,sourceHash:expectedHash,
   requiresOcrReview:result.requiresOcrReview,attachedImageCount:result.attachedImageCount,elapsedMs:result.elapsedMs},null,2));
  return result;
 }catch(error){
  const status=signal?.aborted?'cancelled':error.killed?'timed-out':'failed';
  await writeFile(join(dir,'status.json'),JSON.stringify({status,sourceHash:expectedHash,elapsedMs:Date.now()-started},null,2));
  const failure=new Error(`Native PDF extraction ${status}; no source returned`,{cause:error});
  failure.code=status;failure.artifactDirectory=dir;throw failure;
 }
}
