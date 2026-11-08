import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir,homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const run=promisify(execFile);
const script=fileURLToPath(new URL('./office-package.py',import.meta.url));
const python=env=>env.WORKBENCH_PYTHON||(process.platform==='win32'?join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'):'python3');
async function invoke(action,bytes,type,command,env){
  if(bytes&&bytes.length>64*1024*1024)throw Object.assign(Error('Office 文件超过 64 MB'),{status:413,code:'RESOURCE_LIMIT'});
  const dir=await mkdtemp(join(tmpdir(),'workbench-office-package-'));
  try{
    if(bytes)await writeFile(join(dir,'input.bin'),bytes);
    await writeFile(join(dir,'request.json'),JSON.stringify({action,type,command}));
    let output;
    try{output=await run(python(env),[script,dir],{windowsHide:true,timeout:60000,maxBuffer:24*1024*1024});}
    catch{throw Object.assign(Error('本机 Office 文档组件运行失败，原文件未覆盖'),{status:503,code:'OFFICE_COMPONENT_UNAVAILABLE'});}
    let result;try{result=JSON.parse(output.stdout.replace(/^\uFEFF/,'').trim());}catch{throw Object.assign(Error('本机 Office 文档组件返回无效结果'),{status:503,code:'OFFICE_COMPONENT_UNAVAILABLE'});}
    if(result.error)throw Object.assign(Error(result.error),{status:result.code==='CONFLICT'?409:422,code:result.code||'INVALID_OFFICE_PACKAGE'});
    return action==='inspect'?result:readFile(join(dir,'output.bin'));
  }finally{
    await Promise.all(['input.bin','request.json','output.bin'].map(name=>unlink(join(dir,name)).catch(()=>{})));
    await rmdir(dir).catch(()=>{});
  }
}
export const inspectOfficePackage=(bytes,type,env=process.env)=>invoke('inspect',bytes,type,null,env);
export const editOfficePackage=(bytes,type,command,env=process.env)=>invoke('edit',bytes,type,command,env);
export const generateWorkbook=(spec,env=process.env)=>invoke('generate',null,'xlsx',spec,env);
