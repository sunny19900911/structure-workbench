import {readFileSync,writeFileSync} from 'node:fs';
const update=(f,fn)=>writeFileSync(f,fn(readFileSync(f,'utf8')));
update('project-workspace.js',s=>s.replace('async function flush(){await save();','async function flush(){if([...modules.values()].some(m=>m.busy?.())||window.CalculationBook?.busy())throw Error(\'正在生成或导入，请完成后再切换项目。\');await save();')
 .replace('await m.load();','await m.load({remoteOnly});')
 .replace('function download(){const data=',"async function download(){let archive;try{archive=await projectRequest('/'+id);}catch{archive={note:'项目库未连接，仅备份本页恢复稿'};}const data=")
 .replace('schema:1,projectId:id,main:capture()', 'schema:1,projectId:id,archive,main:capture()')
 .replace("q('#wp-backup').onclick=download;","q('#wp-backup').onclick=()=>action(download);")
 .replace('async()=>{download();await load(id','async()=>{await download();await load(id')
 .replace('// Initial setup keeps',"window.addEventListener('beforeunload',()=>{save().catch(()=>{});for(const m of modules.values())m.save().catch(()=>{});});\n// Initial setup keeps"));
update('expansion-workbench.js',s=>s.replace("load:()=>{unit='项目整体';return load();},capture", "load:({remoteOnly=false}={})=>{unit='项目整体';return load(remoteOnly);},busy:()=>busy,capture"));
update('calculation-book.js',s=>s.replace('ready:calcbookInit(),','ready:calcbookInit(),busy:()=>calcbookState.exporting,'));
update('design/parallel-tasks/06-ppt-report/prototype.js',s=>s+"\nwindow.addEventListener('beforeunload',()=>{saveDraft().catch(()=>{});});\n");
