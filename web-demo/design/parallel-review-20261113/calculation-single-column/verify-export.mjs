import {createServer} from 'vite';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const qa=join(root,process.env.CALCBOOK_QA_DIRECTORY||'qa/portable-release/calculation-single-column-20261113');
await mkdir(qa,{recursive:true});
const runtime='C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1104-2876-0_26.1104.2876.0_x64__3k8sg7r9htsxt/dependencies';
const env={WORKBENCH_PORTABLE:'1',WORKBENCH_DATABASE_ROOT:qa,WORKBENCH_PROJECT_STORE:join(qa,'projects'),WORKBENCH_CACHE_ROOT:join(qa,'cache'),CALCBOOK_SOURCE_DIR:join(qa,'sources'),CALCBOOK_PYTHON:join(runtime,'python/python.exe')};
Object.assign(process.env,env);
const {calculationBookLocalApi}=await import('../../../vite.config.js');
const server=await createServer({root,configFile:false,cacheDir:join(qa,'vite-cache'),server:{host:'127.0.0.1',port:5488,strictPort:true},plugins:[calculationBookLocalApi(env)]});
try{
 await server.listen();
 const previous=JSON.parse(await readFile(join(root,'qa/portable-release/calculation-cover-20261112/browser-report.json'),'utf8'));
 const payload={...previous.exportPayload,project_id:'e1111111111111111111111111111113',software_version:'QA-9.9',out_files:['WMASS.OUT','WDISP.OUT','WZQ.OUT'].map(name=>({name,content_base64:Buffer.from(name+'\nQA_SINGLE_COLUMN_20261113\n模型原文内容保留。\n').toString('base64')}))};
 if(Object.hasOwn(process.env,'CALCBOOK_QA_COMPANY'))payload.company=process.env.CALCBOOK_QA_COMPANY;
 const response=await fetch('http://127.0.0.1:5488/api/calculation-book/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
 if(!response.ok)throw Error(await response.text());
 const path=join(qa,process.env.CALCBOOK_QA_FILENAME||'计算书-原Word封面-目录及内容单栏.docx');
 await writeFile(path,Buffer.from(await response.arrayBuffer()));
 await writeFile(join(qa,'export-payload.json'),JSON.stringify(payload,null,2));
 console.log(JSON.stringify({path,status:response.status}));
}finally{await server.close();}
