// Persistent, isolated manual preview. Never loads the user's project store/config.
import {createServer} from 'vite';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {writePart} from '../../../server/project-store.mjs';
import {officeDocumentApi} from '../../../server/office-document-api.mjs';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const directory=join(root,'qa/portable-release/mcp/office-word-preview');
const env={WORKBENCH_PORTABLE:'1',WORKBENCH_PROJECT_STORE:join(directory,'projects'),WORKBENCH_PYTHON:join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe')};
await mkdir(directory,{recursive:true});
const host='http://127.0.0.1:5391';
const server=await createServer({configFile:false,root:join(root,'dist'),cacheDir:join(directory,'vite-cache'),server:{host:'127.0.0.1',port:5391,strictPort:true},plugins:[officeDocumentApi(env)]});
await server.listen();
let session;
try{session=JSON.parse(await readFile(join(directory,'session.json'),'utf8'));}
catch(error){if(error.code!=='ENOENT')throw error;
 const projectId='c'.repeat(32);
 await writePart(env.WORKBENCH_PROJECT_STORE,projectId,'main',{parameters:{project_name:'Word 人工检查 · 合成教学楼'}},0);
 const response=await fetch(host+'/api/office-documents/'+projectId+'?type=docx',{method:'POST',headers:{'x-workbench-request':'office-documents','x-file-name':encodeURIComponent('扩初说明 · Word 独立预览'),'x-document-unit':encodeURIComponent('合成教学楼')},body:await readFile(join(root,'qa/portable-release/mcp/office/A3双栏测试.docx'))});
 const result=await response.json();if(!response.ok)throw Error(JSON.stringify(result));
 session={projectId,documentId:result.document.documentId};await writeFile(join(directory,'session.json'),JSON.stringify(session,null,2));
}
const url=host+'/office-editor.html?project='+session.projectId+'&document='+session.documentId;
await writeFile(join(directory,'preview.json'),JSON.stringify({url,port:5391,pid:process.pid,dataRoot:directory},null,2));
console.log(url);


