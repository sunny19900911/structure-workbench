import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {existsSync,readFileSync} from 'node:fs';

export const RELEASE='2026.11.09-geotech-preview.1';
export function portablePaths(appRoot,ambient=process.env){
 const home=ambient.LOCALAPPDATA||join(homedir(),'AppData','Local');
 let dataFolder='StructureWorkbench';
 try{const folder=readFileSync(join(appRoot,'../data-folder.txt'),'utf8').trim();if(!/^[A-Za-z][A-Za-z0-9_-]{0,60}$/.test(folder))throw Error('本机数据目录设置无效');dataFolder=folder;}catch(e){if(e.code!=='ENOENT')throw e;}
 const data=resolve(ambient.WORKBENCH_PORTABLE_DATA||join(home,dataFolder));
 const runtime=resolve(appRoot,'../runtime');
 return {appRoot:resolve(appRoot),data,runtime,projects:join(data,'projects'),uploads:join(data,'calculation-uploads'),cache:join(data,'cache'),preferences:join(data,'preferences.json')};
}
export function portableEnvironment(paths){
 const python=join(paths.runtime,'python','python.exe'),poppler=join(paths.runtime,'poppler','bin');
 return {
  WORKBENCH_PORTABLE:'1',WORKBENCH_DATABASE_ROOT:paths.data,WORKBENCH_PROJECT_STORE:paths.projects,
  CALCBOOK_UPLOAD_DIR:paths.uploads,CALCBOOK_SOURCE_DIR:join(paths.data,'calculation-sources'),
  WORKBENCH_CACHE_ROOT:paths.cache,WORKBENCH_PYTHON:python,CALCBOOK_PYTHON:python,
  WORKBENCH_PDFINFO:join(poppler,'pdfinfo.exe'),WORKBENCH_PDFTOPPM:join(poppler,'pdftoppm.exe'),
  // The portable build must never discover a developer's external credentials or library.
  IMA_BRIDGE_MODULE:join(paths.data,'optional-ima-not-configured.mjs'),
  EXPANSION_STORE_DIR:join(paths.data,'legacy-expansion'),PYTHONUTF8:'1'
 };
}
export function validateRuntime(env){
 for(const key of ['WORKBENCH_PYTHON','WORKBENCH_PDFINFO','WORKBENCH_PDFTOPPM'])if(!existsSync(env[key]))throw Error('运行组件不完整，请完整解压离线包后重新启动：'+key);
}
export function portableHTML(html,pathname){
 const scripts='<script>window.WORKBENCH_PORTABLE=true;window.WORKBENCH_PORTABLE_VERSION='+JSON.stringify(RELEASE)+';</script>';
 return html.replace(/<head\b[^>]*>/i,tag=>tag+scripts);
}
