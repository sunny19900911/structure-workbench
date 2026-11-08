import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir,homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectOfficePackage,editOfficePackage} from './office-package.mjs';

const run=promisify(execFile),script=fileURLToPath(new URL('./office-excel-package.py',import.meta.url));
async function invoke(action,bytes,command,env){
 if(!bytes?.length||bytes.length>64*1024*1024)throw Object.assign(Error('XLSX 文件为空或超过 64 MB'),{status:413,code:'RESOURCE_LIMIT'});
 const dir=await mkdtemp(join(tmpdir(),'workbench-office-excel-'));
 try{
  await writeFile(join(dir,'input.bin'),bytes);
  await writeFile(join(dir,'request.json'),JSON.stringify({action,command}));
  const python=env.WORKBENCH_PYTHON||(process.platform==='win32'?join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'):'python3');
  let output;
  try{output=await run(python,[script,dir],{windowsHide:true,timeout:60000,maxBuffer:24*1024*1024});}
  catch{throw Object.assign(Error('Excel 组件未完成，原文件未覆盖'),{status:503,code:'EXCEL_COMPONENT_UNAVAILABLE'});}
  let result;
  try{result=JSON.parse(output.stdout.trim());}catch{throw Object.assign(Error('Excel 组件结果无效'),{status:503,code:'EXCEL_COMPONENT_UNAVAILABLE'});}
  if(result.error)throw Object.assign(Error(result.error),{status:result.code==='CONFLICT'?409:422,code:result.code});
  return action==='inspect'?result:await readFile(join(dir,'output.bin'));
 }finally{
  await Promise.all(['input.bin','request.json','output.bin'].map(name=>unlink(join(dir,name)).catch(()=>{})));
  await rmdir(dir).catch(()=>{});
 }
}
export const inspectExcelPackage=(bytes,env=process.env)=>invoke('inspect',bytes,null,env);
export const editExcelPackage=(bytes,command,env=process.env)=>invoke('edit',bytes,command,env);
// Inject these two delegates into the existing officeDocumentApi. Its revision check,
// immutable file store, origin checks and routes remain the only persistence path.
export const inspectWithExcel=(bytes,type,env)=>type==='xlsx'?inspectExcelPackage(bytes,env):inspectOfficePackage(bytes,type,env);
export const editWithExcel=(bytes,type,command,env)=>type==='xlsx'?editExcelPackage(bytes,command,env):editOfficePackage(bytes,type,command,env);
