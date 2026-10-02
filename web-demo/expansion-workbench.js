import {irregularityCategories,irregularityAnswer,measureDraft,setIrregularityAnswer,setMeasureDraft,chooseMeasure} from './irregularity-library.js';
import {lineSource,tableSource,parameterSource,selectionParts} from './report-provenance.js';
import {ensureDurabilityMeasures} from './reference-measures.js';
import {imageSlots,sectionBlocks,blocksHTML,nativeTableHTML,reportTable} from './reference-report.js';
import {cleanDocumentText} from './document-intake.js';
import {defaultExpansion} from './default-expansion.js';
import './project-workspace.js';
import './intake-workbench.js';
import {projectPart} from './project-store-client.js';
import './expansion-workbench.css';
import {SECTIONS,LABELS,createState,fingerprint,dependencies,requestStamp,isCurrent,tokens,resolveText,references,validateDraft,scaffold,issues,checkMetric,modelBatch,signalEvidence,reportTables} from './expansion-core.js';

const H=window.ExpansionHost;
const currentParameters=()=>window.WorkbenchIntake.parameters(unit);
if(!H)throw Error('扩初说明主页面适配器未加载');
const q=(s,root=document)=>root.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uuid=()=>crypto.randomUUID();
const clone=x=>JSON.parse(JSON.stringify(x));
let state,id,unit='项目整体',busy=false,loading=true,saveTimer,saveQueue=Promise.resolve(),loadTicket=0,paramTimer,store;
const savedRevisions=new Map(),blockedSaves=new Set();
let imageSlot='';
async function pictureData(file){
 if(!['image/png','image/jpeg'].includes(file.type)||file.size>12*1024*1024)throw Error('请选择12MB以内的PNG或JPG图片');
 const bitmap=await createImageBitmap(file),scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
 const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
 const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();return canvas.toDataURL('image/jpeg',.86);
}
function renderImagePanel(){const host=q('#ev-images');if(!host||!state)return;host.innerHTML=imageSlots(state).map(slot=>`<div class="ev-row"><input aria-label="${esc(slot.caption)}图名" data-image-caption="${esc(slot.id)}" value="${esc(state.reportImages?.[slot.id]?.caption||slot.caption)}" style="flex:1;min-width:220px"><button data-image-upload="${esc(slot.id)}" data-ev-write>${state.reportImages?.[slot.id]?.data||slot.data?'替换图片':'上传图片'}</button><small>${state.reportImages?.[slot.id]?.data?'已上传':slot.data?'地勘原图':''}</small></div>`).join('');}
function editNationalList(){if(!ensureEdit())return;const rows=reportTable(state,'national').rows.slice(1).map(r=>r.values.join('\t')).join('\n');modal('国家规范表 · 每行名称和编号用制表符分隔',`<textarea id="ev-national-list" style="width:100%;min-height:340px">${esc(rows)}</textarea>`,[{label:'保存并写入正文',primary:true,run:()=>{state.referenceNorms??={};state.referenceNorms.national=q('#ev-national-list').value.split('\n').filter(x=>x.trim()).map(x=>{const [name,...code]=x.split('\t');return [name.trim(),code.join(' ').trim()];});changed('编辑国家规范表');dialog.close();}}]);}
const paper=q('#paper2');paper.classList.add('ev-workspace');
const dialog=document.createElement('dialog');dialog.className='ev-dialog';document.body.append(dialog);
const notice=text=>{const el=q('#ev-status');if(el)el.textContent=text;if(/失败|未完成|未配置|未连接|已切换|只读|尚未配置/.test(text))H.toast(text);};
const editable=()=>!loading&&!state?.signed&&H.canEdit();
const ensureEdit=()=>{if(!editable()){notice('当前角色、载入状态或签发状态不允许修改。');return false;}return true;};
async function api(path,data){const response=await fetch('/api/expansion/'+path,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Workbench-Request':'expansion'},...(data===undefined?{}:{body:JSON.stringify(data,path==='generate'?(k,v)=>typeof v==='string'&&v.startsWith('data:image/')?undefined:v:undefined)})});const payload=await response.json();if(!response.ok)throw Error(payload.error||'请求失败');return payload;}
function identity(){const p=H.params();return {projectName:p.project_name||'未命名项目',projectCode:p.project_code||'',unit};}
function saveSoon(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>save().catch(e=>notice(e.message)),650);window.dispatchEvent(new Event('workbuddy:expansion-changed'));}
function save(){clearTimeout(saveTimer);if(!state||loading||!store)return Promise.resolve();saveQueue=store.save(state);return saveQueue;}
function changed(reason,parameterKeys=null){refreshDefaultSections();state.reviewAcknowledged=null;for(const [sid,sec] of Object.entries(state.sections)){if(!parameterKeys||['criteria','review','selection'].includes(sid)||tokens(sec.text||'').some(t=>t.kind==='p'&&parameterKeys.includes(t.key)))sec.stale=true;}state.history.push({event:reason,at:new Date().toISOString(),actor:H.role()});saveSoon();updateMeta();renderFacts();renderRegs();renderModel();refreshSections();}
function refreshDefaultSections(){if(!state||state.signed)return;state.referenceTemplate=true;if(state.sections.special?.text&&!state.sections.special.text.includes('[[measures:regularity]]'))state.sections.special.text+='\n[[measures:regularity]]';ensureDurabilityMeasures();state.unitParameters=Object.fromEntries((state.document?.units||[]).map(u=>[u.name,window.WorkbenchIntake.unitParameters(u.name)]));Object.assign(state,window.WorkbenchLegacy.templateContent());for(const sec of SECTIONS){const old=state.sections[sec.id];if(!old?.text||(!old.manual&&['template','scaffold'].includes(old.kind))){state.sections[sec.id]={...defaultExpansion(state,sec.id),hidden:old?.hidden||false,stale:old?.stale||false};}}}
function tableHTML(s,sid){return reportTables(s,sid).filter(t=>t.rows.length).map(t=>(t.title?'<p><b>'+esc(t.title)+'</b></p>':'')+'<table class="ev-table"><thead><tr>'+t.headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+t.rows.map(row=>'<tr>'+row.map(c=>'<td>'+esc(c)+'</td>').join('')+'</tr>').join('')+'</tbody></table>').join('');}
function reportPackage(){
 const blocks=[{kind:'title',text:'第一章 结构设计'}];
 for(const sec of SECTIONS){if(state.sections[sec.id]?.hidden)continue;
  if(sec.id!=='selection')blocks.push({kind:'h1',text:sec.title});
  blocks.push(...sectionBlocks(state,sec.id,cleanDocumentText(resolveText(state.sections[sec.id]?.text||'',state))));
 }
 return {version:1,blocks};
}
function reportHTML(){return blocksHTML(reportPackage().blocks);}
function regularityHTML(){
 const t=reportTable(state,'regularity');
 return '<p class="ref-caption">'+esc(t.title)+'</p><table class="ev-table"><thead><tr>'+t.rows[0].values.map((v,i)=>'<th'+(i===3?' contenteditable="true" data-regularity-unit':'')+'>'+esc(v)+'</th>').join('')+'<th>是否不规则</th></tr></thead><tbody>'+t.rows.slice(1).map(r=>{
  const category=irregularityCategories.find(c=>c.rowSource===r.source),answer=irregularityAnswer(state,category.id);
  return '<tr>'+r.values.map((v,j)=>`<td${j<3?` contenteditable="${editable()}" data-regularity-row="${r.source}" data-regularity-col="${j}"`:''}>${esc(v)}</td>`).join('')+`<td><select data-ev-write data-irregularity-answer="${category.id}" aria-label="${esc(category.name)}是否存在"><option value="" ${!answer?'selected':''}>—</option><option value="yes" ${answer==='yes'?'selected':''}>是</option><option value="no" ${answer==='no'?'selected':''}>否</option></select></td></tr>`;
 }).join('')+'</tbody></table>';
}
function irregularityMeasuresHTML(){
 return irregularityCategories.filter(c=>irregularityAnswer(state,c.id)==='yes').map((category,i)=>{
  const draft=measureDraft(state,category.id);
  return `<section class="ev-irregularity-measure"><h3>10.2.${i+1} ${esc(category.name)}应对措施</h3>`+
   (category.cases.length?`<select data-ev-write data-irregularity-case="${category.id}" aria-label="${esc(category.name)}措施来源"><option value="common" ${draft.choice==='common'?'selected':''}>通用整理稿</option>${category.cases.map(c=>`<option value="${c.id}" ${draft.choice===c.id?'selected':''}>${esc(c.file.replace(/\.(docx?|pptx)$/,''))} · ${esc(c.section)}</option>`).join('')}</select>`:'')+
   `<div class="ev-measure-text" contenteditable="${editable()}" data-irregularity-text="${category.id}" aria-label="${esc(category.name)}应对措施正文" data-placeholder="历史资料未找到本类措施，可直接填写">${esc(draft.text)}</div>`+
   (category.cases.length?`<details class="ev-measure-source"><summary>来源</summary><p>历史案例原文与整理稿；原案例限值及性能目标保留在各自来源中。</p>${(draft.choice==='common'?category.cases:category.cases.filter(c=>c.id===draft.choice)).map(c=>`<p>${esc(c.file)} · ${esc(c.section)} · ${esc(c.locator)}</p>`).join('')}</details>`:'')+'</section>';
 }).join('');
}

function renderTokenText(text,sid){return text.split('\n').map(line=>{const parts=sid==='selection'?selectionParts(state,line):null;if(parts)return parts.map(p=>p.source?`<span data-source-kind="${p.source}" data-source-line="${esc(line)}">${esc(p.text)}</span>`:esc(p.text)).join('');const source=lineSource(state,sid,line);return source?`<span data-source-kind="${source}" data-source-line="${esc(line)}">${esc(line)}</span>`:esc(line);}).join('\n').replace(/\[\[(table|image|measures):([^\]]+)\]\]/g,(raw,kind,key)=>{if(kind==='measures')return '<div contenteditable="false" data-token="'+esc(raw)+'">'+irregularityMeasuresHTML()+'</div>';if(kind==='table'){const t=reportTable(state,key);return '<div contenteditable="false" data-token="'+esc(raw)+'">'+(key==='regularity'?regularityHTML():t?nativeTableHTML(t,{editUnits:key==='units',editable:editable(),source:(r,ri,ci)=>tableSource(key,r,ri,ci,state)}):'')+'</div>';}return '<div contenteditable="false" data-token="'+esc(raw)+'">'+blocksHTML(sectionBlocks(state,'',raw))+'</div>';}).replace(/\{\{([pfmrt]):([^{}]+)\}\}/g,(raw,kind,key)=>{const token='{{'+kind+':'+key+'}}';const source=kind==='m'?'yjk':kind==='p'?parameterSource(state,key):kind==='f'?(state.facts.find(f=>f.id===key)?.source_id||'').match(/(?:CURRENT-)?(bldg|geo|yjk)-/)?.[1]||'':'';return '<span class="ev-ref"'+(source?' data-source-kind="'+source+'"':'')+' contenteditable="false" data-token="'+esc(token)+'" title="'+esc(token)+'">'+esc(cleanDocumentText(resolveText(token,state)))+'</span>';});}
function fromEditor(el){function walk(n){if(n.nodeType===3)return n.textContent;if(n.nodeType!==1)return '';if(n.dataset.token)return n.dataset.token;if(n.tagName==='BR')return '\n';const t=[...n.childNodes].map(walk).join('');return /^(DIV|P)$/.test(n.tagName)?'\n'+t:t;}return [...el.childNodes].map(walk).join('').trim();}
function updateMeta(){
  q('#ev-identity').textContent=state.identity.projectName+' · '+state.identity.unit;
  q('#ev-param-status').textContent=state.parametersConfirmed?'措施参数已确认':'统一措施联动';
  q('#ev-source-status').textContent=state.sources.length+' 份资料已载入'+(state.model?.confirmed?' · 模型已载入':'');
  q('#ev-issues').innerHTML=issues(state).map(x=>'<li>'+esc(x)+'</li>').join('');
  q('#ev-signed').hidden=!state.signed;
  document.querySelectorAll('.ev-editor').forEach(el=>el.contentEditable=String(editable()));
  document.querySelectorAll('[data-unit-cell],[data-regularity-row],[data-regularity-unit],[data-irregularity-text]').forEach(el=>el.contentEditable=String(editable()));
  document.querySelectorAll('[data-ev-write]').forEach(el=>el.disabled=!editable()||busy);
}
function layout(){
  const toc=q('#toc2');if(toc)toc.innerHTML='<h3>目录 · 扩初说明</h3>'+SECTIONS.map(s=>'<a href="#'+s.anchor+'">'+esc(s.title)+'</a>').join('');
  paper.innerHTML=`<div class="ev-toolbar" hidden><div id="ev-identity"></div><div class="ev-row"><label>当前单体 <input id="ev-unit" value="${esc(unit)}" list="ev-units" aria-label="扩初说明当前单体"><datalist id="ev-units"></datalist></label><button data-action="switch-unit">切换单体</button><span class="ev-pill" id="ev-param-status"></span><span class="ev-muted" id="ev-source-status"></span></div><div class="ev-row"><button data-action="confirm-params" data-ev-write>核对统一措施</button><button class="primary" data-action="generate-all" data-ev-write>DeepSeek 润色全文</button><button data-action="local" data-ev-write>按资料更新正文</button><button data-action="check">校核全文</button><button data-action="export">导出 Word 草稿</button><button data-action="save">保存版本</button></div><div id="ev-status" class="ev-status" role="status">正在载入项目草稿…</div><div class="ev-warning" id="ev-signed" hidden>当前为签发快照，参数变化不会改写本稿。撤回签发后创建新修订。</div><details><summary>编制检查记录</summary><ul id="ev-issues" class="ev-issues"></ul></details></div>
  <details class="ev-details" id="ev-facts-panel" hidden><summary>本次资料与候选事实</summary><div class="ev-row"><button data-action="paste" data-ev-write>核对上方建筑与地勘</button><button data-action="confirm-facts" data-ev-write>确认所选事实</button></div><div class="ev-muted">建筑与地勘在上方核对采用，参数同步计入①统一措施。结构模型总信息在上方导入；旧版资料保留待复核。</div><div id="ev-facts" class="ev-table-wrap"></div></details>
  <details hidden class="ev-details" id="ev-reg-panel"><summary>项目规范清单 · 与③地方规范共用</summary><div class="ev-row"><button data-action="add-reg" data-ev-write>添加规范</button><button data-action="ima" data-ev-write>从腾讯 ima 检索</button><button data-action="local-reg">去③选择地方规范</button></div><div id="ev-regs" class="ev-table-wrap"></div></details>
  <details class="ev-details" id="ev-images-panel"><summary>集中上传图片 · 按图名自动插入正文</summary><div id="ev-images"></div><input id="ev-image-file" type="file" accept="image/png,image/jpeg" hidden></details><details hidden class="ev-details"><summary>参数联动 · 统一措施、抗震等级及地方规范</summary><div class="ev-row"><button data-action="go-measures">①统一技术措施</button><button data-action="go-decisions">⑩抗震等级与性能目标</button><button data-action="local-reg">③地方规范</button><button data-action="national-list">编辑国家规范表</button><button data-action="follow-local">使用③地方规范清单</button></div></details><details hidden class="ev-details" id="ev-model-panel"><summary>模型批次、结果与适用判据</summary><div id="ev-model"></div></details>
  <div class="ev-layout"><div>${SECTIONS.map(s=>`<section class="ev-section" id="${s.anchor}" data-section="${s.id}"><div class="ev-section-head"><h2>${s.title}</h2><span class="ev-pill" data-state="${s.id}">尚未编写</span></div><div class="ev-row">${s.id==='basis'?'<button data-action="national-list">编辑国家规范</button><button data-action="local-reg">地方规范</button>':''}<button data-action="rewrite" data-section="${s.id}" data-ev-write>一致性改写</button><button data-action="undo" data-section="${s.id}" data-ev-write>恢复上一稿</button><button data-action="hide" data-section="${s.id}" data-ev-write>显示／隐藏</button></div><div class="ev-editor" contenteditable="true" data-editor="${s.id}" aria-label="${s.title}正文"></div></section>`).join('')}</div></div>
  <details class="ev-details"><summary>旧版保留稿与恢复</summary><div class="ev-row"><button data-action="legacy">下载历史示例（仅供参考）</button><button data-action="download-state">下载本稿版本</button><button data-action="reload">载入项目库最新版本</button></div><p class="ev-muted">历史示例需主动下载查看，不作为当前项目的事实来源。下载本稿版本包含已确认资料及修改记录。</p></details>`;
  q('#ev-unit').addEventListener('change',e=>selectUnit(e.target.value).catch(error=>{q('#ev-unit').value=unit;notice(error.message);}));
  paper.addEventListener('click',handleClick);
  paper.addEventListener('click',e=>{const b=e.target.closest('[data-unit-delete]');if(!b||!ensureEdit())return;state.unitTable??={cells:{},deleted:[]};state.unitTable.deleted??=[];state.unitTable.deleted.push(b.dataset.unitDelete);changed('删除单体表行');});
  paper.addEventListener('beforeinput',e=>{
    if(!editable())return;
    const editor=e.target.closest('[data-editor]');if(!editor)return;
    const range=window.getSelection()?.rangeCount?window.getSelection().getRangeAt(0):null;
    if(!range)return;
    const old=state.sections[editor.dataset.editor];if(!old)return;
    editor.querySelectorAll('[data-source-line]').forEach(el=>{if(range.intersectsNode(el)){old.manualSourceLines??=[];if(!old.manualSourceLines.includes(el.dataset.sourceLine))old.manualSourceLines.push(el.dataset.sourceLine);el.removeAttribute('data-source-kind');}});
  });
  paper.addEventListener('focusout',e=>{const editor=e.target.closest('[data-editor]');if(!editor)return;setTimeout(()=>{if(!editor.contains(document.activeElement)&&state)editor.innerHTML=renderTokenText(state.sections[editor.dataset.editor]?.text||'',editor.dataset.editor);},0);});

  paper.addEventListener('change',e=>{
    const answer=e.target.dataset.irregularityAnswer,choice=e.target.dataset.irregularityCase;
    if(!answer&&!choice||!ensureEdit())return;
    if(answer)setIrregularityAnswer(state,answer,e.target.value);else chooseMeasure(state,choice,e.target.value);
    e.target.blur();changed(answer?'选择不规则项':'选择历史应对措施');const editor=q('[data-editor="special"]');editor.innerHTML=renderTokenText(state.sections.special?.text||'','special');updateMeta();
  });
  paper.addEventListener('click',async e=>{const button=e.target.closest('[data-image-upload]');if(button){imageSlot=button.dataset.imageUpload;q('#ev-image-file').click();}const a=e.target.closest('[data-action]')?.dataset.action;if(a==='go-measures')window.WorkbenchLegacy.go(1);if(a==='go-decisions')window.WorkbenchLegacy.go(10);if(a==='follow-local'){if(!ensureEdit())return;if(state.referenceNorms)delete state.referenceNorms.local;changed('联动地方规范');}if(a==='national-list')editNationalList();});
  q('#ev-image-file').onchange=async e=>{const file=e.target.files[0];if(!file||!ensureEdit())return;const project=window.WorkbenchProjects.id,currentUnit=unit,slot=imageSlot;try{const data=await pictureData(file);if(project!==window.WorkbenchProjects.id||currentUnit!==unit)return;state.reportImages??={};state.reportImages[slot]={data,caption:imageSlots(state).find(x=>x.id===slot)?.caption||file.name,name:file.name};changed('上传扩初插图');await save();notice('图片已插入并保存');}catch(error){notice(error.message);}e.target.value='';};
  q('#ev-images').addEventListener('change',e=>{const key=e.target.dataset.imageCaption;if(!key||!ensureEdit())return;state.reportImages??={};state.reportImages[key]={...state.reportImages[key],caption:e.target.value};changed('修改图名');});
  paper.addEventListener('input',e=>{if(e.target.matches('[data-irregularity-answer],[data-irregularity-case]'))return;const measure=e.target.closest('[data-irregularity-text]');if(measure){if(!ensureEdit())return;setMeasureDraft(state,measure.dataset.irregularityText,measure.innerText);state.reviewAcknowledged=null;saveSoon();return;}const cell=e.target.closest('[data-unit-cell]');if(cell){if(!ensureEdit())return;state.unitTable??={cells:{},deleted:[]};state.unitTable.cells??={};state.unitTable.cells[cell.dataset.unitCell]??={};state.unitTable.cells[cell.dataset.unitCell][cell.dataset.unitCol]=cell.innerText;cell.removeAttribute('data-source-kind');state.reviewAcknowledged=null;saveSoon();return;}if(e.target.matches('[data-regularity-row],[data-regularity-unit]')){if(!ensureEdit())return;const table=reportTable(state,'regularity');state.regularity??={unit:table.rows[0].values[3],rows:table.rows.slice(1)};if(e.target.hasAttribute('data-regularity-unit'))state.regularity.unit=e.target.textContent;else {state.regularity.rows=table.rows.slice(1);state.regularity.rows.find(r=>r.source===+e.target.dataset.regularityRow).values[+e.target.dataset.regularityCol]=e.target.textContent;}state.reviewAcknowledged=null;saveSoon();return;}const editor=e.target.closest('[data-editor]');if(!editor||!ensureEdit())return;const sid=editor.dataset.editor;const old=state.sections[sid]||{};const text=fromEditor(editor);
    const removed=tokens(old.text||'').filter(t=>!text.includes(t.raw));if(removed.length){editor.innerHTML=renderTokenText(old.text||'',sid);notice('引用字段受保护，请到来源处修改；如需移除请使用整章建议比较。');return;}
    state.sections[sid]={...old,previous:old.manual?old.previous:{...old,previous:undefined},text,manual:true,stale:old.stale||false,evidence_ids:old.evidence_ids||[],updatedAt:new Date().toISOString()};state.reviewAcknowledged=null;saveSoon();updateMeta();
  });
  paper.addEventListener('paste',e=>{const ed=e.target.closest('[data-editor]');if(!ed)return;e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'));});
}
function refreshSections(){renderImagePanel();for(const sec of SECTIONS){const d=state.sections[sec.id];const node=q('[data-editor="'+sec.id+'"]');if(!node.contains(document.activeElement)||document.activeElement?.closest('button'))node.innerHTML=renderTokenText(d?.text||'',sec.id);q('[data-state="'+sec.id+'"]').textContent=d?.manual?'人工编辑':d?.text?'已编入正文':'尚未编写';q('[data-state="'+sec.id+'"]').className='ev-pill'+(d?.stale?' stale':'');q('#'+sec.anchor).classList.toggle('hidden-section',Boolean(d?.hidden));node.hidden=Boolean(d?.hidden);let tables=q('[data-report-table]',q('#'+sec.anchor));if(!tables){tables=document.createElement('div');tables.dataset.reportTable=sec.id;node.after(tables);}tables.innerHTML=state.referenceTemplate?'':tableHTML(state,sec.id);tables.hidden=Boolean(d?.hidden);}updateMeta();}
function renderFacts(){q('#ev-facts').innerHTML=state.facts.length?`<table class="ev-table"><thead><tr><th>选择</th><th>字段与内容</th><th>来源</th><th>状态</th></tr></thead><tbody>${state.facts.map(f=>`<tr><td><input type="checkbox" data-fact-select="${f.id}" aria-label="选择${esc(f.label)}" ${f.status==='confirmed'?'disabled':''}></td><td><b>${esc(f.label)}</b><pre>${esc(typeof f.value==='object'?JSON.stringify(f.value):f.value)}</pre>${['intake','decisions'].includes(f.origin)?'<small>回资料采用记录或⑩修改</small>':`<button data-action="edit-fact" data-id="${f.id}" data-ev-write>编辑确认值</button>`}</td><td>${esc(f.filename)}<small>${esc(f.locator)}</small><small>${esc(f.statement)} · ${esc(f.unit)}</small></td><td><span class="ev-pill ${f.status}">${f.status==='confirmed'?'已确认':f.status==='rejected'?'不采用':'候选'}</span> ${['intake','decisions'].includes(f.origin)?'':`<button data-action="reject-fact" data-id="${f.id}" data-ev-write>不采用</button>`}</td></tr>`).join('')}</tbody></table>`:'<p class="ev-muted">暂无当前单体资料。不会用历史示例填空。</p>';}
function renderRegs(){const selected=state.regulations.filter(r=>r.selected);const html=selected.length?`<table class="ev-table"><thead><tr><th>规范</th><th>有效性 / 审核</th><th>适用范围与证据</th><th>操作</th></tr></thead><tbody>${selected.map(r=>`<tr><td>${esc(r.title)}<small>${esc(r.code)} ${esc(r.version)}</small></td><td>${esc(({current:'现行',unknown:'待核',non_current:'非现行'})[r.status]||'待核')} / ${r.review==='confirmed'?'已确认':'候选'}</td><td>${esc(r.scope||'适用范围待核')}<small>${esc(r.locator||r.source_id)}</small><small>${esc(r.note||'')}</small></td><td><button data-action="edit-reg" data-id="${r.id}" data-ev-write>核对／编辑</button> <button data-action="remove-reg" data-id="${r.id}" data-ev-write>移出项目</button></td></tr>`).join('')}</tbody></table>`:'<p class="ev-muted">尚未选择项目规范，可手动添加或从③、ima加入候选。</p>';q('#ev-regs').innerHTML=html;const peer=q('#ev-shared-regs');if(peer){peer.innerHTML=html;peer.querySelectorAll('button').forEach(b=>b.addEventListener('click',e=>handleClick(e)));}updateMeta();}
const metricLabels={mass:'总质量（t）',T1:'第一振型周期（s）',T2:'第二振型周期（s）',T3:'第三振型周期（s）',ratio_tt:'扭转/平动周期比',mass_coef_x:'X向质量参与系数（%）',mass_coef_y:'Y向质量参与系数（%）',drift_env_x:'X向地震位移角包络',drift_env_y:'Y向地震位移角包络',drift_wind_x:'X向风位移角',drift_wind_y:'Y向风位移角',stiff_x:'X向侧向刚度比',stiff_y:'Y向侧向刚度比',vcap_x:'X向受剪承载力比',vcap_y:'Y向受剪承载力比',gravity_ratio_x:'X向刚重比',gravity_ratio_y:'Y向刚重比'};
function renderModel(){const m=state.model;q('#ev-model').innerHTML=!m?'<p class="ev-muted">尚未导入当前单体的模型结果。</p>':`<p>${esc(m.batch)} · ${esc(state.identity.unit)} · ${m.confirmed?'已确认':'待核对批次及工况'} <button data-action="confirm-model" data-ev-write>确认本批次</button></p><ul class="ev-issues">${m.warnings.map(x=>'<li>'+esc(x)+'</li>').join('')}</ul><div class="ev-table-wrap"><table class="ev-table"><thead><tr><th>项目</th><th>结果</th><th>适用判据 / 判断</th><th>操作</th></tr></thead><tbody>${Object.entries(metricLabels).map(([k,l])=>{const c=state.criteria.find(c=>c.key===k);const check=checkMetric(m.metrics[k],c,state.regulations);return `<tr><td>${esc(l)}</td><td>${esc(m.metrics[k]||'未提取')}</td><td>${c?esc(c.operator+' '+c.limit+'；'+c.clause+'；'+c.scope)+'<br>':''}${esc(check.text)}</td><td><button data-action="criterion" data-id="${k}" data-ev-write>设置判据</button></td></tr>`;}).join('')}</tbody></table></div><details><summary>原始文件与定位</summary>${m.sourceIds.map(x=>esc(x)).join('<br>')}<p class="ev-muted">原文完整保存在资料版本中，提取指标按文件、段落核对；未识别的计算项目不自动判断。</p></details>`;}
function modal(title,html,buttons=[]){dialog.innerHTML='<h2>'+esc(title)+'</h2>'+html+'<div class="ev-actions"><button data-close>关闭</button>'+buttons.map((b,i)=>'<button class="'+(b.primary?'primary':'')+'" data-modal="'+i+'">'+esc(b.label)+'</button>').join('')+'</div>';q('[data-close]',dialog).onclick=()=>dialog.close();buttons.forEach((b,i)=>q('[data-modal="'+i+'"]',dialog).onclick=()=>Promise.resolve(b.run()).catch(e=>{let err=q('.ev-modal-error',dialog);if(!err){err=document.createElement('p');err.className='ev-warning ev-modal-error';dialog.append(err);}err.textContent=e.message;}));if(!dialog.open)dialog.showModal();}
function recordSection(sid,draft){const old=state.sections[sid];state.sections[sid]={...draft,previous:old?{...old,previous:undefined}:null,stale:false,updatedAt:new Date().toISOString(),inputVersion:dependencies(state)};state.reviewAcknowledged=null;saveSoon();refreshSections();}
function reviewDraft(sid,draft,stamp,validation={errors:[],warnings:[]}){
  const old=state.sections[sid]?.text||'';modal(SECTIONS.find(s=>s.id===sid).title+' · 建议稿',`<div class="ev-compare"><div><b>当前稿</b><pre>${esc(resolveText(old,state))||'尚未编写'}</pre></div><div><b>建议稿（引用字段保留联动）</b><textarea id="ev-proposal">${esc(draft.text)}</textarea></div></div><ul class="ev-issues">${[...validation.errors,...validation.warnings,...(draft.warnings||[])].map(x=>'<li>'+esc(x)+'</li>').join('')}</ul>`,[{label:'采用建议稿',primary:true,run:()=>{if(!ensureEdit())return;if(!isCurrent(state,sid,stamp))throw Error('参数、资料或原文已变化，请重新生成建议');const d={...draft,text:q('#ev-proposal',dialog).value};const v=validateDraft(d,state,old&&draft.kind!=='scaffold'?old:'');if(v.errors.length)throw Error(v.errors.join('；'));recordSection(sid,d);dialog.close();notice('已采用建议稿，仍需人工复核。');}}]);
}
async function generate(sid,mode='generate',instruction=''){
  if(!ensureEdit()||busy)return;
  busy=true;updateMeta();const requestId=id,stamp=requestStamp(state,sid),snapshot=clone(state);notice('DeepSeek 正在按当前证据编写'+SECTIONS.find(s=>s.id===sid).title+'…');
  try{const r=await api('generate',{state:snapshot,sectionId:sid,mode,instruction});if(requestId!==id)throw Error('项目已切换，生成结果未写入');reviewDraft(sid,r.draft,stamp,r.validation);notice('建议稿已返回，请对照后采用。');}
  catch(e){notice(e.message);}finally{busy=false;updateMeta();}
}
async function generateAll(){
  if(!ensureEdit()||busy)return;
  modal('DeepSeek 润色全文','<p>将当前确认的措施参数、事实及规范证据分章发送至 DeepSeek。仅发送所需摘录，不上传原始文件。</p><p>已有正文只生成待采用建议，不会覆盖人工稿。可先用“按默认版生成正文”查看证据组织。</p>',[{label:'开始分章生成',primary:true,run:async()=>{dialog.close();busy=true;updateMeta();const originalId=id;let done=0;for(const sec of SECTIONS){if(id!==originalId)break;const stamp=requestStamp(state,sec.id);notice('正在生成 '+sec.title+'…');try{const r=await api('generate',{state:clone(state),sectionId:sec.id,mode:'generate'});if(id!==originalId)break;if(!isCurrent(state,sec.id,stamp))continue;
      if(!state.sections[sec.id]?.text&&!r.validation.errors.length){recordSection(sec.id,{...r.draft,kind:'ai'});done++;}else {state.sections[sec.id]={...(state.sections[sec.id]||{}),pending:{draft:r.draft,validation:r.validation,stamp}};saveSoon();}}
      catch(e){notice(sec.title+'生成未完成：'+e.message);break;}}
    busy=false;refreshSections();notice('已生成 '+done+' 章；已有正文的建议可点各章“查看依据”比较采用。');}}]);
}
function renderEvidence(sid){const d=state.sections[sid];const refs=tokens(d?.text||'');const actions=[];if(d?.pending)actions.push({label:'比较待采用建议',primary:true,run:()=>{const p=d.pending;reviewDraft(sid,p.draft,p.stamp,p.validation);}});if(d?.text&&editable())actions.push({label:'确认本章已复核',run:()=>{const check=validateDraft(d,state);if(check.errors.length)throw Error(check.errors.join('；'));d.stale=false;d.reviewedBy=H.role();d.reviewedAt=new Date().toISOString();d.inputVersion=dependencies(state);saveSoon();refreshSections();dialog.close();}});
  modal('本章依据与待核项',`<p>${esc(SECTIONS.find(s=>s.id===sid).rule)}</p><ul>${(d?.evidence_ids||[]).map(x=>'<li>'+esc(x)+'</li>').join('')}</ul><ul>${refs.map(t=>{const f=t.kind==='f'?state.facts.find(x=>x.id===t.key):null;return '<li>'+esc(t.raw)+'：'+esc(resolveText(t.raw,state))+(f?'<br><small>'+esc(f.filename+' · '+f.locator+' · '+f.statement)+'</small>':'')+'</li>';}).join('')}</ul><ul>${(d?.warnings||[]).map(x=>'<li>'+esc(x)+'</li>').join('')}</ul>`,actions);}
function editReg(reg={}){modal('项目规范 · 核对与编辑',`<label>名称<input id="er-title" value="${esc(reg.title)}"></label><div class="ev-compare"><label>编号<input id="er-code" value="${esc(reg.code)}"></label><label>版本／年份<input id="er-version" value="${esc(reg.version)}"></label></div><label>有效状态<select id="er-status"><option value="unknown">待核实</option><option value="current">已核实当前适用版本</option><option value="non_current">非现行／不适用</option></select></label><label>适用地区、单体和条件<input id="er-scope" value="${esc(reg.scope)}"></label><label>原文链接或来源位置<input id="er-locator" value="${esc(reg.locator||reg.source_url)}"></label><label>项目备注／版本核查依据<input id="er-note" value="${esc(reg.note)}"></label><label><input type="checkbox" id="er-confirm"> 已核对原文、适用性和有效状态，确认用于本项目</label>`,[{label:'保存项目清单',primary:true,run:()=>{if(!ensureEdit())return;const title=q('#er-title').value.trim(),confirmed=q('#er-confirm').checked,scope=q('#er-scope').value.trim(),locator=q('#er-locator').value.trim();if(!title)throw Error('请填写规范名称');if(confirmed&&(!scope||!locator||q('#er-status').value!=='current'))throw Error('确认前需填写适用条件、证据位置并核实版本');const r={...reg,id:reg.id||uuid(),title,code:q('#er-code').value.trim(),version:q('#er-version').value.trim(),status:q('#er-status').value,scope,locator,note:q('#er-note').value.trim(),review:confirmed?'confirmed':'candidate',selected:true,source_id:reg.source_id||'USER-REG-'+uuid(),checkedAt:new Date().toISOString(),checkedBy:H.role()};state.regulations=state.regulations.filter(x=>x.id!==r.id).concat(r);changed('修订项目规范清单');dialog.close();}}]);q('#er-status').value=reg.status||'unknown';}
function criterion(key){const c=state.criteria.find(x=>x.key===key)||{};modal('确认适用判据：'+metricLabels[key],`<p class="ev-muted">判据须与该模型工况、结构体系和规范版本一致。这里只进行数值比较。</p><label>引用项目规范<select id="ec-reg"><option value="">请选择已确认规范</option>${state.regulations.filter(r=>r.selected&&r.review==='confirmed'&&r.status==='current').map(r=>`<option value="${r.id}">${esc(r.title+' '+r.code)}</option>`).join('')}</select></label><label>条文号与原文定位<input id="ec-clause" value="${esc(c.clause)}"></label><label>适用结构及工况<input id="ec-scope" value="${esc(c.scope)}"></label><div class="ev-row"><select id="ec-op"><option>&lt;=</option><option>&gt;=</option><option>&lt;</option><option>&gt;</option></select><input id="ec-limit" placeholder="限值，可填1/550；单位与结果一致" value="${esc(c.limit)}"></div>`,[{label:'确认并计算',primary:true,run:()=>{if(!ensureEdit())return;const value={key,regulationId:q('#ec-reg').value,clause:q('#ec-clause').value.trim(),scope:q('#ec-scope').value.trim(),operator:q('#ec-op').value,limit:q('#ec-limit').value.trim(),confirmed:true};if(checkMetric(state.model.metrics[key],value,state.regulations).status==='unknown')throw Error('请补齐有效判据与数值');state.criteria=state.criteria.filter(x=>x.key!==key).concat(value);changed('确认模型适用判据');dialog.close();}}]);q('#ec-op').value=c.operator||'<=';q('#ec-reg').value=c.regulationId||'';}
async function imaDialog(){modal('腾讯 ima · 只读检索',`<p class="ev-muted">检索结果先进入候选清单；知识库收录不代表现行适用。</p><div class="ev-row"><input id="ei-base-query" value="规范" aria-label="知识库名称"><button id="ei-bases">查找知识库</button></div><label>知识库<select id="ei-base"><option value="">先查找知识库</option></select></label><div class="ev-row"><input id="ei-query" placeholder="国家规范编号或名称" aria-label="规范检索词"><button id="ei-search">检索规范</button></div><p id="ei-status" class="ev-muted"></p><div id="ei-results"></div>`);
  q('#ei-bases').onclick=async()=>{try{q('#ei-status').textContent='正在读取知识库目录…';const r=await api('ima/bases',{query:q('#ei-base-query').value});q('#ei-base').innerHTML=r.items.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');q('#ei-status').textContent=r.items.length?'请选择目标知识库':'未找到可访问知识库，请更换名称或核实权限';}catch(e){q('#ei-status').textContent=e.message;}};
  q('#ei-search').onclick=async()=>{try{q('#ei-status').textContent='正在检索…';const r=await api('ima/search',{baseId:q('#ei-base').value,query:q('#ei-query').value});q('#ei-results').innerHTML=r.items.map((x,i)=>`<div class="ev-details"><b>${esc(x.title)}</b><p>${esc(x.excerpt)}</p><button data-ima="${i}">加入项目候选</button></div>`).join('');q('#ei-status').textContent='找到 '+r.items.length+' 项'+(r.hasMore?'；结果尚有后续页，请细化规范编号':'');q('#ei-results').querySelectorAll('[data-ima]').forEach(b=>b.onclick=()=>{const item=r.items[+b.dataset.ima];editReg({title:item.title,source_id:item.source_id,locator:'腾讯ima条目 '+item.id,note:'目录/检索摘录，条文及有效性待核实'});});}catch(e){q('#ei-status').textContent=e.message;}};
}
async function handleClick(e){const b=e.target.closest('[data-action]');if(!b)return;const a=b.dataset.action,sid=b.dataset.section;try{
  if(a==='restore-old'){
    if(!ensureEdit())return;const oldId=fingerprint(identity()).padStart(8,'0'),candidates=[];
    try{const old=JSON.parse(localStorage.getItem('expansion-v2:'+oldId)||'null');if(old)candidates.push({label:'旧浏览器恢复稿',value:old});}catch{}
    try{const old=await api('state?id='+oldId);if(old.state)candidates.push({label:'旧603保存稿',value:old.state});}catch{}
    modal('按同名项目与单体查找旧稿',candidates.length?'<p>请核对来源后选择。载入前会下载当前草稿备份；旧稿作为待复核修订导入，旧保存文件保持不变。</p>':'<p>未找到同名项目／单体旧稿。请先核对①项目名称、编号和当前单体是否与旧稿一致。</p>',candidates.map(c=>({label:'载入'+c.label,run:async()=>{download(state.identity.projectName+'_迁移前备份.json',JSON.stringify(state,null,2),'application/json');const old=clone(c.value);state={...createState(identity()),...old,identity:identity(),parameters:currentParameters(),parametersConfirmed:false,measuresVersion:window.WorkbenchProjects.parameterVersion,signed:null};state.history.push({event:'迁入'+c.label,legacyId:oldId,at:new Date().toISOString()});changed('旧版恢复稿迁移，重新核对依据');await save();dialog.close();}})));
  }
  if(a==='switch-unit'){await selectUnit(q('#ev-unit').value);return;}
  if(['confirm-params','local','generate-all','generate','rewrite','paste','confirm-facts','reject-fact','edit-fact','add-reg','edit-reg','remove-reg','confirm-model','criterion','insert','undo','hide','ima'].includes(a)&&!ensureEdit())return;
  if(a==='confirm-params'){syncParams();const p=currentParameters();modal('确认本稿采用的统一措施',`<p>这些值来自①公共参数及本单体已采用方案。请核对适用范围后确认。</p><pre>${esc(JSON.stringify(p,null,2))}</pre>`,[{label:'确认用于本稿',primary:true,run:()=>{state.parameters=clone(p);state.parametersConfirmed=true;state.parameterReview={by:H.role(),at:new Date().toISOString(),source_id:'MEASURES-CONFIRMED'};changed('确认统一措施快照');dialog.close();}}]);}
  if(a==='local'){for(const sec of SECTIONS){const draft=defaultExpansion(state,sec.id);if(!state.sections[sec.id]?.text||(!state.sections[sec.id].manual&&['template','scaffold'].includes(state.sections[sec.id].kind)))recordSection(sec.id,draft);else state.sections[sec.id].pending={draft,stamp:requestStamp(state,sec.id),validation:{errors:[],warnings:[]}};}saveSoon();refreshSections();notice('依据骨架已生成；已有人工稿保持，建议可在“查看依据”中比较。');}
  if(a==='generate-all')await generateAll();
  if(a==='generate')await generate(sid);
  if(a==='rewrite')modal('一致性改写',`<label>改写要求<textarea id="ev-instruction">保持已确认事实和引用不变，改善逻辑、专业表达与前后文一致性。</textarea></label>`,[{label:'发送至 DeepSeek',primary:true,run:()=>{const instruction=q('#ev-instruction').value;dialog.close();return generate(sid,'rewrite',instruction);}}]);
  if(a==='evidence')renderEvidence(sid);
  if(a==='insert'){const refs=references(state),choices=Object.entries(refs).flatMap(([kind,map])=>Object.entries(map).map(([key,v])=>({token:'{{'+kind+':'+key+'}}',label:key+'：'+String(v).slice(0,100)})));modal('插入受保护引用','<select id="ev-reference">'+choices.map(x=>`<option value="${esc(x.token)}">${esc(x.label)}</option>`).join('')+'</select>',[{label:'加入本段',primary:true,run:()=>{const old=state.sections[sid]||{text:'',evidence_ids:[]};recordSection(sid,{...old,text:old.text+q('#ev-reference').value,manual:true});dialog.close();}}]);}
  if(a==='undo'){const d=state.sections[sid];if(d?.previous){const prev=d.previous;recordSection(sid,{...prev,previous:undefined});notice('已恢复上一稿。');}}
  if(a==='hide'){state.reviewAcknowledged=null;state.sections[sid]={...(state.sections[sid]||{text:'',evidence_ids:[]}),hidden:!state.sections[sid]?.hidden};saveSoon();refreshSections();}
  if(a==='paste'){H.goStage(2);document.querySelector('#intake-panel').scrollIntoView({block:'start'});}
  if(a==='confirm-facts'){const selected=[...q('#ev-facts').querySelectorAll('[data-fact-select]:checked')].map(x=>x.dataset.factSelect);if(!selected.length){notice('请先选择已核对的事实。');return;}state.facts.forEach(f=>{if(selected.includes(f.id)&&!['intake','decisions'].includes(f.origin)){f.status='confirmed';f.confirmedBy=H.role();f.confirmedAt=new Date().toISOString();}});changed('确认所选资料事实');}
  if(a==='reject-fact'){const f=state.facts.find(x=>x.id===b.dataset.id);if(['intake','decisions'].includes(f.origin)){notice('请回①或⑩修改来源记录');return;}modal('不采用此项', '<label>理由<input id="ef-reject"></label>',[{label:'记录',run:()=>{const reason=q('#ef-reject').value.trim();if(!reason)throw Error('请说明不采用理由');f.status='rejected';f.reason=reason;changed('资料项不采用');dialog.close();}}]);}
  if(a==='edit-fact'){const f=state.facts.find(x=>x.id===b.dataset.id);if(['intake','decisions'].includes(f.origin)){notice('请回①或⑩修改来源记录');return;}modal('编辑确认值：'+f.label,`<p>${esc(f.filename)} · ${esc(f.locator)}</p><label>确认值<textarea id="ef-value">${esc(typeof f.value==='object'?JSON.stringify(f.value):f.value)}</textarea></label><label>修改／确认理由<input id="ef-reason"></label>`,[{label:'确认此值',primary:true,run:()=>{const reason=q('#ef-reason').value.trim();if(!reason)throw Error('请记录确认理由');f.previousValue=f.value;f.value=q('#ef-value').value;f.reason=reason;f.status='confirmed';f.confirmedBy=H.role();f.confirmedAt=new Date().toISOString();changed('人工确认资料值');dialog.close();}}]);}
  if(a==='confirm-model'){if(!state.model.valid){notice('本批次有未知或重复文件类型，请重新导入完整同批次文件。');return;}modal('确认模型批次',`<p>请确认以下文件属于同一单体、同一计算版本。刚性楼板与非刚性楼板、不同计算方案不能混用。</p><pre>${esc(state.model.files.join('\n'))}</pre><label>模型版本与计算工况说明<input id="em-scope" placeholder="输入模型版本、计算方案及生成时间"></label>`,[{label:'确认本批次',primary:true,run:()=>{const scope=q('#em-scope').value.trim();if(!scope)throw Error('请填写模型版本与工况');state.model.confirmed=true;state.model.scope=scope;state.model.confirmedAt=new Date().toISOString();changed('确认模型结果批次');dialog.close();}}]);}
  if(a==='criterion')criterion(b.dataset.id);
  if(a==='add-reg')editReg();if(a==='edit-reg')editReg(state.regulations.find(x=>x.id===b.dataset.id));
  if(a==='remove-reg'){const r=state.regulations.find(x=>x.id===b.dataset.id);modal('移出项目规范',`<p>将“${esc(r.title)}”移出当前项目清单。已引用该规范的段落将标记待核，规范库原件保留。</p>`,[{label:'移出本项目',run:()=>{r.selected=false;changed('移出项目规范');dialog.close();}}]);}
  if(a==='local-reg')H.goStage(3);if(a==='ima')await imaDialog();
  if(a==='check'){const list=issues(state);modal('全文校核',`<ul class="ev-issues">${list.map(x=>'<li>'+esc(x)+'</li>').join('')||'<li>未发现机械校核问题，仍需专业复核。</li>'}</ul>`,!list.length&&H.role()==='专业负责人'?[{label:'记录全文专业复核',primary:true,run:()=>{state.reviewAcknowledged=dependencies(state);state.history.push({event:'全文专业复核',by:H.role(),at:new Date().toISOString()});saveSoon();dialog.close();notice('已记录专业复核，可回首页按既有流程审核签发。');}}]:[]);}
  if(a==='save')await save();if(a==='reload'){download(state.identity.projectName+'_重载前恢复稿.json',JSON.stringify(state,null,2),'application/json');await saveQueue.catch(()=>{});await load(true);}
  if(a==='legacy'){const example=await window.WorkbenchLegacy.loadExample();download('历史示例扩初说明_仅供参考.html','<!doctype html><meta charset="utf-8"><p>历史示例，仅供参考，不是当前项目成果。</p><div class="paper">'+example.expansionPaper+'</div>','text/html');}
  if(a==='download-state')download(state.identity.projectName+'_扩初草稿.json',JSON.stringify(state,null,2),'application/json');
  if(a==='export')await exportWord();
  }catch(err){notice(err.message);}}
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
async function exportWord(){return window.WordDocumentView?.export('expansion');}
async function hashBytes(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function addFacts(slot,name,blk,data,hash){
  const source_id='EXP-'+slot.toUpperCase()+'-'+hash.slice(0,16),text=blk.paras.join('\n');
  if(state.sources.some(x=>x.source_id===source_id)){notice('该版本已导入，无需重复添加。');return;}
  state.sources.push({source_id,name,hash,slot,importedAt:new Date().toISOString(),unit:state.identity.unit,text,tables:blk.tables});
  // Previous facts remain in history; newer file versions are candidates and never silently win.
  const add=(key,label,value,locator)=>state.facts.push({id:uuid(),key,label,value,slot,source_id,filename:name,locator,unit:state.identity.unit,status:'candidate',statement:/建议|推荐|拟采用/.test(String(value))?'作者观点':'原文事实'});
  Object.entries(data).filter(([k,v])=>LABELS[k]&&v!==''&&v!==null).forEach(([k,v])=>{const index=typeof v==='string'?blk.paras.findIndex(p=>v.includes(p)||p.includes(v)):-1;add(k,LABELS[k],v,index>=0?'提取段落 '+(index+1):'提取表格／原文全文（需人工定位）');});
  blk.paras.forEach((p,i)=>{if(p.length>8&&/(层数|建筑高度|结构高度|层高|跨度|柱网|用途|功能|框架|剪力墙|地下室|净高|抗震缝|转换|隔震|基础|持力层|地下水|液化|地震|抗浮)/.test(p)&&!Object.values(data).some(v=>typeof v==='string'&&v.includes(p)))add(slot==='bldg'?'arch_excerpt':'geo_excerpt','原文摘录',p,'提取段落 '+(i+1));});
  if(!state.facts.some(f=>f.source_id===source_id)&&text.trim())add(slot==='bldg'?'arch_excerpt':'geo_excerpt','待分类原文',text,'提取全文');
  changed('导入'+name);q('#ev-facts-panel').open=true;notice('已提取候选，核对来源和当前单体后勾选确认。');
}
async function ingestText(slot,name,text){if(text.length>180000)throw Error('摘录过长，请按单体或章节拆分');const blk=H.textBlocks(text),data=slot==='bldg'?H.extractBldg(blk).data:H.extractGeo(blk).data;await addFacts(slot,name,blk,data,await hashBytes(new TextEncoder().encode(text)));}
async function importFiles(slot,files){if(!ensureEdit())return;const importId=id;busy=true;updateMeta();try{
  if(slot==='yjk'){
    const texts=[];for(const f of files){if(f.size>15*1024*1024)throw Error('模型文件超过15MB，请导出总信息文本');const bytes=await f.arrayBuffer();texts.push({name:f.name,text:H.decode(bytes),hash:await hashBytes(bytes)});}
    if(id!==importId)throw Error('项目已切换，导入取消');const batch=modelBatch(texts);if(!batch.valid)throw Error(batch.warnings.join('；'));
    const r=H.parseYJK(texts);const metrics=Object.fromEntries(Object.entries(r.data).filter(([k])=>!/(?:ok|note|case)/i.test(k)));
    const sourceIds=texts.map(f=>'EXP-MODEL-'+f.hash.slice(0,16));texts.forEach((f,i)=>{if(!state.sources.some(s=>s.source_id===sourceIds[i]))state.sources.push({source_id:sourceIds[i],name:f.name,hash:f.hash,slot:'yjk',text:f.text,unit,importedAt:new Date().toISOString()});});
    if(state.model)state.history.push({event:'替换模型批次',previous:state.model,at:new Date().toISOString()});
    state.model={batch:new Date().toLocaleString('zh-CN'),metrics,sourceIds,files:texts.map(f=>f.name),warnings:batch.warnings,valid:batch.valid,confirmed:false};H.rcIngest(texts);changed('导入当前模型');q('#ev-model-panel').open=true;
  }else for(const f of files){
    if(/\.doc$/i.test(f.name))throw Error('旧版DOC请先另存为DOCX或导出文字，避免把二进制当文本');if(f.size>30*1024*1024)throw Error('资料超过30MB，请按章节拆分');const bytes=await f.arrayBuffer();let blk;
    if(/\.docx$/i.test(f.name))blk=await H.readDocx(f);else if(/\.pdf$/i.test(f.name)){let text;try{text=await H.readPdfJs(f);}catch{text=(await H.readPdf(f)).text;}if(!text||text.trim().length<80)throw Error('PDF未提取有效文字，请使用可复制文本或OCR后的资料');blk=H.textBlocks(text);}else blk=H.textBlocks(H.decode(bytes));
    if(id!==importId)throw Error('项目已切换，导入取消');const data=(slot==='bldg'?H.extractBldg(blk):H.extractGeo(blk)).data;await addFacts(slot,f.name,blk,data,await hashBytes(bytes));
  }
  H.mark(slot,'已导入候选，等待确认');await save();
}catch(e){notice('导入未完成：'+e.message);}finally{busy=false;updateMeta();}}
function renderUnits(){q('#ev-units').innerHTML=window.WorkbenchIntake.units.map(n=>'<option value="'+esc(n)+'"></option>').join('');}
async function selectUnit(next){if(busy||loading||window.WorkbenchProjects.loading)throw Error('正在处理资料，请稍后切换单体');await save();unit=String(next||'').trim()||'项目整体';sessionStorage.setItem('wb:expansion-unit:'+window.WorkbenchProjects.id,unit);await load();}
function syncIntake(){
  if(!state||loading)return;renderUnits();
  const shared=window.WorkbenchIntake.evidence(unit,true);
  if(fingerprint(state.facts.filter(f=>f.origin==='intake'))===fingerprint(shared.facts)&&fingerprint(state.document)===fingerprint(shared.document))return;
  if(state.signed){notice('项目资料已变化；当前保留签发快照，撤回后更新。');return;}
  state.document=clone(shared.document);
  state.facts=state.facts.filter(f=>f.origin!=='intake').concat(clone(shared.facts));
  state.sources=state.sources.filter(s=>s.origin!=='intake').concat(clone(shared.sources));
  state.parametersConfirmed=false;changed('建筑与地勘资料变更');
}
function syncDecisions(){
  if(!state||loading||!window.WorkbenchModules)return;
  const shared=window.WorkbenchModules.evidence(unit);
  if(fingerprint(state.facts.filter(f=>f.origin==='decisions'))===fingerprint(shared.facts))return;
  if(state.signed){notice('重难点判断已变化；当前保留签发快照，撤回后更新。');return;}
  state.facts=state.facts.filter(f=>f.origin!=='decisions').concat(shared.facts);
  state.sources=state.sources.filter(s=>s.origin!=='decisions').concat(shared.sources);
  changed('重难点确认依据变更');
}
async function load(remoteOnly=false){
  clearTimeout(saveTimer);clearTimeout(paramTimer);const ticket=++loadTicket;loading=true;const who=identity();
  id=window.WorkbenchProjects.id+':'+unit;store=projectPart(window.WorkbenchProjects.id,'expansion-'+fingerprint(unit).padStart(8,'0'),notice);
  const next=await store.load({remoteOnly});if(ticket!==loadTicket)return;
  state=next||createState(who);state.identity=who;loading=false;
  const current=currentParameters(),version=window.WorkbenchProjects.parameterVersion;
  if(!state.signed&&(fingerprint(current)!==fingerprint(state.parameters)||state.measuresVersion!==version)){state.parameters=current;state.parametersConfirmed=false;state.measuresVersion=version;changed('载入后核对当前参数版本');}
  syncIntake();syncDecisions();refreshDefaultSections();q('#ev-unit').value=unit;renderUnits();renderFacts();renderRegs();renderModel();refreshSections();notice(next?'已载入当前项目/单体草稿。':'新稿已就绪：请导入并确认当前资料。');window.dispatchEvent(new Event('workbuddy:expansion-changed'));
}
function syncParams(){if(!state||loading||window.WorkbenchProjects.loading)return;syncIntake();const current=currentParameters(),version=window.WorkbenchProjects.parameterVersion;if(state.signed){if(fingerprint(current)!==fingerprint(state.parameters)||state.measuresVersion!==version)notice('统一措施已变化；当前保留签发快照，撤回后才能更新。');return;}
 if(fingerprint(current)!==fingerprint(state.parameters)||state.measuresVersion!==version||fingerprint(window.WorkbenchLegacy.templateContent())!==fingerprint({templateText:state.templateText,templateTables:state.templateTables})){const keys=Object.keys({...state.parameters,...current}).filter(k=>fingerprint(current[k])!==fingerprint(state.parameters[k]));state.parameters=current;state.identity=identity();state.parametersConfirmed=false;state.measuresVersion=version;changed('统一措施依据变更',keys.length?keys:null);notice('参数引用已更新；人工稿保留，关联正文需复核。');}}
function paramsChanged(){clearTimeout(paramTimer);paramTimer=setTimeout(syncParams,350);}
document.addEventListener('change',e=>{const input=e.target.closest('input[data-imp]');if(input&&input.dataset.imp==='yjk'){e.stopImmediatePropagation();importFiles(input.dataset.imp,[...input.files]);input.value='';}},true);
window.addEventListener('workbuddy:measures-changed',paramsChanged);
document.querySelector('#paper1').addEventListener('input',paramsChanged);
window.addEventListener('workbuddy:intake-changed',paramsChanged);
window.addEventListener('workbuddy:decisions-changed',syncDecisions);
window.addEventListener('workbuddy:local-regulation-selected',e=>{if(!ensureEdit())return;const r=e.detail;if(state.regulations.some(x=>x.source_id===r.source_id&&x.selected)){notice('该规范已在项目清单中');return;}state.regulations.push({...r,id:uuid(),selected:true,review:'candidate',scope:H.params().region||'',locator:r.source_url});changed('从③加入地方规范候选');H.toast('已加入②/③共用项目规范清单，待确认适用性');});
window.ExpansionWorkbench={documentHTML:reportHTML,documentPackage:reportPackage,capture:()=>state?clone(state):null,get unit(){return unit},selectUnit,async copy(){try{await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([reportHTML()],{type:'text/html'})})]);notice('已复制正文、表格及来源，可粘贴到 Word。');}catch{notice('复制失败，请导出 Word。');}},generate:()=>{if(!busy)handleClick({target:{closest:()=>({dataset:{action:'local'}})}});},exportWord,canSign(){return Boolean(state?.signed&&state.measuresVersion===window.WorkbenchProjects.parameterVersion)||Boolean(state&&issues(state).length===0&&state.reviewAcknowledged===dependencies(state));},async sign(){if(!this.canSign())return false;state.signed={at:new Date().toISOString(),by:H.role(),inputVersion:dependencies(state)};await save();refreshSections();return true;},revoke(){if(!state)return;state.history.push({event:'撤回签发，新修订',signed:state.signed});state.signed=null;syncParams();changed('撤回签发');},refresh:()=>{if(state)updateMeta();}};
unit=sessionStorage.getItem('wb:expansion-unit:'+window.WorkbenchProjects.id)||'项目整体';
layout();
const restoreButton=document.createElement('button');restoreButton.dataset.action='restore-old';restoreButton.textContent='查找同名项目旧版恢复稿';q('[data-action="download-state"]').after(restoreButton);
const inherited=q('#stage2 > .panel-card:not(#intake-panel)');if(inherited){const fold=document.createElement('details');fold.className='panel-card ev-details';fold.hidden=true;const summary=document.createElement('summary');summary.textContent='统一措施继承参数与扩初补充项';fold.append(summary);while(inherited.firstChild)fold.append(inherited.firstChild);inherited.replaceWith(fold);}
const shared=document.createElement('details');shared.className='ev-details ev-workspace';shared.innerHTML='<summary>本项目已选规范 · 与②扩初说明共用</summary><div id="ev-shared-regs" class="ev-table-wrap"></div>';q('#stage3').append(shared);
const importHelp=q('#implog');if(importHelp)importHelp.hidden=true;
const importPanel=q('#box-yjk')?.closest('.panel-card');if(importPanel){const sub=q('h2 .sub',importPanel);if(sub)sub.textContent='资料自动编入正文';const tip=q('.upbar .tip',importPanel);if(tip)tip.hidden=true;}
q('[onclick="generateExpand(true)"]').textContent='按资料更新正文';
await load();
window.WorkbenchProjects.register('expansion',{save:()=>{syncParams();return save();},load:({remoteOnly=false}={})=>{unit=sessionStorage.getItem('wb:expansion-unit:'+window.WorkbenchProjects.id)||'项目整体';return load(remoteOnly);},busy:()=>busy,capture:()=>clone(state)});
