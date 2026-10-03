import {composeDocument} from './document-intake.js';
import './project-workspace.js';
import {projectPart,clone} from './project-store-client.js';
import {fingerprint} from './expansion-core.js';
import {PROJECT,FIELD_LABELS,GLOBAL_KEYS,freshIntake,fragments,extractLocal,mergeCandidates,conflicts,adoptFact,unitNames,unitParameters,combinedParameters,expansionEvidence,matchLocation,sourceRemoval,removeSource,restoreSource} from './intake-core.js';
import './intake-workbench.css';
import {DECISION_CONDITIONS} from './regional-decision-guide.js';

const H=window.ExpansionHost,L=window.WorkbenchLegacy,W=window.WorkbenchProjects;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state=freshIntake(),store,loading=true,busy=false,ticket=0,selectedUnit=PROJECT,knowledge=null,importSlot=null;
const panel=document.querySelector('#intake-panel'),fileGrid=panel.querySelector('#intake-files');
document.querySelector('#stage2').prepend(panel);
panel.innerHTML=`<h2>建筑与地勘资料</h2>
<div id="intake-files" class="upgrid"></div>
<p hidden id="intake-access" class="intake-access" role="status"></p>
<p hidden id="intake-status" role="status">正在载入项目资料…</p><div id="intake-source-list"></div>
<div id="intake-facts" hidden></div><div id="intake-document-notes" hidden><div id="intake-document-notes-body"></div></div>
<div id="intake-locations" hidden></div><div hidden>
<h3>按单体组织方案</h3><label>当前单体 <select id="intake-unit" aria-label="统一措施当前单体"></select></label> <button id="intake-retrieve">查找相关方法与案例</button> <button id="intake-suggest">AI 提出体系比选建议</button> <button id="intake-open-expansion">进入该单体扩初</button>
<p class="intake-muted">AI 比选会发送本单体已确认信息与检索到的方法、案例片段。历史案例只作为比较依据；采用建议后仍需模型验证。</p><div id="intake-knowledge"></div><div id="intake-suggestions"></div></div>`;
const q=s=>panel.querySelector(s);
q('#intake-files').replaceWith(fileGrid);
fileGrid.querySelectorAll('input[type=file]').forEach(input=>input.addEventListener('click',()=>{input.value='';}));
const importPanel=document.querySelector('#box-yjk')?.closest('.panel-card');
if(importPanel){const title=importPanel.querySelector('h2');if(title)title.textContent='结构模型总信息';const grid=importPanel.querySelector('.upgrid');if(grid)grid.style.gridTemplateColumns='1fr';}
function note(s,kind='info'){const status=q('#intake-status');status.textContent=s;status.dataset.kind=kind;status.hidden=kind!=='error';if(importSlot){const box=q('#box-'+importSlot),label=q('#st-'+importSlot);label.textContent=s;label.setAttribute('role','status');box.dataset.status=kind;}}
const canEdit=()=>!loading&&!W.loading&&!!store&&L.canEditMeasures();
function ensure(){if(!canEdit())throw Error('请先载入项目；统一措施只读或签发状态下不能修改资料');}
function controls(){
  panel.querySelectorAll('button,input,textarea,select').forEach(e=>e.disabled=busy||!canEdit()||(e.hasAttribute('data-plan')&&state.suggestions[selectedUnit]?.signature!==querySignature()));
  q('#intake-access').textContent=loading||W.loading?'正在载入项目，完成后可选择资料文件。':busy?'正在处理资料，请稍候。':L.cardState('c1')===3?'统一措施已签发，资料导入已锁定；请撤回签发后再修改。':canEdit()?'选择建筑或地勘资料后，自动编入扩初说明；可直接编辑正文。':'当前项目资料只读或尚未载入，暂不能导入。';
}
async function api(path,data){const r=await fetch('/api/intake/'+path,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Workbench-Request':'intake'},...(data===undefined?{}:{body:JSON.stringify(data)})});const result=await r.json();if(!r.ok)throw Error(result.error||'处理失败');return result;}
async function save(){if(loading||!store)return;await store.save(state);}
function applyDocumentIdentity(){
 const d=composeDocument(state.sources),next={project_name:d.projectName,region:d.location,...Object.fromEntries(['intensity','pga','eq_group','site_class'].filter(k=>d.parameters[k]).map(k=>[k,d.parameters[k]]))},current=L.params(),previous=state.autoDocumentIdentity||{},updates={};
 for(const [key,value] of Object.entries(next))if(value&&(!current[key]||current[key]==='未命名项目'||current[key]===previous[key])&&current[key]!==value)updates[key]=value;
 if(Object.keys(updates).length){L.adoptParameters(updates);state.autoDocumentIdentity={...previous,...updates};}
}
function publish(){window.dispatchEvent(new CustomEvent('workbuddy:intake-changed',{detail:{projectId:W.id,revision:state.revision}}));}
async function action(run){if(busy)return;try{ensure();busy=true;controls();await run();render();await save();publish();return true;}catch(e){note(e.message,'error');await save().catch(()=>{});return false;}finally{busy=false;controls();}}
function queryUnit(){return {name:selectedUnit,...Object.fromEntries(state.facts.filter(f=>f.status==='confirmed'&&f.unit===selectedUnit).map(f=>[f.key,f.value])),geotechnical:state.facts.filter(f=>f.status==='confirmed'&&f.slot==='geo'&&(f.unit===PROJECT||f.unit===selectedUnit)).map(({key,value,source_id,locator,statement})=>({key,value,source_id,locator,statement}))};}
function querySignature(){return fingerprint({unit:queryUnit(),parameters:L.params()});}
function render(){
  const doc=composeDocument(state.sources);q('#intake-document-notes-body').innerHTML=doc.notes.map(t=>'<p>'+esc(t)+'</p>').join('');q('#intake-document-notes').hidden=true;
  q('#intake-source-list').innerHTML=state.sources.map(s=>`<div class="intake-source-row" data-source-kind="${s.slot==='geo'?'geo':s.slot==='bldg'?'bldg':''}"><details><summary>${esc(s.name)} · ${s.slot==='geo'?'地勘':s.slot==='lookup'?'地点查表':'建筑'} · ${s.fragments.length} 段</summary><p>${esc(s.source_id)}</p><button data-source-ai="${esc(s.source_id)}" ${s.slot==='lookup'?'hidden':''}>AI 重新识别此份资料</button><pre>${esc(s.fragments.map(f=>f.locator+'\n'+f.text).join('\n\n'))}</pre></details><button class="intake-remove" data-remove-source="${esc(s.source_id)}" aria-label="移除资料：${esc(s.name)}">移除资料</button></div>`).join('')||'<p>尚未导入本项目资料。</p>';
  if(state.removedSources?.length)q('#intake-source-list').insertAdjacentHTML('beforeend',`<details><summary>已移除资料（${state.removedSources.length}）· 可恢复</summary>${state.removedSources.map(r=>`<p>${esc(r.name)} <button data-restore-source="${esc(r.id)}">恢复为待确认资料</button></p>`).join('')}<small>恢复后重新核对采用，不自动恢复已确认参数。</small></details>`);
  const conflictIds=new Set(conflicts(state.facts).flatMap(a=>a.map(f=>f.id)));
  q('#intake-facts').innerHTML=state.facts.length?'<div class="intake-table"><table><thead><tr><th>范围／字段</th><th>候选值与采用值</th><th>原文依据</th><th>操作</th></tr></thead><tbody>'+state.facts.map(f=>`<tr data-fact="${f.id}"><td>${esc(f.unit)}<br><b>${esc(f.label)}</b><br>${f.status==='confirmed'?'已采用':f.status==='rejected'?'未采用':'待确认'} ${conflictIds.has(f.id)?'<strong class="intake-conflict">取值冲突</strong>':''}</td><td><textarea data-value aria-label="${esc(f.unit+' '+f.label+'采用值')}">${esc(f.value)}</textarea><input data-reason aria-label="${esc(f.unit+' '+f.label+'修改理由')}" placeholder="更正或解决冲突时填写理由" value="${esc(f.reason||'')}"></td><td><details><summary>${esc(f.filename)} · ${esc(f.locator)}</summary><p>${esc(f.quote)}</p><small>${esc(f.statement)} · ${esc(f.source_id)}</small></details>${f.slot==='lookup'?'<small>内置地点表候选，标准原文及适用版本待核对。</small>':''}</td><td><button data-adopt="${f.id}">${conflictIds.has(f.id)?'按此值解决冲突':'确认采用'}</button><button data-reject="${f.id}">不采用</button></td></tr>`).join('')+'</tbody></table></div>':'<p>导入后显示候选值，不用历史示例填空。</p>';
  q('#intake-locations').innerHTML=state.locationQueries.map((r,i)=>`<div><p>识别地点：${esc(r.text)} ${r.matches.length>1?'· 存在同名地点，请选定':r.matches.length?'':'· 未匹配到区县，请在①地点面板选择城市或具体区县'}</p>${r.matches.map((m,j)=>`<button data-location="${i}:${j}">查询 ${esc(m.label)} 的参数候选</button>`).join('')}</div>`).join('');
  const names=unitNames(state);if(selectedUnit!==PROJECT&&!names.includes(selectedUnit))selectedUnit=PROJECT;
  q('#intake-unit').innerHTML=[PROJECT,...names].map(n=>`<option ${n===selectedUnit?'selected':''}>${esc(n)}</option>`).join('');
  renderKnowledge();renderSuggestions();renderMeasures();refreshGeo();controls();
}
function refreshGeo(){const el=document.querySelector('#gc-res');if(!el)return;const facts=state.facts.filter(f=>f.key==='site_class'&&f.slot==='geo'&&f.status!=='rejected');el.textContent=facts.length?'本项目地勘候选：'+facts.map(f=>f.unit+' '+f.value+'（'+(f.status==='confirmed'?'已采用':'待确认')+'）').join('；')+'。当前公共参数：'+(L.params().site_class||'未采用')+'。请在上方候选表核对原文及适用范围。':'请在②扩初说明导入地勘资料，采用后自动计入统一措施。';}
function renderMeasures(){const paper=document.querySelector('#paper1');if(!paper)return;let section=paper.querySelector('[data-intake-summary]');if(!section){section=document.createElement('section');section.dataset.intakeSummary='true';paper.append(section);}const names=[...new Set([...unitNames(state),...(state.facts.some(f=>f.unit===PROJECT&&f.status==='confirmed'&&DECISION_CONDITIONS.some(([key])=>key===f.key))?[PROJECT]:[])])];section.innerHTML=names.length?'<h1>本项目单体资料与方案采用记录</h1>'+names.map(n=>'<h2>'+esc(n)+'</h2><table><tbody>'+state.facts.filter(f=>f.status==='confirmed'&&f.unit===n).map(f=>'<tr><td>'+esc(f.label)+'</td><td>'+esc(f.value)+'</td><td>'+esc(f.filename+' · '+f.locator)+'</td></tr>').join('')+'</tbody></table>').join(''):'';}
function renderKnowledge(){q('#intake-knowledge').innerHTML=!knowledge?'':`<p>${esc(knowledge.authority)}</p><p>方法检查缺项：${esc(knowledge.missing.map(k=>({name:'单体名称',use:'用途',floors_above:'地上层数',floors_below:'地下层数',structural_height_m:'结构高度',first_floor_height_m:'首层层高',typical_floor_height_m:'标准层层高',plan_length_m:'平面长度',plan_width_m:'平面宽度',typical_span_m:'主要跨度',basement:'地下室条件',irregularity_features:'不规则特征'})[k]||k).join('、')||'已填写所需字段')} ${knowledge.complexCandidate?'· 有复杂结构线索，需专项核对':''}</p>${knowledge.warnings.map(w=>'<p>'+esc(w)+'</p>').join('')}${knowledge.cases.map(c=>`<details><summary>历史案例 ${esc(c.case_id)} · ${esc(c.system)}</summary><p>用途：${esc(c.use||'未登记')}；地点：${esc(c.location?.city||'未登记')}</p><p>${esc(JSON.stringify(c.evidence))}</p><p>仅供比选，不自动带入参数或截面。</p></details>`).join('')}${knowledge.cards.map(c=>`<details><summary>${esc(c.title)} · ${esc(c.review_status)}</summary><p>${esc(c.source_id)}</p><pre>${esc(c.body)}</pre></details>`).join('')}`;}
function renderSuggestions(){const item=state.suggestions[selectedUnit];const stale=item&&item.signature!==querySignature();q('#intake-suggestions').innerHTML=item?`<p>${stale?'资料或参数已变化，请重新生成建议。':'AI 推断 · 待核对采用'}</p>${item.options.map((o,i)=>`<article><h4>${esc(o.system)}</h4><p>${esc(o.reasons.join('；'))}</p><p>待验证：${esc(o.checks.join('；'))}</p><small>${esc(o.source_ids.join('、'))}</small><p><button data-plan="${i}" ${stale?'disabled':''}>采用为该单体体系方案</button></p></article>`).join('')}`:'';}
async function digest(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function ingest(slot,name,blocks,hash){
  const parts=fragments(blocks);if(!parts.length)throw Error('未提取到可读文字，请使用文字版或粘贴摘录');
  // Local import is independent of the model's per-request context limit.
  if(parts.length>30000||new TextEncoder().encode(JSON.stringify(parts)).length>8*1024*1024)throw Error('提取文字超过本地单份资料容量（8MB或30000段），请按章节拆分；原文件未修改');
  const source={source_id:'CURRENT-'+slot+'-'+hash.slice(0,20),name,slot,hash,fragments:parts,blocks,at:new Date().toISOString()};
  if(state.sources.some(s=>s.source_id===source.source_id)){note('该资料版本已经导入，可选择AI重新识别');return;}
  const local=extractLocal(source);mergeCandidates(state,source,local.facts);applyDocumentIdentity();let warnings=local.warnings;

  updateLocations();for(const query of state.locationQueries)if(query.matches.length===1)addLocation(query.matches[0]);const count=state.facts.filter(f=>f.source_id===source.source_id).length;note('已读取「'+name+'」，内容已自动编入扩初说明。'+warnings.join('；'),'success');
}
function addLocation(match){const values=L.locationValues(match),sid='LOOKUP-'+fingerprint(match.label);const source={source_id:sid,name:'工作台内置地点表 · '+match.label,slot:'lookup',hash:fingerprint(values),fragments:[],at:new Date().toISOString()};const facts=Object.entries(values).map(([key,value])=>({id:sid+'-'+key,key,value,label:({intensity:'设防烈度',pga:'地震加速度',eq_group:'地震分组',wind:'基本风压',snow:'基本雪压',snow_zone:'雪荷载分区',temp_low:'最低气温',temp_high:'最高气温'})[key],unit:PROJECT,slot:'lookup',source_id:sid,filename:source.name,locator:match.label+' 表记录',quote:match.label+'：'+key+'='+value,statement:'原文事实（内置表转录，未核规范版本）',status:'candidate'}));source.fragments=facts.map(f=>({id:f.id,text:f.quote,locator:f.locator}));mergeCandidates(state,source,facts);}
function updateLocations(){const found=state.facts.filter(f=>f.key==='region'&&f.status!=='rejected');state.locationQueries=found.map(f=>({text:f.value,source_id:f.source_id,matches:matchLocation(f.value,L.locations())}));}
async function readLegacyDoc(bytes){
  const response=await fetch('/api/intake/read-doc',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Workbench-Request':'intake'},body:bytes,signal:AbortSignal.timeout(90000)});
  const result=await response.json();if(!response.ok)throw Error(result.error||'DOC解析失败');
  const doc=new DOMParser().parseFromString(result.xml,'application/xml');
  if(doc.querySelector('parsererror'))throw Error('DOC解析结果格式异常，请另存为DOCX重试');
  return {paras:[...doc.querySelectorAll('para')].filter(p=>!p.closest('entry')).map(p=>p.textContent),tables:[...doc.querySelectorAll('informaltable,table')].map(t=>[...t.querySelectorAll('row')].map(r=>[...r.querySelectorAll('entry')].map(e=>e.textContent)))};
}
async function readFiles(slot,files){
  if(!files.length||busy)return;
  importSlot=slot;
  try{await action(async()=>{
    const project=W.id;
    for(const file of files){
      note('已选择「'+file.name+'」，正在读取…','busy');
      try{
        if(file.size>30*1024*1024)throw Error('单份资料超过30MB，请拆分');
        const bytes=await file.arrayBuffer();let blocks;
        if(/\.docx?$/i.test(file.name)){const response=await fetch('/api/intake/read-word',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Workbench-Request':'intake','X-Word-Format':/\.doc$/i.test(file.name)?'doc':'docx'},body:bytes});blocks=await response.json();if(!response.ok)throw Error(blocks.error||'Word读取失败');}
        else if(/\.pdf$/i.test(file.name)){note('正在解析「'+file.name+'」的PDF文字，较大报告需要一些时间…','busy');let text;try{text=await H.readPdfJs(file);}catch{text=(await H.readPdf(file)).text;}blocks=H.textBlocks(text||'');}
        else if(/\.(txt|md)$/i.test(file.name))blocks=H.textBlocks(H.decode(bytes));
        else throw Error('支持DOC、DOCX、文字PDF、TXT、MD');
        if(project!==W.id)throw Error('项目已切换，未写入资料');
        await ingest(slot,file.name,blocks,await digest(bytes));
      }catch(e){throw Error('「'+file.name+'」导入失败：'+e.message);}
    }
  });}finally{importSlot=null;}
}
document.addEventListener('change',e=>{const input=e.target.closest('input[data-imp]');if(input&&['bldg','geo'].includes(input.dataset.imp)){e.stopImmediatePropagation();const files=[...input.files];readFiles(input.dataset.imp,files);}},true);

q('#intake-unit').onchange=()=>{selectedUnit=q('#intake-unit').value;state.activeUnit=selectedUnit;save().catch(e=>note(e.message));knowledge=null;renderKnowledge();renderSuggestions();};
q('#intake-retrieve').onclick=()=>action(async()=>{knowledge=await api('knowledge',{parameters:L.params(),unit:queryUnit()});note('已按当前单体查找本地方法与历史案例');});
q('#intake-suggest').onclick=()=>action(async()=>{if(selectedUnit===PROJECT)throw Error('请先确认单体信息并选择单体');const signature=querySignature();note('正在结合当前单体与本地方法提出比选建议…');const result=await api('suggest',{parameters:L.params(),unit:queryUnit(),consent:true});if(signature!==querySignature())throw Error('资料已变化，请重新生成');knowledge=result.knowledge;state.suggestions[selectedUnit]={...result,signature,at:new Date().toISOString()};note('已形成候选方案，请核对建筑条件与待验证事项');});
q('#intake-open-expansion').onclick=()=>action(async()=>{if(!window.ExpansionWorkbench)throw Error('扩初模块尚未就绪');await save();await window.ExpansionWorkbench.selectUnit(selectedUnit);H.goStage(2);});
panel.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.removeSource){
    if(!canEdit())return;
    const plan=sourceRemoval(state,b.dataset.removeSource,L.params());
    const cleared=Object.keys(plan.clear).map(k=>FIELD_LABELS[k]||k);
    const message='移除「'+plan.source.name+'」及其'+plan.facts.length+'项提取记录？\n'+(cleared.length?'以下采用参数将清空为待确认：'+cleared.join('、')+'。\n':'')+(plan.retained.length?'手工修改过的参数保留，请重新核对。\n':'')+'关联成果会标记待复核。原始文件不会删除，可从“已移除资料”恢复。';
    if(!window.confirm(message))return;
    action(async()=>{
      const current=sourceRemoval(state,b.dataset.removeSource,L.params());
      if(Object.keys(current.clear).length)L.adoptParameters(current.clear);
      removeSource(state,current);knowledge=null;updateLocations();
      const input=q('input[data-imp="'+current.source.slot+'"]');if(input)input.value='';
      const box=q('#box-'+current.source.slot),label=q('#st-'+current.source.slot);if(box)delete box.dataset.status;if(label)label.textContent='已移除「'+current.source.name+'」，可选择新资料';
      W.contentChanged('移除资料：'+current.source.name);
      note('已移除「'+current.source.name+'」。现在可选择新的Word文档；已移除资料可恢复。','success');
    });
  }
  if(b.dataset.restoreSource)action(async()=>{restoreSource(state,b.dataset.restoreSource);knowledge=null;updateLocations();W.contentChanged('恢复资料为待确认候选');note('已恢复原文与候选信息，请重新核对采用。','success');});
  if(b.dataset.sourceAi)action(async()=>{const source=state.sources.find(s=>s.source_id===b.dataset.sourceAi);note('AI正在重新识别…');const result=await api('extract',{source,consent:true});mergeCandidates(state,source,result.facts);updateLocations();for(const query of state.locationQueries)if(query.matches.length===1)addLocation(query.matches[0]);note('候选已更新。'+result.warnings.join('；'));});
  if(b.dataset.adopt)action(async()=>{const row=b.closest('tr'),f=state.facts.find(x=>x.id===b.dataset.adopt);const value=row.querySelector('[data-value]').value,reason=row.querySelector('[data-reason]').value;const current=L.params()[f.key];if(f.unit===PROJECT&&(GLOBAL_KEYS.has(f.key)||f.slot==='lookup')&&current&&current!=='未命名项目'&&current!==value&&!reason.trim())throw Error('将替换现有参数，请填写采用理由');const adopted=adoptFact(state,f.id,{value,reason,resolve:true});if(adopted.unit===PROJECT&&(GLOBAL_KEYS.has(adopted.key)||adopted.slot==='lookup'))L.adoptParameters({[adopted.key]:adopted.value});updateLocations();W.contentChanged('采用'+adopted.unit+'的'+adopted.label);note('已采用，统一措施与扩初依据已同步');});
  if(b.dataset.reject)action(async()=>{const f=state.facts.find(x=>x.id===b.dataset.reject);if(f.status==='confirmed')throw Error('已采用项请通过更正值或采用冲突项修改，避免只撤销来源却保留参数');f.status='rejected';state.revision++;updateLocations();note('已标记不采用，原文记录保留');});
  if(b.dataset.location)action(async()=>{const [i,j]=b.dataset.location.split(':').map(Number);addLocation(state.locationQueries[i].matches[j]);note('已生成参数候选；采用前核对标准版本及项目适用性');});
  if(b.dataset.plan!==undefined)action(async()=>{const s=state.suggestions[selectedUnit];if(!s||s.signature!==querySignature())throw Error('资料已变化，请重新生成建议');const o=s.options[+b.dataset.plan],sid='DECISION-'+crypto.randomUUID();const f={id:sid,key:'struct_sys',value:o.system,unit:selectedUnit,label:FIELD_LABELS.struct_sys,slot:'bldg',source_id:sid,filename:'当前单体方案决定',locator:'体系比选',quote:o.reasons.join('；'),statement:'AI推断（人工采用，待模型验证）',status:'candidate'};state.sources.push({source_id:sid,name:f.filename,slot:'bldg',hash:sid,fragments:[{id:'F1',text:f.quote,locator:f.locator}],evidence:o.source_ids});state.facts.push(f);adoptFact(state,sid,{reason:'人工采用本次体系比选建议',resolve:true});W.contentChanged('采用单体体系候选');note('已记录单体方案，后续以当前模型验证');});
});
async function load({remoteOnly=false}={}){const t=++ticket;loading=true;controls();try{const next=projectPart(W.id,'intake',text=>{if(/失败|冲突|未保存|未连接/.test(text))note(text);});const data=await next.load({remoteOnly});if(t!==ticket)return;store=next;state=data||freshIntake();selectedUnit=state.activeUnit||PROJECT;knowledge=null;updateLocations();loading=false;applyDocumentIdentity();render();note(data?'已读取资料并编入扩初说明，可直接编辑正文':'新项目：请先导入建筑与地勘资料');publish();}finally{if(t===ticket){loading=false;controls();}}}
window.WorkbenchIntake={async importBundle(converted,metadata){ensure();if(state.history.some(h=>h.bundle_id===metadata.bundle_id))throw Error('此成果包已导入本项目');for(const s of converted.sources)mergeCandidates(state,s,converted.facts.filter(f=>f.source_id===s.source_id));state.history.push({...metadata,event:'导入已有清洗成果包',unmapped:converted.unmapped,issues:converted.issues,previous_confirmations:converted.confirmations});state.revision++;updateLocations();await save();render();publish();note('清洗成果已进入候选表，请在本项目重新核对采用');},get busy(){return busy},get units(){return [...new Set([...unitNames(state),...composeDocument(state.sources).allUnitNames])]},unitParameters:unit=>combinedParameters(state,unit,L.params()),parameters:unit=>combinedParameters(state,unit,L.params()),evidence:(unit,preview=false)=>({...expansionEvidence(state,unit,L.params(),preview),document:composeDocument(state.sources,unit)}),capture:()=>clone(state),refreshGeo,refresh:()=>{controls();renderMeasures();}};
W.register('intake',{save,load,busy:()=>busy,capture:()=>clone(state)});
window.WorkbenchIntake.saveSeismicGrade=async(unit,values)=>action(async()=>{
 if(!unit||typeof unit!=='string'||unit.length>120||['__proto__','constructor','prototype'].includes(unit))throw Error('单体名称不正确');
 const allowed=['height','structure','basis','category','intensity','pga','site','span','special','frameMomentPercent','coreAsDual','mainFrame','mainWall','basementFixed','basements','reduceSiteI','heightClass','buildingUse','floors'];
 if(Object.keys(values).some(k=>!allowed.includes(k)))throw Error('未知抗震等级字段');
 state.seismicGrades||={};if(state.seismicGrades[unit])state.history.push({event:'更新单体抗震查表条件',unit,previous:{...state.seismicGrades[unit]},at:new Date().toISOString()});state.seismicGrades[unit]={...state.seismicGrades[unit],...values,source_id:'USER-SEISMIC-GRADE-'+W.id+'-'+unit,statement:'我的观点（用户输入）；等级为规范规则推导',updatedAt:new Date().toISOString()};
 state.revision++;W.contentChanged('更新'+unit+'抗震等级查表条件');
});

// Explicit confirmation in the conditions form uses the existing intake partition,
// source history and event bus; it does not create a second parameter store.
window.WorkbenchIntake.confirmDecisionConditions=async(unit,values)=>action(async()=>{
  if(unit!==PROJECT&&!unitNames(state).includes(unit))throw Error('请先确认当前单体');
  const allowed=new Map(DECISION_CONDITIONS.map(([key,label,choices])=>[key,{label,choices}]));
  for(const [key,value] of Object.entries(values)){const field=allowed.get(key);if(!field)throw Error('未知判断条件');if(value&&(Array.isArray(field.choices)?!field.choices.includes(value):!/^\d{4}-\d{2}-\d{2}$/.test(value)))throw Error('判断条件格式不正确');}
  const sid='CURRENT-DECISION-CONDITIONS-'+crypto.randomUUID(),at=new Date().toISOString();
  const source={source_id:sid,name:'人工确认的重难点项目条件',slot:'bldg',hash:sid,at,fragments:[]};
  for(const [key,value] of Object.entries(values)){
    const label=allowed.get(key).label,peers=state.facts.filter(f=>f.unit===unit&&f.key===key&&f.status!=='rejected');
    if(peers.length===1&&peers[0].status==='confirmed'&&peers[0].value===value)continue;
    state.history.push({event:'人工确认判断条件',unit,key,before:peers.map(f=>({id:f.id,value:f.value,status:f.status})),after:value,at});
    peers.forEach(f=>{f.status='rejected';f.rejectionReason='用户在判断条件表中明确更正';});
    if(value){const locator='判断条件表 · '+label,quote=label+'：'+value;source.fragments.push({id:key,locator,text:quote});state.facts.push({id:sid+'-'+key,key,label,value,unit,source_id:sid,filename:source.name,slot:'bldg',locator,quote,statement:'我的观点（用户人工确认）',status:'confirmed',confirmedAt:at});}
  }
  if(source.fragments.length)state.sources.push(source);state.revision++;W.contentChanged('确认重难点项目条件');note('条件已计入统一措施采用记录，并联动重难点判断');
});
window.addEventListener('workbuddy:measures-changed',()=>{if(!loading){renderSuggestions();refreshGeo();controls();}});
document.querySelector('#role-sel')?.addEventListener('change',controls);
window.addEventListener('workbuddy:permissions-changed',controls);
await load();
