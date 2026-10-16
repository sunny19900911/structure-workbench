import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,rm,access,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,basename,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
const run=promisify(execFile);
export function officeConversionArgs(input,outDir,format,profile){
 const html=/\.html?$/i.test(input),target=format==='docx'?'docx:Office Open XML Text':format;
 return ['-env:UserInstallation='+pathToFileURL(profile).href,'--headless',...(html?['--infilter=HTML (StarWriter)']:[]),'--convert-to',target,'--outdir',outDir,input];
}
export async function officeConvert(input,outDir,format){
 const profile=await mkdtemp(join(tmpdir(),'workbench-office-'));
 try{
  await mkdir(join(profile,'user'));
  await writeFile(join(profile,'user','registrymodifications.xcu'),'<?xml version="1.0" encoding="UTF-8"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item><item oor:path="/org.openoffice.Office.Writer/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>0</value></prop></item></oor:items>');
  await run(process.env.WORKBENCH_SOFFICE||'libreoffice',officeConversionArgs(input,outDir,format,profile),{timeout:90000,maxBuffer:20000});
  const output=join(outDir,basename(input,extname(input))+'.'+format.split(':')[0]);try{await access(output);}catch{throw Error('文档转换未生成 '+format.split(':')[0].toUpperCase()+' 文件，请检查服务器 LibreOffice Writer 组件');}return output;
 }finally{await rm(profile,{recursive:true,force:true});}
}
