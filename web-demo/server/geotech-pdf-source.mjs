// Shared native PDF reader for the web page, MCP and local manager.
import {homedir,tmpdir} from 'node:os';
import {join,isAbsolute,dirname} from 'node:path';
import {reviewDifficultPages} from './geotech-ocr-review.mjs';
let reading=false;

export async function readGeotechPdfSource(bytes,filename='',env=process.env,{signal,reader}={}){
  if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>30*1024*1024){
    throw Object.assign(new Error('PDF文件须为1字节至30MB，请按章节拆分大文件'),{status:413});
  }
  if(!Buffer.from(bytes).subarray(0,1024).includes(Buffer.from('%PDF-'))){
    throw Object.assign(new Error('文件内容不是PDF，未导入'),{status:415});
  }
  signal?.throwIfAborted();
  if(reading)throw Object.assign(new Error('另一份PDF正在读取，请稍后重试'),{status:503});
  reading=true;
  try{
    const python=env.WORKBENCH_PDF_PYTHON||env.WORKBENCH_PYTHON||
      (process.platform==='win32'?join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'):'/usr/bin/python3');
    if(!isAbsolute(python))throw new Error('WORKBENCH_PDF_PYTHON必须使用绝对路径');
    const read=reader||(await import('../design/parallel-review-20261109/geotech/pdf/read-native-upload.mjs')).readNativePdfUpload;
    const result=await read(bytes,{filename,python,signal,timeoutMs:165000,renderOcrImages:false,
      artifactRoot:env.WORKBENCH_PDF_ARTIFACT_ROOT||join(env.WORKBENCH_CACHE_ROOT||tmpdir(),'workbench-geotech-pdf'),
      poppler:env.POPPLER_BIN||(env.WORKBENCH_PDFINFO?dirname(env.WORKBENCH_PDFINFO):undefined)||(process.platform==='win32'?join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin'):undefined)});
    if(result.artifactDirectory)await reviewDifficultPages(result,env,signal);
    if(!['extracted','review-only'].includes(result.status))throw Object.assign(new Error('未识别到可读内容，请核对扫描件或OCR配置'),{status:422});
    const blocks=result.source.blocks;
    return {...blocks,pdfReadReport:{...blocks.pdfReadReport,engine:'native-layout-v1',sourceHash:result.source.hash},
      warnings:[...(blocks.warnings||[])]};
  }catch(error){
    if(error.status||signal?.aborted)throw error;
    throw Object.assign(new Error(error.code==='timed-out'?'PDF读取超时，请按章节拆分后重试；未导入资料':
      'PDF增强读取失败，未退回可能遗漏表格的旧结果。请检查本机Python、pdfplumber、pypdf、pypdfium2、pdf2image及Poppler配置'),{status:503,cause:error});
  }finally{reading=false;}
}
