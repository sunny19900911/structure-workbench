import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const exec=promisify(execFile);

// Only an uploaded copy is read. Antiword does not run document macros.
export async function extractLegacyDoc(bytes){
  if(bytes.subarray(0,8).toString('hex')!=='d0cf11e0a1b11ae1')throw Error('不是有效的旧版Word DOC文件；请按实际格式另存为DOCX后导入');
  const dir=await mkdtemp(join(tmpdir(),'workbench-doc-')),file=join(dir,'input.doc');
  try{
    await writeFile(file,bytes);
    const {stdout}=await exec(process.env.WORKBENCH_ANTIWORD||(process.platform==='win32'?'C:/Program Files/Git/mingw64/bin/antiword.exe':'antiword'),['-x','db','-m','UTF-8.txt',file],{encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024,windowsHide:true});
    if(!/<para[ >]|<entry[ >]/.test(stdout))throw Error('DOC中未提取到可读正文，可能是扫描图片或加密文件');
    return stdout;
  }catch(e){if(e.code==='ENOENT')throw Error('本机未找到DOC解析器，请配置Antiword或另存为DOCX');throw Error('DOC解析失败，请检查是否加密或损坏，或另存为DOCX重试');}
  finally{await unlink(file).catch(()=>{});await rmdir(dir).catch(()=>{});}
}
