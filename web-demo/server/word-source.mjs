import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir,homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {legacyDocCopy} from './legacy-doc.mjs';
const run=promisify(execFile);
export async function readWordSource(bytes,legacy=false){
 const dir=await mkdtemp(join(tmpdir(),'workbench-word-source-'));
 try{
  if(legacy){legacyDocCopy(bytes);await writeFile(join(dir,'input.doc'),bytes);await run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./legacy-doc-word.ps1',import.meta.url)),'-InputDoc',join(dir,'input.doc'),'-OutputDocx',join(dir,'input.docx'),'-OutputXml',join(dir,'body.xml')],{windowsHide:true,timeout:90000,maxBuffer:10000});}
  else await writeFile(join(dir,'input.docx'),bytes);
  const python=process.env.WORKBENCH_PYTHON||join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
  await run(python,[fileURLToPath(new URL('./word-source.py',import.meta.url)),join(dir,'input.docx'),join(dir,'result.json')],{windowsHide:true,timeout:60000,maxBuffer:10000});
  return JSON.parse(await readFile(join(dir,'result.json'),'utf8'));
 }finally{for(const name of ['input.doc','input.docx','body.xml','result.json'])await unlink(join(dir,name)).catch(()=>{});await rmdir(dir).catch(()=>{});}
}
