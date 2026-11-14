import {templatePages,buildCafeteriaSlides} from './cafeteria-core.js';
import {cafeteriaHTML} from './cafeteria-view.js';
import {downloadCafeteria,cafeteriaBlob} from './cafeteria-export.js';
import {projectPart} from '../../../project-store-client.js';
import {matchImageFiles,readPptImage,reportImageAliases} from '../../../office-ppt-assets.js';
import {restorePptDraft,serializePptDraft} from './ppt-draft.js';
import {singleImageLayoutId} from './single-image-layout.js';
let draftStore, snapshotQueue=Promise.resolve(), draftLoading=false;
let unitDrafts={}, imageLoading=false;
const imageStatus=document.querySelector('#batch-image-status'),imageRetry=document.querySelector('#batch-image-retry');
const paint=()=>new Promise(resolve=>setTimeout(resolve,0));
function imageNotice(text,failed=false){imageStatus.textContent=text;imageRetry.hidden=!failed;}
function imageControls(){const disabled=imageLoading||state.exporting||draftLoading||state.snapshot?.context?.canEdit===false;els.unitName.disabled=disabled;document.querySelector('#batch-image-upload').disabled=disabled;els.imageUploadList.querySelectorAll('button,select').forEach(el=>el.disabled=disabled||(el.tagName==='SELECT'&&!el.options.length)||(el.tagName==='BUTTON'&&el.parentElement.querySelector('select')?.options.length===0));els.canvas.querySelectorAll('[data-upload]').forEach(el=>el.disabled=disabled);}
const embedded=new URL(location.href).searchParams.get('embedded')==='1'&&window.parent!==window;

const pages = templatePages;

const state = {
  current: 0,
  confirmed: false,
  images: new Map(),
  activeUpload: null,
  measureWindow: null,
  measureParams: null,
  measureSignature: '',
  measureRequestTimer: null,
  edits: {},
  provenance: {},
  revision: 0,
  snapshot: null,
  proposal: null,
  undo: null,
  exporting: false,
  pendingSnapshot: null,
};

