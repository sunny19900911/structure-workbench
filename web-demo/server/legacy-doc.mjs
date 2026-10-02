import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const exec=promisify(execFile);

export function legacyDocCopy(bytes){
  if(bytes.length<512||bytes.subarray(0,8).toString('hex')!=='d0cf11e0a1b11ae1')throw Error('不是有效的旧版Word DOC文件；请按实际格式另存为DOCX后导入');
  const version=bytes.readUInt16LE(26),shift=bytes.readUInt16LE(30);
  if(!((version===3&&shift===9)||(version===4&&shift===12)))throw Error('DOC复合文件头格式不受支持，请另存为DOCX后导入');
  // Some readable DOCs have trailing metadata outside a complete CFB sector.
  // Antiword rejects their length. Pad the temporary copy; never truncate input.
  const sectorSize=2**shift,padding=(sectorSize-bytes.length%sectorSize)%sectorSize;
  return padding?Buffer.concat([bytes,Buffer.alloc(padding)]):bytes;
}

// Only an uploaded copy is read. The Word compatibility reader disables macros.
export async function extractLegacyDoc(bytes){
  const copy=legacyDocCopy(bytes);
  if(copy!==bytes&&process.platform!=='win32')throw Error('此DOC需Microsoft Word兼容读取，请先另存为DOCX副本后导入');
  const dir=await mkdtemp(join(tmpdir(),'workbench-doc-')),file=join(dir,'input.doc');
  try{
    // Padding alone makes Antiword accept some files while losing body text.
    // For non-aligned Windows DOCs use Word on the unmodified uploaded copy.
    if(copy!==bytes&&process.platform==='win32'){
      await writeFile(file,bytes);
      try{
        await exec('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./legacy-doc-word.ps1',import.meta.url)),'-InputDoc',file,'-OutputDocx',join(dir,'copy.docx'),'-OutputXml',join(dir,'body.xml')],{timeout:60000,maxBuffer:1024*1024,windowsHide:true});
        const xml=await readFile(join(dir,'body.xml'),'utf8');
        if(!/<para[ >]|<entry[ >]/.test(xml))throw Error('No readable body');
        return xml;
      }catch{throw Object.assign(Error('DOC格式需本机Microsoft Word兼容读取；请检查Word是否可用，或另存为DOCX副本后导入'),{code:'WORD_DOC_FALLBACK'});}
    }
    await writeFile(file,copy);
    const {stdout}=await exec(process.env.WORKBENCH_ANTIWORD||(process.platform==='win32'?'C:/Program Files/Git/mingw64/bin/antiword.exe':'antiword'),['-x','db','-m','UTF-8.txt',file],{encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024,windowsHide:true});
    if(!/<para[ >]|<entry[ >]/.test(stdout))throw Error('DOC中未提取到可读正文，可能是扫描图片或加密文件');
    return stdout;
  }catch(e){if(e.code==='WORD_DOC_FALLBACK')throw e;if(e.code==='ENOENT')throw Error('本机未找到DOC解析器，请配置Antiword或另存为DOCX');throw Error('DOC解析器无法读取此文件，可能是格式兼容、加密或损坏；可用Word另存为DOCX副本后重试');}
  finally{for(const name of ['input.doc','copy.docx','body.xml'])await unlink(join(dir,name)).catch(()=>{});await rmdir(dir).catch(()=>{});}
}
