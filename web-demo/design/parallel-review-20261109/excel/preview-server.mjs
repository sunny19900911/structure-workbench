// Actual Office entry + native document API, entirely inside this worktree's QA store.
import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {writePart,readPart} from '../../../server/project-store.mjs';
import {officeDocumentApi} from '../../../server/office-document-api.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const qa=resolve(root,'qa/parallel-review-20261109/excel');
const projectId='e'.repeat(32),store=join(qa,'projects');
await mkdir(qa,{recursive:true});
if(!await readPart(store,projectId,'main'))await writePart(store,projectId,'main',{parameters:{project_name:'Excel隔离验收',height:'24',intensity:'7'},parameterVersion:1},0);
const server=await createServer({root,configFile:false,envDir:false,cacheDir:join(qa,'vite-cache'),plugins:[officeDocumentApi({WORKBENCH_PORTABLE:'1',WORKBENCH_PROJECT_STORE:store})],server:{host:'127.0.0.1',port:5443,strictPort:true,watch:{ignored:['**/qa/**']}}});
await server.listen();
await writeFile(join(qa,'server.json'),JSON.stringify({pid:process.pid,projectId,store,url:'http://127.0.0.1:5443'},null,2));
console.log('Excel QA: http://127.0.0.1:5443 · '+qa);
