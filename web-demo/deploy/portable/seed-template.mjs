import {readFile, readdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

// Called only while start.mjs owns the service lock. Never merge into an existing library.
export async function initializeBundledTemplate(paths, env, {importArchive} = {}) {
 const marker=join(paths.data,'bundled-template-initialized.json');
 try {await readFile(marker);return {state:'initialized'};} catch(error) {if(error.code!=='ENOENT')throw error;}
 const folder=join(paths.appRoot,'../bundled-template');let manifest;
 try {manifest=JSON.parse(await readFile(join(folder,'manifest.json'),'utf8'));} catch(error) {if(error.code==='ENOENT')return {state:'absent'};throw error;}
 if(manifest.schema!==1||! /^[a-f0-9]{32}$/.test(manifest.projectId)||! /^[a-f0-9]{64}$/.test(manifest.sha256)||manifest.archive!=='default-a.workbench.zip')throw Error('默认模板清单无效');
 const existing=(await readdir(paths.projects)).filter(name=>/^[a-f0-9]{32}$/.test(name));
 if(existing.length)return {state:'existing-projects'};
 const archive=join(folder,manifest.archive),bytes=await readFile(archive);
 if(createHash('sha256').update(bytes).digest('hex')!==manifest.sha256)throw Error('默认模板文件校验失败，请重新完整解压');
 const importer=importArchive||(await import('../../server/portable-projects.mjs')).importProjectArchive;
 const result=await importer(archive,env,{newId:()=>manifest.projectId});
 await writeFile(marker,JSON.stringify({schema:1,projectId:result.projectId,sha256:manifest.sha256,initializedAt:new Date().toISOString()}),{flag:'wx'});
 return {state:'imported',projectId:result.projectId};
}