const els = {
  pageList: document.querySelector('#page-list'),
  canvas: document.querySelector('#slide-canvas'),
  currentNumber: document.querySelector('#current-number'),
  currentTitle: document.querySelector('#current-title'),
  pagerLabel: document.querySelector('#pager-label'),
  prev: document.querySelector('#prev-btn'),
  next: document.querySelector('#next-btn'),
  confirm: document.querySelector('#confirm-btn'),
  generate: document.querySelector('#generate-btn'),
  imageInput: document.querySelector('#image-input'),
  toast: document.querySelector('#toast'),
  projectName: document.querySelector('#project-name'),
  unitName: document.querySelector('#unit-name'),
  measureLinkButton: document.querySelector('#measure-link-btn'),
  imageManagerButton: document.querySelector('#image-manager-btn'),
  imageManager: document.querySelector('#image-manager'),
  imageManagerClose: document.querySelector('#image-manager-close'),
  imageManagerBackdrop: document.querySelector('#image-manager-backdrop'),
  imageUploadList: document.querySelector('#image-upload-list'),
  imageProgress: document.querySelector('#image-progress'),
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
const editable = (text, className = '') => `<span class="${className}" contenteditable="true" spellcheck="false">${escapeHtml(text)}</span>`;
const param = (key, suffix = '', fallback = '[待确认]') => ({ key, suffix, fallback });
function paramHtml({ key, suffix = '', fallback = '[待确认]' }) {
  const source=key.startsWith('model:')?'②已确认模型批次':key==='decision_summary'?'⑩负责人确认判断':'①统一措施及单体资料';
  return `<span class="linked-param" contenteditable="false" data-param="${key}" title="来源：${source} / ${key}">${escapeHtml((key === 'has_iso' ? ({true:'隔震',false:'抗震'}[measureValue(key)] || '[待确认]') : measureValue(key, fallback)) + suffix)}</span>`;
}
const linked = (key, suffix = '') => paramHtml(param(key, suffix));
const imageKey = (pageIndex, name) => `${pageIndex}-${name}`;

const imageRequirements = pages.flatMap((page, pageIndex) => {
  const names = page.slots || (page.slot ? [page.slot] : []);
  return names.map((name) => ({ pageIndex, pageTitle: page.title, name, aliases:page.aliases||[] }));
});

function measureValue(key, fallback = '[填写]') {
  const unit=state.snapshot?.units?.find(u=>u.name===els.unitName.value);
  const facts=Object.fromEntries((unit?.facts||[]).map(f=>[f.key.replace(/^bldg_/,''),f.value]));
  let value=unit?.parameters?.[key]??state.measureParams?.[key];
  if(key.startsWith('model:'))value=unit?.model?.metrics?.[key.slice(6)];
  if(key==='unit_floors')value=facts.floors_above!=null||facts.floors_below!=null?`${facts.floors_above??'待核'}/${facts.floors_below??'待核'}`:null;
  if(['height_m','span_m'].includes(key))value=facts[key];
  if(key==='decision_summary')value=unit?.decisions?.map(d=>d.conclusion).join('；');
  return value === undefined || value === null || String(value).trim() === '' ? fallback : String(value).trim();
}

function imageSlot(name, options = {}) {
  const key = imageKey(state.current, name);
  const source = state.images.get(key);
  return `
    <div class="image-slot${options.dark ? ' dark' : ''}${source ? ' has-image' : ''}" data-slot="${name}">
      ${source ? `<img src="${source}" alt="${name}" />` : ''}
      <div class="image-action">
        <span class="slot-name">${name}</span>
        <button class="upload-btn" type="button" data-upload="${name}">${source ? '覆盖图片' : '上传图片'}</button>
      </div>
    </div>`;
}

function table(headers, rows) {
  return `
    <table class="ppt-table">
      <thead><tr>${headers.map((item) => `<th>${escapeHtml(item)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((row) => `<tr>${row.map((item, index) => typeof item === 'object' ? `<td>${paramHtml(item)}</td>` : `<td contenteditable="true" spellcheck="false">${escapeHtml(item)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`;
}

function header(page, title = page.title) {
  return `<div class="ppt-header"><b>${page.section}</b><h2>${editable(title)}</h2></div>`;
}

function pageFrame(page, body, title = page.title) {
  return `<div class="ppt-page">${header(page, title)}<div class="ppt-body">${body}<span class="ppt-page-number">${state.current + 1}</span></div></div>`;
}

function renderSlide() {
  renderedUnit=els.unitName.value;
  const page = buildCafeteriaSlides(state.snapshot||{},els.unitName.value,state.edits)[state.current];
  els.canvas.innerHTML = cafeteriaHTML(page,imageSlot);
  document.querySelector('#page-count').textContent=pages.length+'页';
  els.currentNumber.textContent = String(state.current + 1).padStart(2, '0');
  els.currentTitle.textContent = page.title;
  els.pagerLabel.textContent = `${state.current + 1} / ${pages.length}`;
  els.prev.disabled = state.current === 0;
  els.next.disabled = state.current === pages.length - 1;
  renderPageList();
  const readOnly=state.snapshot?.context?.canEdit===false;
  if(readOnly)els.canvas.querySelectorAll('[contenteditable="true"]').forEach(n=>n.contentEditable='false');
  els.unitName.disabled=readOnly||imageLoading;
  for(const el of [els.confirm,els.imageManagerButton])if(el)el.disabled=readOnly||state.exporting||imageLoading;
  els.canvas.querySelectorAll('[data-upload]').forEach(b=>b.disabled=readOnly||imageLoading);
}

function renderPageList() {
  els.pageList.innerHTML = pages.map((page, index) => `
    <button class="page-item${index === state.current ? ' active' : ''}" type="button" data-page="${index}" aria-current="${index === state.current ? 'page' : 'false'}">
      <b>${String(index + 1).padStart(2, '0')}</b><span>${page.title}</span>
    </button>`).join('');
}

function renderImageManager() {
  const uploaded = imageRequirements.filter(({ pageIndex, name }) => state.images.has(imageKey(pageIndex, name))).length;
  els.imageProgress.textContent = `${uploaded} / ${imageRequirements.length} 个图位 · ${[...state.images.keys()].filter(k=>k.startsWith('__unplaced__')).length} 张待放置`;
  els.imageUploadList.innerHTML = imageRequirements.map(({ pageIndex, pageTitle, name }) => {
    const hasImage = state.images.has(imageKey(pageIndex, name));
    return `
      <div class="image-upload-row">
        <div class="upload-topic"><b>${String(pageIndex + 1).padStart(2, '0')}</b><span>${pageTitle}</span></div>
        <span class="upload-image-name">${name}</span>
        <button type="button" data-upload-page="${pageIndex}" data-upload-name="${name}">${hasImage ? '覆盖图片' : '上传图片'}</button>
      </div>`;
  }).join('');
  for(const [key] of state.images){if(!key.startsWith('__unplaced__'))continue;
   const row=document.createElement('div');row.className='image-upload-row';
   const name=document.createElement('span');name.textContent=key.slice(46)+' · 未放置';
   const select=document.createElement('select');select.setAttribute('aria-label','选择图位 '+key.slice(46));
   for(const slot of imageRequirements.filter(r=>!state.images.has(imageKey(r.pageIndex,r.name))))select.add(new Option(`${slot.pageIndex+1} · ${slot.pageTitle} · ${slot.name}`,imageKey(slot.pageIndex,slot.name)));
   const place=document.createElement('button');place.type='button';place.textContent='放入图位';place.disabled=!select.options.length||state.snapshot?.context?.canEdit===false;
   place.onclick=async()=>{if(imageLoading||state.exporting||state.snapshot?.context?.canEdit===false)return;imageLoading=true;imageControls();try{if(!select.value||state.images.has(select.value))throw Error('请重新选择空图位');state.images.set(select.value,state.images.get(key));state.images.delete(key);invalidateReview();imageNotice('正在保存图片位置…');await paint();await saveDraft();imageNotice('图片位置已保存。');}catch(e){imageNotice('图片位置保存尚未确认：'+e.message+'；请保持本页打开。',true);}finally{imageLoading=false;renderSlide();renderImageManager();if(state.pendingSnapshot){const snapshot=state.pendingSnapshot;state.pendingSnapshot=null;applyMeasureSnapshot(snapshot);}}};
   row.append(name,select,place);els.imageUploadList.append(row);
  }
  imageControls();
}

function setImageManager(open) {
  els.imageManager.classList.toggle('open', open);
  els.imageManagerBackdrop.classList.toggle('open', open);
  els.imageManager.setAttribute('aria-hidden', String(!open));
  els.imageManagerBackdrop.setAttribute('aria-hidden', String(!open));
  els.imageManagerButton.setAttribute('aria-expanded', String(open));
  if (open) renderImageManager();
}

function startImageUpload(pageIndex, name) {
  if(imageLoading||state.exporting||state.snapshot?.context?.canEdit===false)return;
  state.activeUpload = { pageIndex, name };
  els.imageInput.value = '';
  els.imageInput.click();
}

function requestMeasureSnapshot() {
  try {
    const source = embedded?window.parent:(state.measureWindow || window.opener);
    if (!source || source.closed) return;
    source.postMessage({ type: 'workbuddy:request-measure-snapshot' }, window.location.origin);
  } catch (error) {
    showToast('暂未连接统一技术措施');
  }
}

function connectMeasures() {
  if(embedded){requestMeasureSnapshot();return;}
  if (window.opener && !window.opener.closed) {
    window.opener.focus();
    requestMeasureSnapshot();
    return;
  }
  if (state.measureWindow && !state.measureWindow.closed) {
    state.measureWindow.focus();
    requestMeasureSnapshot();
    return;
  }
  const url = new URL('../../../workbuddy-integrated-studio.html', window.location.href);
  const project=new URL(location.href).searchParams.get('project');if(project)url.searchParams.set('project',project);
  state.measureWindow = window.open(url.href, 'workbuddy-unified-measures');
  if (!state.measureWindow) {
    showToast('请允许打开统一技术措施页面');
    return;
  }
  els.measureLinkButton.textContent = '等待技术措施…';
  let attempts = 0;
  clearInterval(state.measureRequestTimer);
  state.measureRequestTimer = setInterval(() => {
    attempts += 1;
    requestMeasureSnapshot();
    if (attempts >= 30 || state.measureParams) clearInterval(state.measureRequestTimer);
  }, 400);
}

function applyMeasureSnapshot(snapshot) {
  snapshotQueue=snapshotQueue.catch(()=>{}).then(()=>loadMeasureSnapshot(snapshot)).catch(e=>showToast('项目载入失败：'+e.message));
}
async function loadMeasureSnapshot(snapshot) {
  if (!snapshot.params || typeof snapshot.params !== 'object') return;
  if (state.exporting||imageLoading) { state.pendingSnapshot = snapshot; return; }
  if(!/^[a-f0-9]{32}$/.test(snapshot.project_id||'')){showToast('请从新版工作台项目入口连接参数');return;}
  const signature = JSON.stringify([snapshot.project_id,snapshot.parameter_version,snapshot.params,snapshot.output_version,snapshot.context?.canEdit]);
  if (signature === state.measureSignature) return;
  // The embedding workbench supplies the richer snapshot. Ignore legacy polling replies.
  if(embedded&&snapshot.schema!==2)return;
  const firstLink = !state.measureParams;
  const oldProject = projectKey();
  if(draftStore&&oldProject!==snapshot.project_id)await saveDraft();
  state.measureParams = { ...snapshot.params };
  state.measureSignature = signature;
  state.snapshot = snapshot;
  const currentUrl=new URL(location.href);currentUrl.searchParams.set('project',snapshot.project_id);history.replaceState(null,'',currentUrl);
  if (firstLink || oldProject !== projectKey()) {
    state.images.forEach((url) => URL.revokeObjectURL(url));
    state.images.clear();
    state.edits = {};
    state.provenance = {};
    unitDrafts={};
    els.unitName.value = '';
    draftLoading=true;
    try {
      draftStore=projectPart(snapshot.project_id,'ppt',text=>{document.querySelector('#link-status').textContent=text;});
      const saved = await draftStore.load() || {};
      state.edits = saved.edits || {};
      state.provenance = saved.provenance || {};
      els.unitName.innerHTML=(snapshot.units||[{name:saved.unit||'项目整体'}]).map(u=>`<option>${escapeHtml(u.name)}</option>`).join('');
      els.unitName.value = saved.unit || '项目整体';
      if(!els.unitName.value)els.unitName.selectedIndex=0;
      const restored=restorePptDraft(saved,els.unitName.value);unitDrafts=restored.drafts;
      state.edits=restored.current.edits||{};state.provenance=restored.current.provenance||{};
      state.images=new Map(Object.entries(restored.current.images||{}).filter(([,v])=>/^data:image\/(png|jpeg|webp);base64,/i.test(v)));
      imageNotice('已载入 '+state.images.size+' 张图片；待放置图片可在下方选择图位。');
    } finally {draftLoading=false;}
  }
  const selectedUnit=els.unitName.value;
  els.unitName.innerHTML=(snapshot.units||[{name:selectedUnit||'项目整体'}]).map(u=>`<option>${escapeHtml(u.name)}</option>`).join('');
  els.unitName.value=selectedUnit;
  if(!els.unitName.value){els.unitName.selectedIndex=0;state.edits={};state.provenance={};state.images.clear();}
  invalidateReview();
  clearInterval(state.measureRequestTimer);

  const projectName = measureValue('project_name', '');
  if (projectName) els.projectName.value = projectName;
  els.projectName.readOnly = true;
  els.projectName.classList.add('linked');
  els.measureLinkButton.textContent = '技术措施已联动';
  els.measureLinkButton.classList.add('confirmed');
  document.querySelector('#link-status').textContent = `已联动工作台参数 · ${new Date(snapshot.updated_at).toLocaleTimeString()} 更新`;
  if (Object.keys(state.edits).length) document.querySelector('#link-status').textContent += ' 已保留手工/AI说明，请核对其与当前参数是否一致。';
  if(Object.keys(state.edits).some(k=>/^(3|6|11|13):/.test(k)))document.querySelector('#link-status').textContent+=' 联动页旧版手工稿保留在项目备份的edits中，避免错位套用；请核对后迁入本页说明。';

  if (state.confirmed) {
    state.confirmed = false;
    els.confirm.classList.remove('confirmed');
    els.confirm.textContent = '人工确认';
  }
  renderSlide();
  renderImageManager();
  showToast(firstLink ? '已读取统一技术措施' : '技术措施已更新，PPT 已同步');
}

window.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'workbuddy:measure-snapshot') return;
  if (event.origin !== window.location.origin) return;
  const trustedSource = (state.measureWindow && event.source === state.measureWindow)
    || (window.opener && event.source === window.opener) || (embedded&&event.source===window.parent);
  if (!trustedSource) return;
  applyMeasureSnapshot(event.data);
});

let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add('show');
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 1800);
}

function goTo(index) {
  if (state.exporting) return;
  if (index < 0 || index >= pages.length) return;
  state.current = index;
  state.revision += 1;
  renderSlide();
}

els.pageList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-page]');
  if (button) goTo(Number(button.dataset.page));
});
els.prev.addEventListener('click', () => goTo(state.current - 1));
els.next.addEventListener('click', () => goTo(state.current + 1));

els.canvas.addEventListener('click', (event) => {
  const button = event.target.closest('[data-upload]');
  if (!button) return;
  startImageUpload(state.current, button.dataset.upload);
});

els.imageUploadList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-upload-page]');
  if (!button) return;
  startImageUpload(Number(button.dataset.uploadPage), button.dataset.uploadName);
});

async function uploadImages(files,singleSlot=null){
 if(!files.length||!draftStore||draftLoading||imageLoading||state.exporting||state.snapshot?.context?.canEdit===false)return;
 const project=projectKey(),unit=els.unitName.value,known=new Set(state.images.values());
 const targets=imageRequirements.map(r=>({key:imageKey(r.pageIndex,r.name),occupied:state.images.has(imageKey(r.pageIndex,r.name)),aliases:[...r.aliases,r.name,`${r.pageIndex+1}-${r.name}`,`${r.pageTitle}-${r.name}`,...(imageRequirements.filter(s=>s.pageIndex===r.pageIndex).length===1?[r.pageTitle]:[])]}));
 const plans=singleSlot?files.map(file=>({file,target:{key:singleSlot}})):matchImageFiles(files,targets,{aliases:reportImageAliases,suffix:true});
 imageLoading=true;imageControls();const failures=[];let placed=0,retained=0,duplicates=0,completed=0;
 try{
  for(const plan of plans){
   imageNotice(`读取 ${completed+1} / ${files.length}：${plan.file.name}`);await paint();
   try{
    const {data}=await readPptImage(plan.file,{maxBytes:4*1024*1024});
    if(project!==projectKey()||unit!==els.unitName.value)throw Error('项目或单体已切换');
    if(!singleSlot&&known.has(data)){duplicates++;}
    else if(singleSlot||(!plan.reason&&!state.images.has(plan.target.key))){state.images.set(plan.target.key,data);known.add(data);placed++;}
    else{state.images.set('__unplaced__'+crypto.randomUUID().replaceAll('-','')+'__'+plan.file.name,data);known.add(data);retained++;}
   }catch(e){failures.push(plan.file.name+'：'+e.message);}
   completed++;imageNotice(`已读取 ${completed} / ${files.length} · 新增 ${placed+retained} 张 · 重复 ${duplicates} 张`);await paint();
  }
  if(placed||retained)invalidateReview();
  renderSlide();renderImageManager();imageNotice(`已读取 ${files.length} / ${files.length}，正在保存…`);await paint();
  await saveDraft();
  imageNotice(`完成：${placed} 张已放置，${retained} 张新增待放置，${duplicates} 张重复已跳过。图片已保存。`+(retained?' 待放置图片请在下方选择图位。':'')+(failures.length?'\n未导入 '+failures.length+' 张：'+failures.join('；'):''));
 }catch(e){imageNotice('图片保存尚未确认：'+e.message+'\n请保持此页打开，核对保存状态后重试。',true);}
 finally{imageLoading=false;renderSlide();renderImageManager();if(state.pendingSnapshot){const snapshot=state.pendingSnapshot;state.pendingSnapshot=null;applyMeasureSnapshot(snapshot);}}
}
els.imageInput.addEventListener('change',async()=>{const files=[...els.imageInput.files];els.imageInput.value='';if(state.activeUpload)await uploadImages(files,imageKey(state.activeUpload.pageIndex,state.activeUpload.name));});
els.imageManagerButton.addEventListener('click',()=>setImageManager(!els.imageManager.classList.contains('open')));
els.imageManagerClose.addEventListener('click',()=>setImageManager(false));
document.querySelector('#batch-image-upload').onclick=()=>{if(!imageLoading&&!state.exporting&&state.snapshot?.context?.canEdit!==false)document.querySelector('#batch-image-input').click();};
document.querySelector('#batch-image-input').onchange=async event=>{const files=[...event.target.files];event.target.value='';await uploadImages(files);};
imageRetry.onclick=async()=>{if(imageLoading)return;imageLoading=true;imageControls();imageNotice('正在重试保存…');await paint();try{await saveDraft();imageNotice('图片已保存。');}catch(e){imageNotice('图片保存尚未确认：'+e.message+'；请保持本页打开。',true);}finally{imageLoading=false;renderSlide();renderImageManager();if(state.pendingSnapshot){const snapshot=state.pendingSnapshot;state.pendingSnapshot=null;applyMeasureSnapshot(snapshot);}}};
els.imageManagerBackdrop.addEventListener('click', () => setImageManager(false));
els.measureLinkButton.addEventListener('click', connectMeasures);

els.confirm.addEventListener('click', () => {
  state.confirmed = !state.confirmed;
  els.confirm.classList.toggle('confirmed', state.confirmed);
  els.confirm.textContent = state.confirmed ? '已人工确认' : '人工确认';
  showToast(state.confirmed ? '已人工确认' : '已取消确认');
});

els.generate.addEventListener('click', async () => {
  if(imageLoading){showToast('图片正在读取，请稍后下载');return;}
  if (!state.measureParams) { showToast('请先连接统一技术措施'); return; }
  els.generate.textContent = '生成中…';
  els.generate.disabled = true;
  state.exporting = true;
  document.body.classList.add('exporting');
  const current = state.current;
  try {
    await downloadCafeteria(buildCafeteriaSlides(state.snapshot,els.unitName.value,state.edits),state.images,els.projectName.value);
    showToast('PPT 草稿已生成；若未开始下载，请点击“保存已生成的 PPT”');
  } catch (error) {
    showToast(`导出失败：${error.message}`);
  } finally {
    state.current = current;
    state.exporting = false;
    document.body.classList.remove('exporting');
    els.generate.textContent = '下载 PPT 草稿';
    els.generate.disabled = false;
    renderSlide();
    if (state.pendingSnapshot) {
      const snapshot = state.pendingSnapshot;
      state.pendingSnapshot = null;
      applyMeasureSnapshot(snapshot);
    }
  }
});

let renderedUnit='';
els.unitName.addEventListener('change', async () => {
  if(renderedUnit)unitDrafts[renderedUnit]={...unitDrafts[renderedUnit],layoutId:singleImageLayoutId,edits:state.edits,provenance:state.provenance,images:Object.fromEntries(state.images)};
  const saved=unitDrafts[els.unitName.value]||{};state.edits=saved.edits||{};state.provenance=saved.provenance||{};state.images=new Map(Object.entries(saved.images||{}));
  invalidateReview();await saveDraft();renderSlide();renderImageManager();
});

function projectKey() {
  return state.snapshot?.project_id||'';
}
function draftPayload(){return serializePptDraft(els.unitName.value,state.snapshot?.parameter_version,unitDrafts,{edits:state.edits,provenance:state.provenance,images:Object.fromEntries(state.images)});}
function saveDraft() {
  if (!state.measureParams||!draftStore||draftLoading) return Promise.resolve();
  if(state.snapshot?.context?.canEdit===false)return draftStore.flush();
  unitDrafts[els.unitName.value]={...unitDrafts[els.unitName.value],layoutId:singleImageLayoutId,edits:state.edits,provenance:state.provenance,images:Object.fromEntries(state.images)};
  const payload=draftPayload();
  if(JSON.stringify(payload).length>31*1024*1024)return Promise.reject(Error('当前PPT图片内容已超过单次保存容量，请先导出保留本页图片，再分单体整理；尚未提交覆盖'));
  return draftStore.save(payload).catch(e=>{const message=e.status===409?'版本冲突，请保留本页并核对另一窗口的保存版本':e.message.includes('60秒')?'项目保存超时，可重试并核对保存结果':e.message;imageNotice('PPT保存尚未确认：'+message+'；请保持本页打开。',true);throw Object.assign(Error(message),{status:e.status});});
}
function invalidateReview() {
  state.revision += 1;
  state.confirmed = false;
  els.confirm.classList.remove('confirmed');
  els.confirm.textContent = '人工确认';
  state.undo = null;
}
els.canvas.addEventListener('input', (event) => {
  const node = event.target.closest('[data-edit-id]');
  if (!node) return;
  state.edits[node.dataset.editId] = node.innerText;
  state.provenance[node.dataset.editId] = { statement_type: '作者观点（人工输入，待复核）', source_id: `${projectKey()}:${node.dataset.editId}`, updated_at: new Date().toISOString() };
  invalidateReview();
  saveDraft().catch(e=>showToast(e.message));
});
els.canvas.addEventListener('paste', (event) => {
  if (!event.target.closest('[contenteditable="true"]')) return;
  event.preventDefault();
  document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && els.imageManager.classList.contains('open')) {
    setImageManager(false);
    return;
  }
  if (event.target.matches('input,[contenteditable="true"]')) return;
  if (event.key === 'ArrowLeft') goTo(state.current - 1);
  if (event.key === 'ArrowRight') goTo(state.current + 1);
});

window.WorkbenchPpt={canSign:()=>state.confirmed,busy:()=>draftLoading||imageLoading||state.exporting,async flush(){await snapshotQueue;await saveDraft();await draftStore?.flush();}};
window.WorkbenchPpt.mcp={
 get ready(){return !!draftStore&&!!state.snapshot&&!draftLoading;},get revision(){return draftStore?.revision||0;},get dirty(){return !!draftStore&&draftStore.hasChanges(draftPayload());},
 async selectUnit(unit){await snapshotQueue;if(!state.snapshot?.units?.some(u=>u.name===unit))throw Error('PPT单体不存在');if(els.unitName.value===unit)return;if(window.WorkbenchPpt.busy())throw Error('PPT正在处理');if(renderedUnit)unitDrafts[renderedUnit]={...unitDrafts[renderedUnit],layoutId:singleImageLayoutId,edits:state.edits,provenance:state.provenance,images:Object.fromEntries(state.images)};els.unitName.value=unit;const saved=unitDrafts[unit]||{};state.edits=saved.edits||{};state.provenance=saved.provenance||{};state.images=new Map(Object.entries(saved.images||{}));invalidateReview();renderSlide();renderImageManager();},
 read(){const slides=buildCafeteriaSlides(state.snapshot,els.unitName.value,state.edits);return {projectId:state.snapshot?.project_id,parameterVersion:state.snapshot?.parameter_version,outputVersion:state.snapshot?.output_version,unit:els.unitName.value,revision:draftStore?.revision||0,edits:{...state.edits},layoutMigration:unitDrafts[els.unitName.value]?.layoutMigration,pages:slides.map(page=>({number:page.number,title:page.title,fields:page.shapes.flatMap(shape=>shape.kind==='text'?[{id:shape.editId,text:shape.text,editable:shape.editable,linked:!!shape.linked}]:shape.kind==='table'?shape.rows.flatMap(row=>row.filter(cell=>!cell.skip).map(cell=>({id:cell.editId,text:cell.text,editable:cell.editable,linked:!!cell.linked}))):[])})),images:[...imageRequirements.map(r=>({key:imageKey(r.pageIndex,r.name),name:r.name,page:r.pageIndex+1,present:state.images.has(imageKey(r.pageIndex,r.name))})),...[...state.images.keys()].filter(key=>key.startsWith('__unplaced__')).map(key=>({key,name:key.slice(46),page:null,present:true,unplaced:true}))],draft:true};},
 async edit({edits,expectedEdits}){if(state.snapshot?.context?.canEdit===false||window.WorkbenchPpt.busy())throw Error('PPT只读或正在处理');const editable=new Set(this.read().pages.flatMap(p=>p.fields.filter(f=>f.editable).map(f=>f.id)));for(const [key,value]of Object.entries(edits)){if(!editable.has(key)||typeof value!=='string')throw Error('PPT字段不可编辑：'+key);if((state.edits[key]||'')!==expectedEdits[key])throw Object.assign(Error('PPT人工文字已变化，请重新读取'),{code:'TEXT_CONFLICT',status:409});}const before={edits:{...state.edits},provenance:{...state.provenance}};for(const [key,value]of Object.entries(edits)){state.edits[key]=value;state.provenance[key]={statement_type:'AI推断（MCP编辑，待复核）',source_id:projectKey()+':'+key,updated_at:new Date().toISOString()};}invalidateReview();state.undo=before;await saveDraft();renderSlide();return this.read();},
 async image({key,data}){if(state.snapshot?.context?.canEdit===false||window.WorkbenchPpt.busy())throw Error('PPT只读或正在处理');if(!imageRequirements.some(r=>imageKey(r.pageIndex,r.name)===key))throw Error('PPT图位不存在');state.images.set(key,data);invalidateReview();await saveDraft();renderSlide();renderImageManager();},
 async export(expected={}){if(window.WorkbenchPpt.busy())throw Error('PPT正在处理');await snapshotQueue;const identity={projectId:state.snapshot?.project_id,parameterVersion:state.snapshot?.parameter_version,outputVersion:state.snapshot?.output_version,unit:els.unitName.value};for(const key of ['projectId','parameterVersion','outputVersion','unit'])if(expected[key]!==undefined&&expected[key]!==identity[key])throw Object.assign(Error('PPT 参数快照已变化，请重新生成'),{status:409,code:'PPT_VERSION_MISMATCH'});state.exporting=true;try{const blob=await cafeteriaBlob(buildCafeteriaSlides(state.snapshot,els.unitName.value,state.edits),state.images);return {...identity,blob,filename:(els.projectName.value||'结构设计').replace(/[\\/:*?"<>|]/g,'_')+'_扩初汇报_草稿.pptx',draft:true};}finally{state.exporting=false;if(state.pendingSnapshot){const snapshot=state.pendingSnapshot;state.pendingSnapshot=null;applyMeasureSnapshot(snapshot);}}},
};
renderSlide();
renderImageManager();
requestMeasureSnapshot();
setInterval(requestMeasureSnapshot, 2000);

window.addEventListener('beforeunload',()=>{saveDraft().catch(()=>{});});
