import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)),qa=join(root,'qa/portable-release/blackbox');let projectId=JSON.parse(await readFile(join(qa,'browser-result.json'),'utf8')).projectId;
if(process.argv.includes('--baseline-replay')){
 const path=join(qa,'旧实现复现-'+Date.now());await mkdir(path);
 projectId=(await(await fetch('http://127.0.0.1:5460/api/launcher/select',{method:'POST',headers:{'Content-Type':'application/json','X-Workbench-Request':'launcher'},body:JSON.stringify({path})})).json()).projectId;
}
const {chromium}=await import(pathToFileURL(join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage(),report={};
if(process.argv.includes('--candidate'))await page.route('**/project-legacy-adapter.js',async route=>{
 const response=await route.fetch(),body=await response.text();
 const old="return !!cOf(id)&&cardVisible(cOf(id))&&!['看','—'].includes(permOf(cOf(id)))&&stOf(id)!==3;";
 if(!body.includes(old))throw Error('候选替换的原实现已变化');
 const next="const card=cOf(id);return !!card&&(cardVisible(card)||(window.WORKBENCH_PORTABLE&&id==='c11'&&card.stage.includes(PSTAGE)))&&!['看','—'].includes(permOf(card))&&stOf(id)!==3;";
 await route.fulfill({response,body:body.replace(old,next)});
});
if(process.argv.includes('--baseline-replay'))await page.route('**/project-legacy-adapter.js',async route=>{
 const response=await route.fetch(),body=await response.text();
 const next="const card=cOf(id);return !!card&&(cardVisible(card)||(window.WORKBENCH_PORTABLE&&id==='c11'&&card.stage.includes(PSTAGE)))&&!['看','—'].includes(permOf(card))&&stOf(id)!==3;";
 if(!body.includes(next))throw Error('回放匹配失败');
 await route.fulfill({response,body:body.replace(next,"return !!cOf(id)&&cardVisible(cOf(id))&&!['看','—'].includes(permOf(cOf(id)))&&stOf(id)!==3;")});
});
async function flags(){return page.evaluate(()=>({main:WorkbenchProjects.mcp.dirty,intake:WorkbenchIntake.mcp.dirty,expansion:ExpansionWorkbench.mcp.dirty,modules:WorkbenchModules.mcp.dirty,ppt:WorkbenchModules.mcp.ppt?.dirty,version:WorkbenchProjects.parameterVersion,canEditPpt:WorkbenchLegacy.canEdit('c11'),role:WorkbenchLegacy.role(),pptCard:WorkbenchLegacy.cardState('c11'),pptSnapshot:document.querySelector('#im-ppt-frame')?.contentWindow.__qaSnapshot?.context,pptRevision:WorkbenchModules.mcp.ppt?.revision}));}
try{
 await page.addInitScript(()=>window.addEventListener('message',e=>{if(e.data?.type==='workbuddy:measure-snapshot')window.__qaSnapshot=e.data;}));
 await page.goto('http://127.0.0.1:5460/workbuddy-integrated-studio.html?project='+projectId);await page.waitForFunction(()=>window.WorkbenchProjects?.id&&!WorkbenchProjects.loading&&window.WorkbenchOffice,{timeout:90000});await page.evaluate(()=>WorkbenchProjects.flush());report.before=await flags();
 report.generated=await page.evaluate(()=>WorkbenchOffice.generate());report.afterGenerate=await flags();await page.evaluate(()=>WorkbenchProjects.flush());report.afterSave=await flags();
 report.differences=await page.evaluate(async()=>{
  const values={main:WorkbenchProjects.mcp.capture(),intake:WorkbenchIntake.capture(),[ExpansionWorkbench.mcp.part]:ExpansionWorkbench.capture()};
  const diff=(a,b,path='')=>{if(JSON.stringify(a)===JSON.stringify(b))return [];if(a&&b&&typeof a==='object'&&typeof b==='object')return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(k=>diff(a[k],b[k],path+'/'+k));return [{path,current:typeof a==='string'?a.slice(0,100):a,saved:typeof b==='string'?b.slice(0,100):b}];};
  const result={};for(const [part,value]of Object.entries(values)){const {record}=await(await fetch('/api/workbench-projects/'+WorkbenchProjects.id+'/'+part)).json();result[part]=diff(value,record?.data);}
  result.ppt=WorkbenchModules.mcp.ppt?.read();return result;
 });console.log(JSON.stringify({before:report.before,afterGenerate:report.afterGenerate,afterSave:report.afterSave,differences:Object.fromEntries(Object.entries(report.differences).filter(([k])=>k!=='ppt'))},null,2));
}catch(e){report.error=e.stack;console.error(e.message);process.exitCode=1;}finally{report.projectId=projectId;report.mode=process.argv.includes('--baseline-replay')?'旧实现仅在QA浏览器响应回放':process.argv.includes('--candidate')?'候选仅在QA浏览器响应替换':'当前源码';await writeFile(join(qa,'office-state-'+(process.argv.includes('--baseline-replay')?'baseline-replay':process.argv.includes('--candidate')?'candidate':'fixed')+'-'+Date.now()+'.json'),JSON.stringify(report,null,2),{flag:'wx'});await browser.close();}
