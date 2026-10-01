import { exportReport } from './report-export.js';
import { validateRewrite, parameterEvidence } from './report-core.js';
import {projectPart} from '../../../project-store-client.js';
let draftStore, snapshotQueue=Promise.resolve(), draftLoading=false;
let unitDrafts={}, imageLoading=false;
const embedded=new URL(location.href).searchParams.get('embedded')==='1'&&window.parent!==window;

const pages = [
  { title: '封面', type: 'cover' },
  { title: '总体', type: 'section', sectionTitle: '总体' },
  { title: '项目鸟瞰图', type: 'photo', slot: '项目鸟瞰图' },
  { title: '结构设计概况', type: 'overview', section: '01', slot: '项目总平面图' },
  { title: '结构设计参数', type: 'parameters', section: '01' },
  { title: '代表单体', type: 'section', sectionTitle: '代表单体', center: true },
  { title: '单体概况', type: 'unit-overview', section: '02', slots: ['建筑效果图', '结构计算模型'] },
  { title: '建筑与结构布置', type: 'pair', section: '02', slots: ['典型建筑平面', '典型结构平面'] },
  { title: '典型结构平面', type: 'single-plan', section: '02', slot: '结构平面图' },
  { title: '构件尺寸与结构模型', type: 'model', section: '02', slot: '结构计算模型' },
  { title: '结构不规则与抗震措施', type: 'audit', section: '02', slot: '判定依据或关键平面' },
  { title: '结构特点及难点', type: 'difficulty', section: '02', slot: '重难点位置示意图' },
  { title: '方案比选', type: 'comparison', section: '02', slots: ['方案一示意图', '方案二示意图'] },
  { title: '计算结果', type: 'results', section: '02', slot: '计算结果图' },
  { title: '设计结论', type: 'conclusion', section: '02', slot: '单体结构模型或最终方案图' },
  { title: '结束页', type: 'thanks' },
];

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
  const page = pages[state.current];
  const unit = els.unitName.value.trim() || '[代表单体]';
  let html = '';

  if (page.type === 'cover') {
    html = `<div class="ppt-cover"><div class="cover-band"><h1 >${linked('project_name')}扩初设计汇报</h1></div><div class="cover-date" contenteditable="true" spellcheck="false">[汇报日期]</div></div>`;
  } else if (page.type === 'section') {
    html = `<div class="ppt-section${page.center ? ' center' : ''}"><div class="section-band"><h2 contenteditable="true" spellcheck="false">${page.center ? page.sectionTitle : `——  ${page.sectionTitle}  ——`}</h2></div></div>`;
  } else if (page.type === 'photo') {
    html = `<figure class="ppt-photo">${imageSlot(page.slot)}<figcaption contenteditable="true" spellcheck="false">项目鸟瞰图</figcaption></figure>`;
  } else if (page.type === 'overview') {
    const overviewText = state.measureParams
      ? `项目地点：${linked('region')}<br>抗震设防：${linked('intensity')} 度，${linked('seismic_cat')}<br>场地类别：${linked('site_class')}`
      : '项目总体说明';
    html = pageFrame(page, `<div class="layout-overview">${imageSlot(page.slot)}<div class="overview-copy"><div class="editable-copy" contenteditable="true" spellcheck="false">${overviewText}</div>${table(['建筑单体','结构体系','地上/地下层数','设防方式'], [[unit,param('struct_sys'),param('unit_floors'),param('has_iso')]])}</div></div>`);
  } else if (page.type === 'parameters') {
    html = pageFrame(page, `<div class="layout-parameters">${table(['参数','取值','参数','取值'], [['结构设计使用年限','[填写]', '结构重要性系数',param('gamma0')],['建筑结构安全等级',param('safety_grade'),'建筑抗震设防类别',param('seismic_cat')],['地基基础设计等级',param('found_grade'),'抗震设防烈度',param('intensity', ' 度')],['设计地震分组',param('eq_group'),'场地类别',param('site_class')]])}${table(['荷载类别','标准值','说明'], [['基本风压',param('wind', ' kN/m²'),param('wind_shape')],['基本雪压',param('snow', ' kN/m²'),param('snow_zone')],['楼面活荷载','[填写]','按主要功能列示']])}</div>`);
  } else if (page.type === 'unit-overview') {
    html = pageFrame(page, `<div class="layout-pair">${imageSlot('建筑效果图')}${imageSlot('结构计算模型')}</div><div style="height:18%;margin-top:4.5%">${table(['地上/地下层数','长×宽','结构高度','主要跨度','结构体系','框架抗震等级'], [[param('unit_floors'),'[填写]',param('height_m',' m'),param('span_m',' m'),param('struct_sys'),param('g_frame')]])}</div>`, `${unit}结构设计`);
  } else if (page.type === 'pair') {
    html = pageFrame(page, `<div class="layout-pair">${imageSlot(page.slots[0])}${imageSlot(page.slots[1])}</div>`);
  } else if (page.type === 'single-plan') {
    html = pageFrame(page, `<div class="layout-difficulty"><div class="difficulty-title" contenteditable="true" spellcheck="false">[楼层名称]</div>${imageSlot(page.slot)}</div>`);
  } else if (page.type === 'model') {
    html = pageFrame(page, `<div class="layout-model"><div class="model-copy" contenteditable="false" spellcheck="false">结构体系：${linked('struct_sys')}<br>嵌固端：${linked('fixed_end')}<br>周期折减系数：${linked('period_reduce')}<br>结构阻尼比：${linked('damping')}<br>有效质量参与系数下限： ${linked('mass_participation')}%</div>${imageSlot(page.slot, { dark: true })}</div>`);
  } else if (page.type === 'audit') {
    html = pageFrame(page, `<div class="layout-audit">${table(['统一技术措施项目','取值','处理措施'], [['抗震设防类别',param('seismic_cat'),'按统一措施执行'],['抗震措施提高一度',param('seismic_up'),'按统一措施执行'],['考虑偶然偏心',param('ecc_ratio'),'模型复核'],['考虑双向地震作用',param('bidir_eq'),'模型复核'],['考虑竖向地震作用',param('vert_eq'),'专项复核']])}${imageSlot(page.slot)}</div><div class="confirm-line" contenteditable="true" spellcheck="false">结论：不规则性判定需结合当前图纸与模型复核，待人工确认</div>`);
  } else if (page.type === 'difficulty') {
    html = pageFrame(page, `<div class="layout-difficulty"><div class="difficulty-title linked-decisions" contenteditable="false">${linked('decision_summary')}</div>${imageSlot(page.slot)}</div>`);
  } else if (page.type === 'comparison') {
    html = pageFrame(page, `<div class="layout-comparison">${table(['方案','结构形式','适用条件','主要优点','主要限制'], [['方案一','[填写]','[填写]','[填写]','[填写]'],['方案二','[填写]','[填写]','[填写]','[填写]']])}<div class="layout-pair">${imageSlot(page.slots[0])}${imageSlot(page.slots[1])}</div></div>`);
  } else if (page.type === 'results') {
    html = pageFrame(page, `<div class="layout-results">${table(['验算项目','控制值','本批计算值','结论'], [['X向地震位移角','[填写]',param('model:drift_env_x'),'[待复核]'],['Y向地震位移角','[填写]',param('model:drift_env_y'),'[待复核]'],['扭转/平动周期比','[填写]',param('model:ratio_tt'),'[待复核]'],['第一振型周期(s)','—',param('model:T1'),'[待复核]']])}${imageSlot(page.slot)}</div><div class="confirm-line" contenteditable="true" spellcheck="false">结论：[人工确认内容]</div>`);
  } else if (page.type === 'conclusion') {
    html = pageFrame(page, `<div class="layout-conclusion"><div class="conclusion-copy" contenteditable="false" spellcheck="false">结构体系：${linked('struct_sys')}<br>设防标准：${linked('intensity')} 度，${linked('seismic_cat')}<br>场地类别：${linked('site_class')}<br>基础等级：${linked('foundation')}</div>${imageSlot(page.slot, { dark: true })}</div>`);
  } else {
    html = `<div class="ppt-cover"><h1 style="color:var(--ppt-red);font-weight:400" contenteditable="true" spellcheck="false">THANKS</h1></div>`;
  }

  els.canvas.innerHTML = html;
  // Parameter-containing prose is read-only as a whole, so paste/delete cannot erase a binding.
  els.canvas.querySelectorAll('[contenteditable="true"]').forEach((node) => {
    if (node.querySelector('[data-param]')) node.contentEditable = 'false';
  });
  if (!['cover', 'section', 'photo', 'thanks', 'parameters'].includes(page.type)) {
    const body = els.canvas.querySelector('.ppt-body');
    const note = document.createElement('div');
    note.className = 'report-narrative';
    note.contentEditable = 'true';
    note.dataset.ai = 'true';
    note.textContent = '[待补充本页汇报要点]';
    body.appendChild(note);
  }
  els.canvas.querySelectorAll('[contenteditable="true"]').forEach((node, index) => {
    node.dataset.editId = `${[3,6,11,13].includes(state.current)?'v2:':''}${state.current}:${index}`;
    const saved = state.edits[node.dataset.editId];
    if (typeof saved === 'string') node.textContent = saved;
    if (node.matches('.difficulty-title,.confirm-line')) node.dataset.ai = 'true';
  });
  updateRewriteControls();
  els.currentNumber.textContent = String(state.current + 1).padStart(2, '0');
  els.currentTitle.textContent = page.title;
  els.pagerLabel.textContent = `${state.current + 1} / ${pages.length}`;
  els.prev.disabled = state.current === 0;
  els.next.disabled = state.current === pages.length - 1;
  renderPageList();
  let oldCopy=document.querySelector('#legacy-page-copy');
  if(!oldCopy){oldCopy=document.createElement('div');oldCopy.id='legacy-page-copy';document.querySelector('#link-status').after(oldCopy);}
  const legacy=[3,6,11,13].includes(state.current)?Object.entries(state.edits).filter(([k])=>k.startsWith(state.current+':')):[];
  oldCopy.innerHTML=legacy.length?'<details><summary>查看本页升级前的手工文稿（保留供迁入）</summary><p>本页部分单元格已改为参数联动；旧文稿按原顺序保留，请将仍适用的内容复制到本页汇报要点。</p><pre style="white-space:pre-wrap">'+escapeHtml(legacy.map(([,v])=>v).join('\n\n'))+'</pre></details>':'';
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
  document.querySelector('#link-status').textContent = `已联动项目 / 单体资料、确认的重难点及模型结果 · ${new Date(snapshot.updated_at).toLocaleTimeString()} 更新。输入变化后需重新人工确认。`;
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
    const slides = [];
    for (let index = 0; index < pages.length; index += 1) {
      state.current = index;
      renderSlide();
      await document.fonts.ready;
      await Promise.all([...els.canvas.querySelectorAll('img')].map((img) => img.decode()));
      slides.push(await exportReport.capture(els.canvas, pages[index].title));
    }
    await exportReport.download(slides, {
      project: els.projectName.value,
      confirmed: state.confirmed,
      snapshot: state.snapshot,
      provenance: state.provenance,
    });
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
  return draftStore.save({layoutVersion:2,edits:state.edits,provenance:state.provenance,unit:els.unitName.value,images:Object.fromEntries(state.images),unitDrafts,parameterVersion:state.snapshot?.parameter_version}).catch(e=>{showToast('PPT未保存到项目库：'+e.message);throw e;});
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
        context: { blocks, pageTitle: pages[pageIndex].title, pageText: els.canvas.innerText.slice(0, 10000), parameters: parameterEvidence(els.canvas, state.measureParams), statement_type: '工作草案，未经负责人审签' },
        messages: [{ role: 'user', content: `请${document.querySelector('#rewrite-style').value}。仅改写给出的blocks；占位内容保留待确认，不补造设计事实。` }],
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `请求失败（${response.status}）`);
    if (revision !== state.revision || pageIndex !== state.current) throw new Error('页面或参数已变化，请重新改写');
    const proposal = validateRewrite(payload.content, blocks);
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
