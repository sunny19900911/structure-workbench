const CALCBOOK_KEY = 'wb_calcbook_catalog_v3';
const CALCBOOK_SECTION_TITLES = ['计算书目录', '上部结构', '基础', '其他（需要自行补充）'];
const CALCBOOK_SECTION_NUMERALS = ['一', '二', '三', '四'];
const calcbookState = {
  sections: [], defaults: [], ready: false, exporting: false,
  workbooks: [], workbookKey: '', sheetName: '', sheetData: null,
  edits: {}, linkedExcel: null, outFiles: [],
};

function calcbookFallbackSections() {
  return calcbookCloneSections(window.CalculationBookCatalog?.sections || []);
}

function calcbookNormalizeSections(value) {
  return CALCBOOK_SECTION_TITLES.map((title, index) => ({
    title: typeof value?.[index]?.title === 'string' && value[index].title.trim() ? value[index].title.trim() : title,
    items: Array.isArray(value?.[index]?.items)
      ? value[index].items.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()).slice(0, 80)
      : [],
  }));
}

function calcbookCloneSections(value) {
  return calcbookNormalizeSections(value).map((section) => ({ ...section, items: [...section.items] }));
}

function calcbookProjectSections(saved = {}) {
  const items = saved.sections?.map(section => section.items);
  const legacy = !saved.catalogVersion && items?.length === 4 &&
    items[0]?.length === 1 && items[0][0] === '计算书封面及目录' &&
    items[1]?.length === 1 && /^计算信息-小震[（(]wmass、wdisp、wzq[）)]$/.test(items[1][0]) &&
    items[2]?.length === 0 && items[3]?.length === 0;
  return calcbookCloneSections(!saved.sections || legacy
    ? (calcbookState.defaults.length ? calcbookState.defaults : calcbookFallbackSections()) : saved.sections);
}

function calcbookItemCount() {
  return calcbookState.sections.reduce((total, section) => total + section.items.length, 0);
}

function calcbookEsc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function calcbookParam(key, fallback = '') {
  const field = document.querySelector(`[data-k="${key}"]`);
  if (field) return String(field.value ?? field.textContent ?? '').trim() || fallback;
  const inherited = document.querySelector(`[data-inh="${key}"]`);
  return String(inherited?.textContent ?? '').trim() || fallback;
}

function calcbookProject() {
  const stage = document.getElementById('pstage-sel')?.value || '施工图';
  const disciplineRaw = calcbookParam('discipline', '结构');
  return {
    project_name: calcbookParam('project_name', '待填写项目名称'),
    project_code: calcbookParam('project_code', '待填写'),
    stage,
    discipline: disciplineRaw.split('/')[0].trim() || '结构',
    company: calcbookParam('designer', '待填写设计单位'),
  };
}

function calcbookSave() {
  window.WorkbenchProjects?.scheduleSave();
}

function calcbookLoadSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(CALCBOOK_KEY) || 'null');
    return Array.isArray(saved) && saved.length === 4 ? calcbookNormalizeSections(saved) : null;
  } catch (_) { return null; }
}

function calcbookResetConfirmation() {
  const checkbox = document.getElementById('calcbook-confirmed');
  if (checkbox) checkbox.checked = false;
  calcbookSyncExportButton();
}

function calcbookSyncExportButton() {
  const checked = Boolean(document.getElementById('calcbook-confirmed')?.checked);
  const button = document.getElementById('calcbook-export');
  if (button) button.disabled = !checked || calcbookState.exporting || !calcbookState.ready || !calcbookItemCount();
}

