import {readFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
const run=promisify(execFile);
const configPath=fileURLToPath(new URL('../outputs/pdf-ocr-runtime.json',import.meta.url));

export async function ocrRuntime(env={}){
 let config={};
 if(!env.WORKBENCH_OCR_PYTHON||!env.WORKBENCH_OCR_MODELS){
  try{config=JSON.parse(await readFile(configPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw Error('本地OCR配置无效');}
 }
 const python=env.WORKBENCH_OCR_PYTHON||config.python,models=env.WORKBENCH_OCR_MODELS||config.models;
 if(!python||!models)return null;
 if(!isAbsolute(python)||!isAbsolute(models))throw Error('OCR配置必须使用绝对路径');
 return {python,models};
}

export function difficultPages(blocks){
 return [...new Set([...(blocks.pdfReadReport?.ocrReviewPages||[]),
  ...(blocks.pdfReadReport?.unrestoredTablePages||[]),
  ...(blocks.pdfReadReport?.textReview||[]).map(r=>r.page),
  ...(blocks.tableMeta||[]).filter(t=>t.cellOrigins?.some(row=>row.some(c=>c?.requiresReview))).map(t=>t.page)])]
  .filter(p=>Number.isInteger(p)&&p>0).sort((a,b)=>a-b);
}

export function validateOcrReview(review,hash,pages){
 if(review?.schemaVersion!==1||review.sourceHash!==hash||review.automaticAdoption!==false||!Array.isArray(review.pages))throw Error('OCR来源不匹配');
 const seen=new Set();
 for(const p of review.pages){
  if(!pages.includes(p.page)||seen.has(p.page)||p.requiresReview!==true||!Array.isArray(p.lines)||!Array.isArray(p.secondPass)||!(p.width>0&&p.height>0))throw Error('OCR页清单无效');
  seen.add(p.page);
  for(const line of [...p.lines,...p.secondPass]){
   if(typeof line.text!=='string'||line.text.length>20000||!Number.isFinite(line.score)||!Array.isArray(line.bbox)||line.bbox.length!==4||!line.bbox.every(Number.isFinite))throw Error('OCR文字或坐标无效');
   const [x,y,r,b]=line.bbox;if(!(x>=0&&y>=0&&r>x&&b>y&&r<=p.width+2&&b<=p.height+2))throw Error('OCR坐标超出页面');
  }
 }
 return review;
}

export async function reviewDifficultPages(result,env={},signal){
 const blocks=result.source.blocks,pages=difficultPages(blocks);if(!pages.length)return result;
 const maxPages=8,selected=[...new Set([...(blocks.pdfReadReport?.ocrReviewPages||[]),...pages])].slice(0,maxPages),dir=result.artifactDirectory;
 let review={schemaVersion:1,sourceHash:result.source.hash,automaticAdoption:false,pages:[],requestedPages:pages,status:'unconfigured'};
 try{
  const runtime=await ocrRuntime(env);
  if(runtime){
   const input=join(dir,'ocr-job.json'),output=join(dir,'ocr-review.json');
   await writeFile(input,JSON.stringify({input:join(dir,'input.pdf'),sourceHash:result.source.hash,models:runtime.models,pages:selected}));
   let executionError;
   try{await run(runtime.python,[fileURLToPath(new URL('../design/parallel-review-20261109/geotech/pdf/review-difficult-pages.py',import.meta.url)),input,output],
    {windowsHide:true,signal,timeout:180000,maxBuffer:1024*1024,env:{...process.env,PYTHONUTF8:'1',MINERU_MODEL_ONNX_DEVICE:'cpu',OMP_NUM_THREADS:'4',OPENBLAS_NUM_THREADS:'4'}});}catch(e){executionError=e;}
   signal?.throwIfAborted();
   let data;try{data=validateOcrReview(JSON.parse(await readFile(output,'utf8')),result.source.hash,selected);}catch(e){if(!executionError)throw e;}
   if(data)review={...data,requestedPages:pages,status:executionError||data.pages.length!==pages.length||data.pages.some(p=>!p.lines.length)?'partial':'recognized'};
   else review.status='failed';
  }
 }catch(error){signal?.throwIfAborted();review.status='failed';}
 review.unprocessedPages=pages.filter(p=>!review.pages.some(r=>r.page===p));
 review.pageBudget=maxPages;
 blocks.ocrReview=review;
 blocks.pdfReadReport={...blocks.pdfReadReport,ocrApplied:review.pages.some(p=>p.lines.length),ocrScope:'review-candidates-only',ocrReviewedPages:review.pages.map(p=>p.page),ocrReviewStatus:review.status};
 if(result.status==='no-native-content'&&review.pages.some(p=>p.lines.length))result.status='review-only';
 await writeFile(join(dir,'ocr-review-status.json'),JSON.stringify(review));
 return result;
}
