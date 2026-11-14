import {realpath,stat,readdir,mkdir,writeFile} from 'node:fs/promises';
import {join,basename,extname,isAbsolute,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {readPart,writePart,validProjectId} from './project-store.mjs';

export const OUTPUT_FOLDER='工作台成果';
const blocked=/(?:^|[\\/])(?:\.ssh|\.aws|\.config|00-key|03_盈建科参数导出样本|工作台成果)(?:[\\/]|$)/i;
const extensions=new Set(['.doc','.docx','.pdf','.out','.txt','.csv','.xlsx','.pptx','.png','.jpg','.jpeg']);
const canonical=p=>process.platform==='win32'?p.toLowerCase():p;
export async function projectFolder(paths,projectId){
 if(!validProjectId(projectId))throw Error('项目编号无效');
 const binding=(await readPart(paths.projects,projectId,'folder-binding'))?.data;
 if(!binding)return null;
 if(typeof binding.inputPath!=='string'||!isAbsolute(binding.inputPath)||blocked.test(binding.inputPath))throw Error('项目目录关联无效');
 // A backup imported as a new project must not inherit permission to write to the original folder.
 if(createHash('sha256').update(canonical(binding.inputPath)).digest('hex').slice(0,32)!==projectId)return null;
 return binding;
}
export async function bindProjectFolder(paths,input){
 if(typeof input!=='string'||!isAbsolute(input)||blocked.test(input))throw Error('请选择工程资料的绝对目录，不能选择成果或凭据目录');
 const folder=await realpath(input);
 if(blocked.test(folder)||!(await stat(folder)).isDirectory())throw Error('项目文件夹不可用');
 const projectId=createHash('sha256').update(canonical(folder)).digest('hex').slice(0,32);
 const old=await projectFolder(paths,projectId);
 if(old&&canonical(old.inputPath)!==canonical(folder))throw Error('目录关联不一致，未覆盖');
 if(!old){
  if(await readPart(paths.projects,projectId,'main'))throw Error('此项目编号已被使用，未覆盖');
  try{await writePart(paths.projects,projectId,'folder-binding',{inputPath:folder,name:basename(folder),source_id:'USER-BLACKBOX-FOLDER',schema:1},0);}catch(e){if(e.status!==409)throw e;}
 }
 if((await readPart(paths.projects,projectId,'lifecycle'))?.data.deleted)throw Error('此目录对应的项目已删除，请在工作台恢复后再选择');
 if(!await readPart(paths.projects,projectId,'main')){
  // Only identity is seeded. Existing WorkbenchLegacy.apply supplies the shared blank template.
  try{await writePart(paths.projects,projectId,'main',{mode:'blank',parameters:{project_name:basename(folder)},parameterVersion:0},0);}catch(e){if(e.status!==409)throw e;}
 }
 const output=await outputDirectory(folder);
 return {projectId,...await projectFolder(paths,projectId),outputPath:output};
}
async function outputDirectory(input){
 const current=await realpath(input);
 if(canonical(current)!==canonical(resolve(input)))throw Error('项目目录位置已变化，请重新选择');
 const output=join(current,OUTPUT_FOLDER);await mkdir(output,{recursive:true});
 if(canonical(await realpath(output))!==canonical(output))throw Error('成果目录不能是链接或重定向目录');
 return output;
}
export async function scanProjectFolder(paths,projectId){
 const binding=await projectFolder(paths,projectId);if(!binding)throw Error('项目尚未关联输入文件夹');
 const root=await realpath(binding.inputPath);if(canonical(root)!==canonical(binding.inputPath))throw Error('输入目录已变化');
 const files=[];let truncated=false,visited=0;
 async function walk(dir,depth=0){
  if(depth>8){truncated=true;return;}
  for(const item of await readdir(dir,{withFileTypes:true})){
   if(++visited>10000||files.length>=1000){truncated=true;return;}
   if(item.isSymbolicLink()||item.name.startsWith('.')||item.name===OUTPUT_FOLDER||/(key|secret|token|password|密钥|密码)/i.test(item.name))continue;
   const path=join(dir,item.name);if(blocked.test(path))continue;
   if(item.isDirectory())await walk(path,depth+1);
   else if(item.isFile()&&extensions.has(extname(path).toLowerCase()))files.push({name:item.name,path,bytes:(await stat(path)).size});
  }
 }
 await walk(root);return {projectId,inputPath:root,files,truncated,note:'只列出资料文件；未导入或确认工程参数。'};
}
export async function writeProjectArtifact(paths,bytes,filename,mime,{projectId,batchId}={}){
 const binding=projectId?await projectFolder(paths,projectId):null;
 const safe=basename(String(filename||'成果')).replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,140);
 const batch=batchId&&/^[a-f0-9]{32}$/.test(batchId)?batchId:new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8);
 const directory=binding?join(await outputDirectory(binding.inputPath),batch):join(paths.data,'exports','MCP',new Date().toISOString().slice(0,10));
 await mkdir(directory,{recursive:true});
 if(binding&&canonical(await realpath(directory))!==canonical(directory))throw Error('批次目录不能重定向');
 const file=join(directory,randomUUID().slice(0,8)+'-'+safe);await writeFile(file,bytes,{flag:'wx'});
 return {path:file,filename:safe,mime,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),...(binding?{projectId,batchId:batch}: {})};
}
