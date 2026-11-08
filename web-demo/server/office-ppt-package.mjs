import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir,homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectOfficePackage,editOfficePackage} from './office-package.mjs';

const run=promisify(execFile),script=fileURLToPath(new URL('./office-ppt-package.py',import.meta.url));
async function invoke(action,bytes,command,env){
 if(bytes.length>64*1024*1024)throw Object.assign(Error('PPTX 超过 64 MB'),{status:413});
 const directory=await mkdtemp(join(tmpdir(),'workbench-office-ppt-'));
 try{
  await writeFile(join(directory,'input.bin'),bytes);
  await writeFile(join(directory,'request.json'),JSON.stringify({action,command}));
  const python=env.WORKBENCH_PYTHON||(process.platform==='win32'?join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'):'python3');
  let output;
  try{output=await run(python,[script,directory],{windowsHide:true,timeout:60000,maxBuffer:24*1024*1024});}
  catch{throw Object.assign(Error('本机 PPT 组件运行失败，原文件未覆盖'),{status:503,code:'OFFICE_COMPONENT_UNAVAILABLE'});}
  const result=JSON.parse(output.stdout.replace(/^\uFEFF/,'').trim());
  if(result.error)throw Object.assign(Error(result.error),{status:result.code==='CONFLICT'?409:422,code:result.code});
  // Finish reading before finally removes the temporary output on fast filesystems.
  return action==='inspect'?result:await readFile(join(directory,'output.bin'));
 }finally{
  await Promise.all(['input.bin','request.json','output.bin'].map(name=>unlink(join(directory,name)).catch(()=>{})));
  await rmdir(directory).catch(()=>{});
 }
}
export const inspectPptPackage=(bytes,type,env=process.env)=>type==='pptx'?invoke('inspect',bytes,null,env):inspectOfficePackage(bytes,type,env);
export const editPptPackage=(bytes,type,command,env=process.env)=>type==='pptx'?invoke('edit',bytes,command,env):editOfficePackage(bytes,type,command,env);
