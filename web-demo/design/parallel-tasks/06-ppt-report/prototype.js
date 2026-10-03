import {templatePages,buildCafeteriaSlides} from './cafeteria-core.js';
import {cafeteriaHTML} from './cafeteria-view.js';
import {downloadCafeteria} from './cafeteria-export.js';
import { validateRewrite, parameterEvidence, rewriteGuidance } from './report-core.js';
import {projectPart} from '../../../project-store-client.js';
let draftStore, snapshotQueue=Promise.resolve(), draftLoading=false;
let unitDrafts={}, imageLoading=false;
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
  return names.map((name) => ({ pageIndex, pageTitle: page.title, name }));
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
  updateRewriteControls();
  els.currentNumber.textContent = String(state.current + 1).padStart(2, '0');
  els.currentTitle.textContent = page.title;
  els.pagerLabel.textContent = `${state.current + 1} / ${pages.length}`;
  els.prev.disabled = state.current === 0;
  els.next.disabled = state.current === pages.length - 1;
  renderPageList();
  const readOnly=state.snapshot?.context?.canEdit===false;
  if(readOnly)els.canvas.querySelectorAll('[contenteditable="true"]').forEach(n=>n.contentEditable='false');
  els.unitName.disabled=readOnly;
  for(const el of [els.confirm,els.imageManagerButton])if(el)el.disabled=readOnly||state.exporting;
  if(readOnly)document.querySelector('#rewrite-btn').disabled=true;
  els.canvas.querySelectorAll('[data-upload]').forEach(b=>b.disabled=readOnly);
}

function renderPageList() {
  els.pageList.innerHTML = pages.map((page, index) => `
    <button class="page-item${index === state.current ? ' active' : ''}" type="button" data-page="${index}" aria-current="${index === state.current ? 'page' : 'false'}">
      <b>${String(index + 1).padStart(2, '0')}</b><span>${page.title}</span>
    </button>`).join('');
}

function renderImageManager() {
  const uploaded = imageRequirements.filter(({ pageIndex, name }) => state.images.has(imageKey(pageIndex, name))).length;
  els.imageProgress.textContent = `${uploaded} / ${imageRequirements.length}`;
  els.imageUploadList.innerHTML = imageRequirements.map(({ pageIndex, pageTitle, name }) => {
    const hasImage = state.images.has(imageKey(pageIndex, name));
    return `
      <div class="image-upload-row">
        <div class="upload-topic"><b>${String(pageIndex + 1).padStart(2, '0')}</b><span>${pageTitle}</span></div>
        <span class="upload-image-name">${name}</span>
        <button type="button" data-upload-page="${pageIndex}" data-upload-name="${name}">${hasImage ? '覆盖图片' : '上传图片'}</button>
      </div>`;
  }).join('');
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
  if (state.exporting) { state.pendingSnapshot = snapshot; return; }
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
      unitDrafts=saved.unitDrafts||{};
      state.images=new Map(Object.entries(saved.images||{}).filter(([,v])=>/^data:image\/(png|jpeg|webp);base64,/i.test(v)));
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
  clearProposal();
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

els.imageInput.addEventListener('change', async () => {
  const [file] = els.imageInput.files;
  if (!file || !state.activeUpload) return;
  if(!draftStore||draftLoading){showToast('请先载入项目');return;}
  if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>4*1024*1024){showToast('请选择不超过4MB的PNG、JPEG或WebP图片');return;}
  const project=projectKey();
  const { pageIndex, name } = state.activeUpload;
  const key = imageKey(pageIndex, name);
  const oldUrl = state.images.get(key);
  if (oldUrl) URL.revokeObjectURL(oldUrl);
  imageLoading=true;let data;try{data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});}finally{imageLoading=false;}
  if(project!==projectKey())return;
  state.images.set(key, data);
  invalidateReview();
  renderSlide();
  renderImageManager();
  saveDraft().catch(e=>showToast(e.message));
  showToast(`${name}已更新`);
});