function calcbookRenderCatalog() {
  const list = document.getElementById('calcbook-list');
  const count = document.getElementById('calcbook-count');
  if (!list || !count) return;
  const itemCount = calcbookItemCount();
  count.textContent = `4 个大标题 · ${itemCount} 个小标题`;
  const sectionSelect = document.getElementById('calcbook-new-section');
  if (sectionSelect) calcbookState.sections.forEach((section, index) => {
    if(sectionSelect.options[index]) sectionSelect.options[index].textContent = CALCBOOK_SECTION_NUMERALS[index]+'、'+section.title;
  });
  list.innerHTML = calcbookState.sections.map((section, sectionIndex) => `
    <section class="calcbook-group">
      <div class="calcbook-group-title"><span>${CALCBOOK_SECTION_NUMERALS[sectionIndex]}、</span>${calcbookEsc(section.title)}</div>
      ${section.items.length ? `<ol class="calcbook-group-list">${section.items.map((item, index) => `
        <li class="calcbook-item">
          <span class="calcbook-index">${index + 1}</span>
          <span class="calcbook-title">${calcbookEsc(item)}</span>
          <span class="calcbook-item-actions">
            <button class="calcbook-move" type="button" data-action="up" data-section="${sectionIndex}" data-index="${index}" ${index === 0 ? 'disabled' : ''} title="在本组内上移">↑</button>
            <button class="calcbook-move" type="button" data-action="down" data-section="${sectionIndex}" data-index="${index}" ${index === section.items.length - 1 ? 'disabled' : ''} title="在本组内下移">↓</button>
            <button class="calcbook-remove" type="button" data-action="remove" data-section="${sectionIndex}" data-index="${index}">删除</button>
          </span>
        </li>`).join('')}</ol>` : '<div class="calcbook-group-empty">本组暂无小标题，可在上方选择本组后添加。</div>'}
    </section>`).join('');
  list.querySelectorAll('button[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const sectionIndex = Number(button.dataset.section);
      const index = Number(button.dataset.index);
      if (button.dataset.action === 'remove') calcbookRemove(sectionIndex, index);
      else calcbookMove(sectionIndex, index, button.dataset.action === 'up' ? -1 : 1);
    });
  });

  const toc = document.getElementById('calcbook-toc');
  if (toc) toc.innerHTML = calcbookState.sections.map((section, sectionIndex) => `
    <div class="calcbook-toc-section">
      <strong>${CALCBOOK_SECTION_NUMERALS[sectionIndex]}、${calcbookEsc(section.title)}</strong>
      ${section.items.length ? `<ol>${section.items.map((item) => `<li>${calcbookEsc(item)}</li>`).join('')}</ol>` : '<span>（待补充）</span>'}
    </div>`).join('');
  const more = document.getElementById('calcbook-more');
  if (more) {
    more.textContent = '四个大标题固定；小标题按所属分组分别编号，并按当前组内顺序写入 Word。';
  }
  calcbookSyncExportButton();
}

function calcbookChanged() {
  calcbookSave();
  calcbookResetConfirmation();
  calcbookRenderCatalog();
}

function calcbookAdd() {
  const sectionIndex = Number(document.getElementById('calcbook-new-section')?.value || 0);
  const input = document.getElementById('calcbook-new-title');
  const title = String(input?.value || '').replace(/\s+/g, ' ').trim();
  if (!title) return input?.focus();
  if (!calcbookState.sections[sectionIndex]) return;
  calcbookState.sections[sectionIndex].items.push(title);
  input.value = '';
  calcbookChanged();
}

function calcbookRemove(sectionIndex, index) {
  const items = calcbookState.sections[sectionIndex]?.items;
  if (!items || !Number.isInteger(index) || index < 0 || index >= items.length) return;
  items.splice(index, 1);
  calcbookChanged();
}

function calcbookMove(sectionIndex, index, direction) {
  const items = calcbookState.sections[sectionIndex]?.items;
  if (!items) return;
  const target = index + direction;
  if (index < 0 || target < 0 || target >= items.length) return;
  [items[index], items[target]] = [items[target], items[index]];
  calcbookChanged();
}

function calcbookReset() {
  calcbookState.sections = calcbookCloneSections(calcbookState.defaults.length ? calcbookState.defaults : calcbookFallbackSections());
  calcbookChanged();
}

function calcbookFileName(response, fallback) {
  const header = response.headers.get('Content-Disposition') || '';
  const encoded = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (encoded) {
    try { return decodeURIComponent(encoded[1]); } catch (_) {}
  }
  return fallback;
}

