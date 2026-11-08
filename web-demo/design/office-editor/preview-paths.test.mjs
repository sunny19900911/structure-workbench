import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,mkdtemp} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {portablePaths} from '../../deploy/portable/runtime.mjs';
test('preview launcher and MCP resolve one isolated data root, with explicit override preserved',async()=>{
 const root=resolve('qa/portable-release/mcp/office-preview-paths');await mkdir(root,{recursive:true});const packageRoot=await mkdtemp(join(root,'package-')),app=join(packageRoot,'app'),home=join(root,'user-home');await mkdir(app);
 assert.equal(portablePaths(app,{LOCALAPPDATA:home}).data,join(home,'StructureWorkbench'));
 await writeFile(join(packageRoot,'data-folder.txt'),'StructureWorkbenchOfficePreview');assert.equal(portablePaths(app,{LOCALAPPDATA:home}).data,join(home,'StructureWorkbenchOfficePreview'));
 assert.equal(portablePaths(app,{LOCALAPPDATA:home,WORKBENCH_PORTABLE_DATA:join(root,'explicit')}).data,join(root,'explicit'));
 await writeFile(join(packageRoot,'data-folder.txt'),'../../wrong');assert.throws(()=>portablePaths(app,{LOCALAPPDATA:home}),/目录设置无效/);
});