els.imageManagerButton.addEventListener('click', () => {
  setImageManager(!els.imageManager.classList.contains('open'));
});
els.imageManagerClose.addEventListener('click', () => setImageManager(false));
els.imageManagerBackdrop.addEventListener('click', () => setImageManager(false));
els.measureLinkButton.addEventListener('click', connectMeasures);

els.confirm.addEventListener('click', () => {
  state.confirmed = !state.confirmed;
  els.confirm.classList.toggle('confirmed', state.confirmed);
  els.confirm.textContent = state.confirmed ? '已人工确认' : '人工确认';
  showToast(state.confirmed ? '已人工确认' : '已取消确认');
});

els.generate.addEventListener('click', async () => {
  if (!state.measureParams) { showToast('请先连接统一技术措施'); return; }
  els.generate.textContent = '生成中…';
  els.generate.disabled = true;
  state.exporting = true;
  document.body.classList.add('exporting');
  const current = state.current;
  try {
    await downloadCafeteria(buildCafeteriaSlides(state.snapshot,els.unitName.value,state.edits),state.images,els.projectName.value);
    showToast('PPT 草稿已下载，文字与表格可编辑');
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
  if(renderedUnit)unitDrafts[renderedUnit]={edits:state.edits,provenance:state.provenance,images:Object.fromEntries(state.images)};
  const saved=unitDrafts[els.unitName.value]||{};state.edits=saved.edits||{};state.provenance=saved.provenance||{};state.images=new Map(Object.entries(saved.images||{}));
  invalidateReview();await saveDraft();renderSlide();renderImageManager();
});

function projectKey() {
  return state.snapshot?.project_id||'';
}
function saveDraft() {
  if (!state.measureParams||!draftStore||draftLoading) return Promise.resolve();
  if(state.snapshot?.context?.canEdit===false)return draftStore.flush();
  unitDrafts[els.unitName.value]={edits:state.edits,provenance:state.provenance,images:Object.fromEntries(state.images)};
  return draftStore.save({layoutVersion:3,edits:state.edits,provenance:state.provenance,unit:els.unitName.value,images:Object.fromEntries(state.images),unitDrafts,parameterVersion:state.snapshot?.parameter_version}).catch(e=>{showToast('PPT未保存到项目库：'+e.message);throw e;});
}
function clearProposal() {
  state.proposal = null;
  document.querySelector('#rewrite-apply').disabled = true;
  document.querySelector('#rewrite-preview').replaceChildren();
}
function invalidateReview() {
  state.revision += 1;
  state.confirmed = false;
  els.confirm.classList.remove('confirmed');
  els.confirm.textContent = '人工确认';
  state.undo = null;
  document.querySelector('#rewrite-undo').disabled = true;
  clearProposal();
}
els.canvas.addEventListener('input', (event) => {
  const node = event.target.closest('[data-edit-id]');
  if (!node) return;
  state.edits[node.dataset.editId] = node.innerText;
  state.provenance[node.dataset.editId] = { statement_type: '作者观点（人工输入，待复核）', source_id: `${projectKey()}:${node.dataset.editId}`, updated_at: new Date().toISOString() };
  invalidateReview();
  saveDraft();
});
els.canvas.addEventListener('paste', (event) => {
  if (!event.target.closest('[contenteditable="true"]')) return;
  event.preventDefault();
  document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
});

function aiBlocks() {
  return [...els.canvas.querySelectorAll('[data-ai="true"]')].map((node) => ({ id: node.dataset.editId, text: node.innerText }));
}
function updateRewriteControls() {
  document.querySelector('#rewrite-btn').disabled = state.exporting || !state.measureParams || !aiBlocks().length || state.rewriting;
}
document.querySelector('#rewrite-btn').addEventListener('click', async () => {
  const blocks = aiBlocks();
  const style=document.querySelector('#rewrite-style').value;
  const rewriteMode=style==='扩展信息'?'expand':'concise';
  const unit=state.snapshot?.units?.find(u=>u.name===els.unitName.value);
  const parameters={...state.measureParams,...unit?.parameters};
  const revision = state.revision;
  const pageIndex = state.current;
  clearProposal();
  const status = document.querySelector('#rewrite-status');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 95000);
  state.rewriting = true;
  updateRewriteControls();
  status.textContent = 'DeepSeek 正在改写本页说明…';
  try {
    const response = await fetch('/api/deepseek/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({
        task: 'rewrite-ppt-report',
        context: { blocks, rewriteMode, pageTitle: pages[pageIndex].title, pageText: els.canvas.innerText.slice(0, 10000), parameters: parameterEvidence(els.canvas, parameters), statement_type: '工作草案，未经负责人审签' },
        messages: [{ role: 'user', content: `请${style}。${rewriteGuidance(rewriteMode)}仅改写给出的blocks；占位内容保留待确认，不补造设计事实。` }],
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `请求失败（${response.status}）`);
    if (revision !== state.revision || pageIndex !== state.current) throw new Error('页面或参数已变化，请重新改写');
    const proposal = validateRewrite(payload.content, blocks, rewriteMode);
    state.proposal = { ...proposal, revision, pageIndex };
    document.querySelector('#rewrite-preview').innerHTML = proposal.blocks.map((block, index) => `<div class="rewrite-diff"><div><b>原文</b><p>${escapeHtml(blocks[index].text)}</p></div><div><b>AI 建议 · 待确认</b><p>${escapeHtml(block.text)}</p></div></div>`).join('');
    status.textContent = proposal.warnings.length ? `待核对：${proposal.warnings.join('；')}` : '建议已生成，请核对含义后采纳。来源：本页原文及统一技术措施；陈述类型：AI推断。';
    document.querySelector('#rewrite-apply').disabled = false;
  } catch (error) {
    status.textContent = error.name === 'AbortError' ? '改写超时，请稍后重试。原文已保留。' : `${error.message}。原文已保留。`;
  } finally {
    clearTimeout(timer);
    state.rewriting = false;
    updateRewriteControls();
  }
});
document.querySelector('#rewrite-apply').addEventListener('click', () => {
  const proposal = state.proposal;
  if (!proposal || proposal.revision !== state.revision || proposal.pageIndex !== state.current) return;
  const before = { edits: { ...state.edits }, provenance: { ...state.provenance } };
  proposal.blocks.forEach((block) => {
    state.edits[block.id] = block.text;
    state.provenance[block.id] = { statement_type: 'AI推断（人工采纳，待复核）', source_id: `${projectKey()}:${block.id}`, parameter_version: state.snapshot.updated_at, updated_at: new Date().toISOString() };
  });
  invalidateReview();
  state.undo = before;
  document.querySelector('#rewrite-undo').disabled = false;
  saveDraft();
  renderSlide();
  document.querySelector('#rewrite-status').textContent = '已采纳 AI 建议，仍需人工确认；可撤销本次采纳。';
});
document.querySelector('#rewrite-undo').addEventListener('click', () => {
  if (!state.undo) return;
  state.edits = state.undo.edits;
  state.provenance = state.undo.provenance;
  invalidateReview();
  saveDraft();
  renderSlide();
  document.querySelector('#rewrite-status').textContent = '已恢复采纳前文字。';
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

window.WorkbenchPpt={canSign:()=>state.confirmed,busy:()=>draftLoading||imageLoading||state.exporting||state.rewriting,async flush(){await snapshotQueue;await saveDraft();await draftStore?.flush();}};
renderSlide();
renderImageManager();
requestMeasureSnapshot();
setInterval(requestMeasureSnapshot, 2000);

window.addEventListener('beforeunload',()=>{saveDraft().catch(()=>{});});
