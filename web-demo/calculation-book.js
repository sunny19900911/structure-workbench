const CALCBOOK_KEY = 'wb_calcbook_catalog_v3';
const CALCBOOK_SECTION_TITLES = ['计算书目录', '上部结构', '基础', '其他（需要自行补充）'];
const CALCBOOK_SECTION_NUMERALS = ['一', '二', '三', '四'];
const calcbookState = {
  sections: [], defaults: [], ready: false, exporting: false,
  workbooks: [], workbookKey: '', sheetName: '', sheetData: null,
  edits: {}, linkedExcel: null, outFiles: [], assetsRevision: 0,
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
  if (button) button.disabled = calcbookState.exporting;
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

function calcbookApiUrl(path, query = {}) {
  const params = new URLSearchParams(query);
  if (window.WORKBENCH_PORTABLE && window.WorkbenchProjects?.id) params.set('project', window.WorkbenchProjects.id);
  return path + (params.size ? '?' + params : '');
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
      let current = cell.formula&&window.WorkbenchProjects?.mode!=='sample' ? '【导出时重算／宏表需复核】' : Object.prototype.hasOwnProperty.call(editMap, cell.coordinate) ? editMap[cell.coordinate] : cell.display;
      if (window.WORKBENCH_PORTABLE && cell.formula) current = data.can_recalculate && ['B6','B8','B10'].includes(cell.coordinate) ? '【导出时重算】' : (data.missing_formula_cache || []).includes(cell.coordinate) || (data.formula_errors || []).includes(cell.coordinate) ? '【缺少有效公式结果】' : cell.display;
      const editable = cell.editable && (!window.WORKBENCH_PORTABLE || data.can_recalculate && data.formula_count === 3 || !data.formula_count) ? ' contenteditable="true"' : '';
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
  if (window.WORKBENCH_PORTABLE) {
    const unresolved = (data.missing_formula_cache || []).concat(data.formula_errors || []).filter(cell => !(data.can_recalculate && ['B6','B8','B10'].includes(cell)));
    help.textContent = data.can_recalculate && data.formula_count === 3
      ? '本项目输入格可编辑；三个已核对的跃层柱公式在导出时重算。'
      : data.formula_count ? '此表按 Excel 已保存结果只读显示。请在 Excel 中复算并保存后重新导入；本地版不运行宏。' : '输入格可编辑，原始 Excel 不会被覆盖。';
    if (unresolved.length) help.textContent += ' 公式结果缺失或错误：' + unresolved.slice(0, 20).join('、') + '；包含本表的导出会停止。';
    help.textContent += ' 导出范围：' + data.used_range + '。';
  }
}

let calcbookLoadTicket=0;
async function calcbookLoadSheet() {
  const ticket=++calcbookLoadTicket,project=window.WorkbenchProjects?.id;
  calcbookState.sheetData = null;
  document.getElementById('calcbook-excel-table')?.replaceChildren();
  if (!calcbookState.workbookKey || !calcbookState.sheetName) return;
  const state = document.getElementById('calcbook-excel-state');
  state.textContent = '正在读取…';
  try {
    const query = { workbook: calcbookState.workbookKey, sheet: calcbookState.sheetName };
    const response = await fetch(calcbookApiUrl('/api/calculation-book/workbook', query), { cache: 'no-store' });
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
    if(ticket!==calcbookLoadTicket||project!==window.WorkbenchProjects?.id)return;
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
  return calcbookLoadSheet();
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
  if (calcbookState.exporting) return;
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
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 240000);
  try {
    if (!calcbookState.ready) {
      await calcbookInit();
      if (!calcbookState.ready) throw Error(document.getElementById('calcbook-ready').textContent);
    }
    const project = calcbookProject();
    const response = await fetch('/api/calculation-book/export', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...project, confirmed: true, sections: calcbookState.sections,
        ...(window.WORKBENCH_PORTABLE ? {project_id: window.WorkbenchProjects?.id || ''} : {}),
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
    status.textContent = error.name === 'AbortError' ? 'Word 生成超时，请重试。' : error?.message || 'Word 生成失败。';
    status.className = 'calcbook-status error';
  } finally {
    clearTimeout(timer);
    calcbookState.exporting = false;
    calcbookSyncExportButton();
  }
}

async function calcbookInit({deferSheet = false} = {}) {
  const badge = document.getElementById('calcbook-ready');
  const project = window.WorkbenchProjects?.id;
  try {
    const response = await fetch(calcbookApiUrl('/api/calculation-book/status'), { cache: 'no-store', signal: AbortSignal.timeout(30000) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || '计算书资料连接失败');
    if (project !== window.WorkbenchProjects?.id) return;
    calcbookState.defaults = payload.sections?.some(section => section.items?.length) ? calcbookNormalizeSections(payload.sections) : calcbookFallbackSections();
    if (!calcbookState.sections.length) calcbookState.sections = calcbookCloneSections(calcbookState.defaults);
    calcbookState.ready = Boolean(payload.ready);
    calcbookState.workbooks = Array.isArray(payload.workbooks) ? payload.workbooks : [];
    calcbookState.assetsRevision = Number.isSafeInteger(payload.assetsRevision) ? payload.assetsRevision : 0;
    document.querySelectorAll('a[href*="/api/calculation-book/template/"]').forEach(link => {
      const url = new URL(link.href, location.href), key = url.pathname.split('/').at(-1);
      if (window.WORKBENCH_PORTABLE) { if (project) url.searchParams.set('project', project); else url.searchParams.delete('project'); link.href = url.pathname + url.search; }
      if (key === 'catalog') link.hidden = !payload.templates?.catalog;
    });
    badge.textContent = calcbookState.ready
      ? `Word 生成已就绪 · ${calcbookState.workbooks.length} 份 Excel 已连接`
      : '计算书输入不完整';
    badge.classList.toggle('ok', calcbookState.ready);
    const workbookSelect = document.getElementById('calcbook-workbook');
    workbookSelect.innerHTML = calcbookState.workbooks.map((item) => `<option value="${calcbookEsc(item.key)}">${calcbookEsc(item.label)}</option>`).join('');
    calcbookState.workbookKey = calcbookState.workbooks[0]?.key || '';
    if (!deferSheet) calcbookSelectWorkbook();
    if (!calcbookState.workbooks.length) {
      document.getElementById('calcbook-excel-state').textContent = '未配置 Excel 母件';
      document.getElementById('calcbook-excel-help').textContent = window.WORKBENCH_PORTABLE ? '本项目尚未导入 Excel 母件，可点击“选择本机 Excel”。不影响 PDF 合并、Word 封面、目录和 OUT 导出。' : 'Excel 母件尚未放到服务器；不影响 PDF 合并或 Word 封面、目录和 OUT 导出。';
    }
    if (payload.sourceWarnings?.length) document.getElementById('calcbook-excel-help').textContent = '项目包中的 Excel 母件缺项：' + payload.sourceWarnings.join('；') + '。涉及该母件的生成会停止，不会套用其他项目。';
  } catch (error) {
    if (project !== window.WorkbenchProjects?.id) return;
    calcbookState.defaults = calcbookFallbackSections();
    if (!calcbookState.sections.length) calcbookState.sections = calcbookFallbackSections();
    calcbookState.ready = false;
    badge.textContent = location.protocol === 'file:'
      ? '当前为文件直开；请运行“启动Demo.cmd”使用完整功能'
      : (error?.message || '计算书服务未连接');
  }
  calcbookRenderCatalog();
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

if (window.WORKBENCH_PORTABLE) {
  const controls = document.querySelector('#calcbook-workbook')?.closest('.calcbook-tool-controls');
  if (controls) {
    const row = document.createElement('div'); row.className = 'calcbook-tool-controls';
    row.innerHTML = '<label>导入类型<select id="calcbook-source-slot"><option value="jump-column">跃层柱母件（XLSX）</option><option value="stair">楼梯母件（XLSM）</option></select></label><button class="calcbook-reset" id="calcbook-import-source" type="button">选择本机 Excel</button><input id="calcbook-source-file" type="file" accept=".xlsx,.xlsm" hidden>';
    controls.before(row);
    const input = row.querySelector('#calcbook-source-file'), button = row.querySelector('#calcbook-import-source');
    button.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      const file = input.files?.[0], key = row.querySelector('#calcbook-source-slot').value; input.value = ''; if (!file) return;
      window.WorkbenchProjects?.runOperation(async () => {
        if (file.size > 64 * 1024 * 1024) throw Error('Excel 母件最大 64 MB');
        await window.WorkbenchProjects.flush();
        const project = window.WorkbenchProjects.id, state = document.getElementById('calcbook-excel-state');
        state.textContent = '正在检查并导入本机母件…';
        try {
          const query = new URLSearchParams({project, slot: key, revision: String(calcbookState.assetsRevision)});
          const response = await fetch('/api/calculation-book/import-source?' + query, {method: 'POST', headers: {'X-Workbench-Request': 'calculation-source', 'X-File-Name': encodeURIComponent(file.name)}, body: file, signal: AbortSignal.timeout(180000)});
          const result = await response.json(); if (!response.ok) throw Error(result.error || 'Excel 母件导入失败');
          const archivePrefix = 'archived:' + Date.now() + ':';
          for (const [editKey, values] of Object.entries(calcbookState.edits)) if (editKey.startsWith(key + '::')) { calcbookState.edits[archivePrefix + editKey] = values; delete calcbookState.edits[editKey]; }
          if (calcbookState.linkedExcel?.workbook === key) calcbookState.linkedExcel = null;
          await calcbookInit({deferSheet: true});
          calcbookState.workbookKey = key; document.getElementById('calcbook-workbook').value = key; await calcbookSelectWorkbook();
          document.getElementById('calcbook-excel-link').textContent = calcbookState.linkedExcel ? '已联动' : '联动到计算书';
          calcbookChanged(); await window.WorkbenchProjects.flush();
          document.getElementById('wp-status').textContent = '母件已保存到当前项目，原文件未改动。' + (result.warnings?.length ? result.warnings.join('；') : '请核对后联动到计算书。');
        } catch (error) { state.textContent = error.message || 'Excel 母件导入失败'; throw error; }
      }, button);
    });
  }
}

window.CalculationBook={
 ready:calcbookInit(),busy:()=>calcbookState.exporting,
 capture(){return JSON.parse(JSON.stringify({catalogVersion:2,sections:calcbookState.sections,pdfSources:window.CalculationPDFs?.capture(),edits:calcbookState.edits,linkedExcel:calcbookState.linkedExcel,outFiles:calcbookState.outFiles,workbookKey:calcbookState.workbookKey,sheetName:calcbookState.sheetName}));},
 async loadProject(saved,mode){
  ++calcbookLoadTicket;const data=saved||{};
  if(window.WORKBENCH_PORTABLE)await calcbookInit({deferSheet:true});
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
window.CalculationBook.mcp={
 read(){return {project:calcbookProject(),...window.CalculationBook.capture(),outFiles:calcbookState.outFiles.map(({content_base64,...file})=>file),workbooks:calcbookState.workbooks,sheet:calcbookState.sheetData,assetsRevision:calcbookState.assetsRevision};},
 catalog(sections){if(!Array.isArray(sections)||sections.length!==4)throw Error('计算书需要四组目录');calcbookState.sections=calcbookCloneSections(sections);calcbookChanged();return this.read();},
 async excel({workbook,sheet,edits={},link=false}){
  const selected=calcbookState.workbooks.find(w=>w.key===workbook),project=window.WorkbenchProjects.id;
  if(!selected?.sheets.some(s=>s.name===sheet))throw Error('当前项目工作簿或工作表不存在');
  // Validate the complete request against the actual sheet before changing the
  // currently selected workbook, existing inputs or linked export block.
  const response=await fetch(calcbookApiUrl('/api/calculation-book/workbook',{workbook,sheet}),{cache:'no-store'}),data=await response.json();
  if(!response.ok)throw Error(data.error||'Excel读取失败');if(project!==window.WorkbenchProjects.id)throw Error('项目已切换');
  const allowed=new Set(data.rows.flatMap(row=>row.cells.filter(cell=>cell.editable&&(!window.WORKBENCH_PORTABLE||data.can_recalculate&&data.formula_count===3||!data.formula_count)).map(cell=>cell.coordinate)));
  for(const [cell,value]of Object.entries(edits))if(!allowed.has(cell)||typeof value!=='string')throw Error('该单元格不可编辑：'+cell);
  const key=workbook+'::'+sheet,defaults=workbook==='jump-column'&&window.WorkbenchProjects.mode!=='sample'?{A1:calcbookProject().project_name,B2:'',B3:'',B4:'',B5:'',B7:'',B9:''}:{},nextEdits={...(calcbookState.edits[key]||defaults),...edits};
  if(link&&workbook==='jump-column'&&window.WorkbenchProjects.mode!=='sample'&&['B2','B3','B4','B5','B7','B9'].some(cell=>!Number.isFinite(Number(nextEdits[cell]))||Number(nextEdits[cell])<=0))throw Error('请先填写本项目B2、B3、B4、B5、B7、B9有效正数');
  calcbookState.workbookKey=workbook;calcbookState.sheetName=sheet;calcbookState.sheetData=data;calcbookState.edits[key]=nextEdits;calcbookState.linkedExcel=null;
  document.getElementById('calcbook-workbook').value=workbook;document.getElementById('calcbook-sheet').innerHTML=selected.sheets.map(s=>'<option value="'+calcbookEsc(s.name)+'">'+calcbookEsc(s.name)+'</option>').join('');document.getElementById('calcbook-sheet').value=sheet;
  calcbookChanged();calcbookRenderSheet();if(link)calcbookLinkExcel();return this.read();
 },
 async model(files){if(files.some(f=>!/^w(mass|disp|zq)\.out$/i.test(f.name)))throw Error('计算书模型只接受WMASS、WDISP、WZQ.OUT');await calcbookReadOutFiles(files);return this.read();},
 package({confirmed=false}={}){return {...calcbookProject(),project_id:window.WorkbenchProjects.id,confirmed:confirmed===true,sections:calcbookCloneSections(calcbookState.sections),excel_blocks:calcbookState.linkedExcel?[JSON.parse(JSON.stringify(calcbookState.linkedExcel))]:[],out_files:JSON.parse(JSON.stringify(calcbookState.outFiles)),draft:true};},
};
