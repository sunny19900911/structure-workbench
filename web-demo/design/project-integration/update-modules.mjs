import {readFileSync,writeFileSync} from 'node:fs';
const update=(file,fn)=>{const before=readFileSync(file,'utf8');writeFileSync(file,fn(before),'utf8');};
update('expansion-workbench.js',s=>{
 const start=s.indexOf('function cacheKey()'),end=s.indexOf('function changed(',start);
 s=s.slice(0,start)+`function saveSoon(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>save().catch(e=>notice(e.message)),650);}
function save(){clearTimeout(saveTimer);if(!state||loading||!store)return Promise.resolve();saveQueue=store.save(state);return saveQueue;}
`+s.slice(end);
 s=s.replace("localStorage.setItem('expansion-v2-unit',unit);",'');
 const a=s.indexOf('async function load(remoteOnly=false)'),b=s.indexOf("document.addEventListener('change'",a);
 s=s.slice(0,a)+`async function load(remoteOnly=false){
  clearTimeout(saveTimer);clearTimeout(paramTimer);const ticket=++loadTicket;loading=true;const who=identity();
  id=window.WorkbenchProjects.id+':'+unit;store=projectPart(window.WorkbenchProjects.id,'expansion-'+fingerprint(unit).padStart(8,'0'),notice);
  const next=await store.load({remoteOnly});if(ticket!==loadTicket)return;
  state=next||createState(who);state.identity=who;loading=false;
  const current=H.params(),version=window.WorkbenchProjects.parameterVersion;
  if(!state.signed&&(fingerprint(current)!==fingerprint(state.parameters)||state.measuresVersion!==version)){state.parameters=current;state.parametersConfirmed=false;state.measuresVersion=version;changed('载入后核对当前参数版本');}
  q('#ev-unit').value=unit;renderFacts();renderRegs();renderModel();refreshSections();notice(next?'已载入当前项目/单体草稿。':'新稿已就绪：请导入并确认当前资料。');
}
function syncParams(){if(!state||loading)return;const current=H.params(),version=window.WorkbenchProjects.parameterVersion;if(state.signed){if(fingerprint(current)!==fingerprint(state.parameters)||state.measuresVersion!==version)notice('统一措施已变化；当前保留签发快照，撤回后才能更新。');return;}
 if(fingerprint(current)!==fingerprint(state.parameters)||state.measuresVersion!==version){const keys=Object.keys({...state.parameters,...current}).filter(k=>fingerprint(current[k])!==fingerprint(state.parameters[k]));state.parameters=current;state.identity=identity();state.parametersConfirmed=false;state.measuresVersion=version;changed('统一措施依据变更',keys.length?keys:null);notice('参数引用已更新；人工稿保留，关联正文需复核。');}}
function paramsChanged(){clearTimeout(paramTimer);paramTimer=setTimeout(syncParams,350);}
`+s.slice(b);
 s=s.replace('await load();\n',`await load();
window.WorkbenchProjects.register('expansion',{save:()=>{syncParams();return save();},load:()=>{unit='项目整体';return load();},capture:()=>clone(state)});
`);
 return s;
});
update('expansion-core.js',s=>s.replace('identity:s.identity,parameters:s.parameters','identity:s.identity,measuresVersion:s.measuresVersion,parameters:s.parameters'));
update('workbuddy-integrated-studio.html',s=>s.replace('CARDS.forEach(function(c){\n    const ok=cardVisible(c)',"CARDS.forEach(function(c){\n    if(c.id==='c7'||c.id==='c8')return;\n    const ok=cardVisible(c)").replace('CARDS.forEach(function(c){\r\n    const ok=cardVisible(c)',"CARDS.forEach(function(c){\r\n    if(c.id==='c7'||c.id==='c8')return;\r\n    const ok=cardVisible(c)"));
update('calculation-book.js',s=>{
 s=s.replace("items: ['穿层柱计算书']","items: []");
 s=s.replace("try { localStorage.setItem(CALCBOOK_KEY, JSON.stringify(calcbookState.sections)); } catch (_) {}","window.WorkbenchProjects?.scheduleSave();");
 s=s.replaceAll('calcbookLoadSaved() || calcbookCloneSections(calcbookState.defaults)','calcbookFallbackSections()');
 s=s.replace("calcbookParam('designer', '同济大学建筑设计研究院（集团）有限公司')","calcbookParam('designer', '待填写设计单位')");
 s=s.replace('async function calcbookLoadSheet() {','let calcbookLoadTicket=0;\nasync function calcbookLoadSheet() {\n  const ticket=++calcbookLoadTicket,project=window.WorkbenchProjects?.id;');
 s=s.replace('calcbookState.sheetData = payload;','if(ticket!==calcbookLoadTicket||project!==window.WorkbenchProjects?.id)return;\n    calcbookState.sheetData = payload;');
 s=s.replace('calcbookState.edits[key][cell.dataset.cell] = cell.textContent.trim();','calcbookState.edits[key][cell.dataset.cell] = cell.textContent.trim();\n      calcbookSave();');
 s=s.replace('async function calcbookReadOutFiles(files) {','async function calcbookReadOutFiles(files) {\n  const project=window.WorkbenchProjects?.id;');
 s=s.replace('calcbookState.outFiles = await Promise.all','const loadedFiles = await Promise.all');
 s=s.replace("  const list = document.getElementById('calcbook-out-list');","  if(project!==window.WorkbenchProjects?.id)return;\n  calcbookState.outFiles=loadedFiles;calcbookSave();calcbookRenderOutFiles();\n  calcbookResetConfirmation();\n}\nfunction calcbookRenderOutFiles(){\n  const list = document.getElementById('calcbook-out-list');");
 s=s.replace(/calcbookInit\(\);\s*$/,`window.CalculationBook={
 ready:calcbookInit(),
 capture(){return JSON.parse(JSON.stringify({sections:calcbookState.sections,edits:calcbookState.edits,linkedExcel:calcbookState.linkedExcel,outFiles:calcbookState.outFiles,workbookKey:calcbookState.workbookKey,sheetName:calcbookState.sheetName}));},
 async loadProject(saved,mode){
  ++calcbookLoadTicket;const data=saved||{};
  calcbookState.sections=calcbookNormalizeSections(data.sections||(mode==='sample'?calcbookState.defaults:calcbookFallbackSections()));
  calcbookState.edits=data.edits||{};calcbookState.linkedExcel=data.linkedExcel||null;calcbookState.outFiles=data.outFiles||[];
  calcbookState.workbookKey=data.workbookKey||calcbookState.workbooks[0]?.key||'';calcbookState.sheetData=null;
  document.getElementById('calcbook-workbook').value=calcbookState.workbookKey;
  const sheets=calcbookState.workbooks.find(w=>w.key===calcbookState.workbookKey)?.sheets||[];
  document.getElementById('calcbook-sheet').innerHTML=sheets.map(s=>'<option value="'+calcbookEsc(s.name)+'">'+calcbookEsc(s.name)+'</option>').join('');
  calcbookState.sheetName=data.sheetName||sheets[0]?.name||'';document.getElementById('calcbook-sheet').value=calcbookState.sheetName;
  calcbookRenderCatalog();calcbookRenderOutFiles();calcbookResetConfirmation();
  document.getElementById('calcbook-excel-link').textContent=calcbookState.linkedExcel?'已联动':'联动到计算书';
  await calcbookLoadSheet();
 },invalidate:calcbookResetConfirmation
};
`);
 return s;
});
