import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {initializeBundledTemplate} from '../../deploy/portable/seed-template.mjs';
const id='a'.repeat(32);
async function fixture(){
 const root=resolve('qa/portable-release/package-20261115/seed-check');await mkdir(root,{recursive:true});
 const dir=await mkdtemp(join(root,'case-')),paths={appRoot:join(dir,'app'),data:join(dir,'data'),projects:join(dir,'data/projects')};
 await mkdir(paths.projects,{recursive:true});await mkdir(join(dir,'bundled-template'));
 const content=Buffer.from('fixture'),sha256=createHash('sha256').update(content).digest('hex');
 await writeFile(join(dir,'bundled-template/default-a.workbench.zip'),content);
 await writeFile(join(dir,'bundled-template/manifest.json'),JSON.stringify({schema:1,projectId:id,archive:'default-a.workbench.zip',sha256}));
 return {dir,paths};
}
test('empty data imports once; marker prevents restoring a deliberately removed template',async()=>{
 const {paths}=await fixture();let calls=0;
 const importArchive=async(file,env,{newId})=>{calls++;return {projectId:newId()};};
 assert.equal((await initializeBundledTemplate(paths,{}, {importArchive})).state,'imported');
 assert.equal((await initializeBundledTemplate(paths,{}, {importArchive})).state,'initialized');assert.equal(calls,1);
});
test('existing project library is untouched',async()=>{
 const {paths}=await fixture();await mkdir(join(paths.projects,'b'.repeat(32)));
 assert.equal((await initializeBundledTemplate(paths,{}, {importArchive:()=>{throw Error('must not import');}})).state,'existing-projects');
});
test('corrupt archive is rejected before import or marker creation',async()=>{
 const {dir,paths}=await fixture();await writeFile(join(dir,'bundled-template/default-a.workbench.zip'),'broken');
 await assert.rejects(initializeBundledTemplate(paths,{}, {importArchive:()=>{throw Error('must not import');}}),/校验失败/);
 await assert.rejects(readFile(join(paths.data,'bundled-template-initialized.json')),{code:'ENOENT'});
});