function calcbookEditKey() {
  return `${calcbookState.workbookKey}::${calcbookState.sheetName}`;
}

function calcbookColumnName(index) {
  let value = index + 1;
  let name = '';
  while (value > 0) {
    const digit = (value - 1) % 26;
    name = String.fromCharCode(65 + digit) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function calcbookRenderSheet() {
  const table = document.getElementById('calcbook-excel-table');
  const state = document.getElementById('calcbook-excel-state');
  const help = document.getElementById('calcbook-excel-help');
  const data = calcbookState.sheetData;
  if (!table || !state || !data) return;
  const editMap = calcbookState.edits[calcbookEditKey()] || {};
  const header = Array.from({ length: data.column_count }, (_, index) => `<th>${calcbookColumnName(data.min_col - 1 + index)}</th>`).join('');
  table.innerHTML = `<thead><tr><th class="row-head"></th>${header}</tr></thead><tbody>${data.rows.map((row) => `
    <tr><th class="row-head">${row.row}</th>${row.cells.map((cell) => {
      const current = cell.formula&&window.WorkbenchProjects?.mode!=='sample' ? '【导出时重算／宏表需复核】' : Object.prototype.hasOwnProperty.call(editMap, cell.coordinate) ? editMap[cell.coordinate] : cell.display;
      const editable = cell.editable ? ' contenteditable="true"' : '';
      const kind = cell.formula ? 'formula' : '';
      return `<td class="${kind}" data-cell="${cell.coordinate}"${editable} title="${calcbookEsc(cell.formula || cell.coordinate)}">${calcbookEsc(current)}</td>`;
    }).join('')}</tr>`).join('')}</tbody>`;
  table.querySelectorAll('td[contenteditable="true"]').forEach((cell) => {
    cell.addEventListener('blur', () => {
      const key = calcbookEditKey();
      if (!calcbookState.edits[key]) calcbookState.edits[key] = {};
      calcbookState.edits[key][cell.dataset.cell] = cell.textContent.trim();
      calcbookSave();
      calcbookState.linkedExcel = null;
      document.getElementById('calcbook-excel-link').textContent = '联动到计算书';
      calcbookResetConfirmation();
    });
  });
  state.textContent = `参考模板 · ${data.used_range} · ${data.formula_count} 个公式（需核对本项目输入）`;
  help.textContent = data.workbook === 'stair' || data.has_custom_formulas
    ? '历史模板参考：该宏表含自定义函数，本页不能重算；导出仍使用模板已有结果，必须在Excel复算并核对后采用。'
    : '黄色输入格可编辑；公式格只读，跃层柱 3 个公式会在导出时按输入重新计算。';
}

let calcbookLoadTicket=0;
async function calcbookLoadSheet() {
  const ticket=++calcbookLoadTicket,project=window.WorkbenchProjects?.id;
  if (!calcbookState.workbookKey || !calcbookState.sheetName) return;
  const state = document.getElementById('calcbook-excel-state');
  state.textContent = '正在读取…';
  try {
    const query = new URLSearchParams({ workbook: calcbookState.workbookKey, sheet: calcbookState.sheetName });
    const response = await fetch(`/api/calculation-book/workbook?${query}`, { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Excel 读取失败');
    if(ticket!==calcbookLoadTicket||project!==window.WorkbenchProjects?.id)return;
    calcbookState.sheetData = payload;
    const key=calcbookEditKey();
    if(window.WorkbenchProjects?.mode!=='sample'&&payload.workbook==='jump-column'&&!calcbookState.edits[key]){
      calcbookState.edits[key]={A1:calcbookProject().project_name,B2:'',B3:'',B4:'',B5:'',B7:'',B9:''};
    }
    calcbookRenderSheet();
  } catch (error) {
    state.textContent = error?.message || 'Excel 读取失败';
  }
}

function calcbookSelectWorkbook() {
  calcbookState.workbookKey = document.getElementById('calcbook-workbook')?.value || '';
  const workbook = calcbookState.workbooks.find((item) => item.key === calcbookState.workbookKey);
  const sheetSelect = document.getElementById('calcbook-sheet');
  const sheets = workbook?.sheets || [];
  sheetSelect.innerHTML = sheets.map((sheet) => `<option value="${calcbookEsc(sheet.name)}">${calcbookEsc(sheet.name)}</option>`).join('');
  calcbookState.sheetName = sheets[0]?.name || '';
  calcbookState.sheetData = null;
  calcbookLoadSheet();
}

function calcbookLinkExcel() {
  if (!calcbookState.sheetData) return;
  const edits=calcbookState.edits[calcbookEditKey()]||{};
  if(calcbookState.workbookKey==='jump-column'&&window.WorkbenchProjects?.mode!=='sample'&&['B2','B3','B4','B5','B7','B9'].some(k=>!Number.isFinite(Number(edits[k]))||Number(edits[k])<=0)){
    document.getElementById('calcbook-excel-state').textContent='请先填写本项目 B2、B3、B4、B5、B7、B9 的有效正数';return;
  }
  calcbookState.linkedExcel = {
    workbook: calcbookState.workbookKey,
    sheet: calcbookState.sheetName,
    edits: { ...(calcbookState.edits[calcbookEditKey()] || {}) },
  };
  const workbook = calcbookState.workbooks.find((item) => item.key === calcbookState.workbookKey);
  const title = `${workbook?.label || 'Excel'} · ${calcbookState.sheetName}`;
  const otherItems = calcbookState.sections[3].items;
  if (!otherItems.includes(title)) otherItems.push(title);
  document.getElementById('calcbook-excel-link').textContent = '已联动';
  calcbookChanged();
}

function calcbookBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

async function calcbookReadOutFiles(files) {
  const project=window.WorkbenchProjects?.id;
  const allowed = new Set(['wmass.out', 'wdisp.out', 'wzq.out']);
  const selected = [...files].filter((file) => allowed.has(file.name.toLowerCase())).slice(0, 3);
  const loadedFiles = await Promise.all(selected.map(async (file) => ({
    name: file.name,
    size: file.size,
    content_base64: calcbookBase64(await file.arrayBuffer()),
  })));
  if(project!==window.WorkbenchProjects?.id)return;
  calcbookState.outFiles=loadedFiles;calcbookSave();calcbookRenderOutFiles();
  calcbookResetConfirmation();
}
function calcbookRenderOutFiles(){
  const list = document.getElementById('calcbook-out-list');
  const state = document.getElementById('calcbook-out-state');
  const present = new Set(calcbookState.outFiles.map((file) => file.name.toLowerCase()));
  const names = ['wmass.out', 'wdisp.out', 'wzq.out'];
  list.innerHTML = names.map((name) => {
    const file = calcbookState.outFiles.find((item) => item.name.toLowerCase() === name);
    return `<li><b>${name.toUpperCase()}</b><span>${file ? `${Math.ceil(file.size / 1024)} KB · 已就绪` : '未选择'}</span></li>`;
  }).join('');
  state.textContent = `${calcbookState.outFiles.length}/3 已选择`;
  state.style.color = present.size === 3 ? '#17603c' : '';
  calcbookResetConfirmation();
}

async function calcbookExport() {
  const status = document.getElementById('calcbook-status');
  const confirmed = Boolean(document.getElementById('calcbook-confirmed')?.checked);
  if (!confirmed) {
    status.textContent = '请先勾选“是否已人工确认”。';
    status.className = 'calcbook-status error';
    return;
  }
  calcbookState.exporting = true;
  calcbookSyncExportButton();
  status.textContent = '正在按 A3 版式生成 Word…';
  status.className = 'calcbook-status';
  try {
    const project = calcbookProject();
    const response = await fetch('/api/calculation-book/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...project, confirmed: true, sections: calcbookState.sections,
        excel_blocks: calcbookState.linkedExcel ? [calcbookState.linkedExcel] : [],
        out_files: calcbookState.outFiles,
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `导出失败（HTTP ${response.status}）`);
    }
    const blob = await response.blob();
    const fallback = `${project.project_name}_结构计算书_A3.docx`.replace(/[\\/:*?"<>|]/g, '_');
    const fileName = calcbookFileName(response, fallback);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    status.textContent = 'A3 Word 已生成并开始下载。';
  } catch (error) {
    status.textContent = error?.message || 'Word 生成失败。';
    status.className = 'calcbook-status error';
  } finally {
    calcbookState.exporting = false;
    calcbookSyncExportButton();
  }
}

async function calcbookInit() {
  const badge = document.getElementById('calcbook-ready');
  try {
    const response = await fetch('/api/calculation-book/status', { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || '计算书资料连接失败');
    calcbookState.defaults = Array.isArray(payload.sections) ? calcbookNormalizeSections(payload.sections) : calcbookFallbackSections();
    calcbookState.sections = calcbookCloneSections(calcbookState.defaults);
    calcbookState.ready = Boolean(payload.ready);
    calcbookState.workbooks = Array.isArray(payload.workbooks) ? payload.workbooks : [];
    badge.textContent = calcbookState.ready
      ? `${payload.word_count} 份 Word · ${calcbookState.workbooks.length} 份 Excel 已连接`
      : '计算书输入不完整';
    badge.classList.toggle('ok', calcbookState.ready);
    const workbookSelect = document.getElementById('calcbook-workbook');
    workbookSelect.innerHTML = calcbookState.workbooks.map((item) => `<option value="${calcbookEsc(item.key)}">${calcbookEsc(item.label)}</option>`).join('');
    calcbookState.workbookKey = calcbookState.workbooks[0]?.key || '';
    calcbookSelectWorkbook();
  } catch (error) {
    calcbookState.defaults = calcbookFallbackSections();
    calcbookState.sections = calcbookFallbackSections();
    calcbookState.ready = false;
    badge.textContent = location.protocol === 'file:'
      ? '当前为文件直开；请运行“启动Demo.cmd”使用完整功能'
      : (error?.message || '计算书服务未连接');
  }
  calcbookRenderCatalog();
  calcbookReadOutFiles([]);
}

document.getElementById('calcbook-add')?.addEventListener('click', calcbookAdd);
document.getElementById('calcbook-new-title')?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') calcbookAdd();
});
document.getElementById('calcbook-reset')?.addEventListener('click', calcbookReset);
document.getElementById('calcbook-confirmed')?.addEventListener('change', calcbookRenderCatalog);
document.getElementById('calcbook-export')?.addEventListener('click', calcbookExport);
document.getElementById('calcbook-workbook')?.addEventListener('change', calcbookSelectWorkbook);
document.getElementById('calcbook-sheet')?.addEventListener('change', (event) => {
  calcbookState.sheetName = event.target.value;
  calcbookState.sheetData = null;
  calcbookLoadSheet();
});
document.getElementById('calcbook-excel-link')?.addEventListener('click', calcbookLinkExcel);
document.getElementById('calcbook-out-files')?.addEventListener('change', (event) => calcbookReadOutFiles(event.target.files));
document.getElementById('pstage-sel')?.addEventListener('change', calcbookResetConfirmation);
document.querySelectorAll('[data-k="project_name"],[data-k="project_code"],[data-k="discipline"],[data-k="designer"]').forEach((field) => {
  field.addEventListener('input', calcbookResetConfirmation);
});

window.CalculationBook={
 ready:calcbookInit(),busy:()=>calcbookState.exporting,
 capture(){return JSON.parse(JSON.stringify({catalogVersion:2,sections:calcbookState.sections,pdfSources:window.CalculationPDFs?.capture(),edits:calcbookState.edits,linkedExcel:calcbookState.linkedExcel,outFiles:calcbookState.outFiles,workbookKey:calcbookState.workbookKey,sheetName:calcbookState.sheetName}));},
 async loadProject(saved,mode){
  ++calcbookLoadTicket;const data=saved||{};
  calcbookState.sections=calcbookProjectSections(data);
  window.CalculationPDFs?.load(data.pdfSources);
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
