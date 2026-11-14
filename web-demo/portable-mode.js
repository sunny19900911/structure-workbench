/* The portable launcher opts in before this script. Online deployments keep their existing behaviour. */
(() => {
  if (window.WORKBENCH_PORTABLE !== true) return;
  document.documentElement.classList.add('workbench-portable');
  const root = new URL('./', document.currentScript.src);
  const local = path => new URL(path, root).href;
  const checks = new WeakMap();
  const pdfReports = new WeakMap();
  const history = [];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const api = async (path, options = {}) => {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch('/api/portable/' + path, {...options, signal: controller.signal});
      const body = await response.json();
      if (!response.ok) throw Error(body.error || '本机处理未完成，请重试');
      return body;
    } catch (error) {
      throw Error(error.name === 'AbortError' ? '本机文件检查超时，请重试或拆分较大的文件' : error.message);
    } finally { clearTimeout(timer); }
  };
  async function inspectFile(file, expectedFamily) {
    if (!file || !file.size) throw Error('文件为空，请重新选择');
    if (file.size > 64 * 1024 * 1024) throw Error('单个文件超过 64 MB，请拆分后导入');
    let pending = checks.get(file);
    if (!pending) {
      pending = api('formats', {method:'POST', headers:{'Content-Type':'application/octet-stream','X-Workbench-Request':'portable-formats','X-File-Name':encodeURIComponent(file.name)}, body:file}).then(result => {
        const detected = result.detected;
        if (!detected?.family || !detected.format) throw Error('未识别到有效的文件格式，未导入');
        if (detected.encrypted) throw Error('文件已加密，请在原软件中解除密码后另存副本');
        if (detected.extensionMatches === false) throw Error('文件后缀与实际格式不一致，请在原软件中另存后导入');
        history.unshift({name:file.name, ...detected}); history.splice(10);
        window.dispatchEvent(new CustomEvent('workbuddy:file-inspected', {detail:{name:file.name, detected}}));
        return detected;
      }).catch(error => { checks.delete(file); throw error; });
      checks.set(file, pending);
    }
    const detected = await pending;
    if (expectedFamily && detected.family !== expectedFamily) throw Error('所选文件实际为 ' + detected.format.toUpperCase() + '，与此导入口要求不符');
    return detected;
  }
  function regulationLink(record) {
    const checked = window.WorkbenchRegulationLinks?.records?.[record.source_id];
    // A passed HTTP check alone is insufficient: the document identity must match as well.
    if (!checked || checked.source_url !== record.source_url || !checked.checkedAt) return null;
    if (checked.localPath && /^vendor\/regulations\/[A-Za-z0-9_.\/-]+\.pdf$/i.test(checked.localPath) && !checked.localPath.split('/').includes('..')) return {url:local(checked.localPath), label:'查看本地资料', checkedAt:checked.checkedAt};
    if (navigator.onLine === false || checked.status !== 'verified' || checked.contentMatches !== true || !/^https:\/\//.test(checked.url || '')) return null;
    return {url:checked.url, label:'打开官网', checkedAt:checked.checkedAt};
  }
  let openSettings = () => {};
  window.WorkbenchPortable = {
    inspectFile, regulationLink, local,
    openSettings() { openSettings(); },
    pdfReadReport(file, report) { if (report) pdfReports.set(file, report); return pdfReports.get(file); },
    resources: {
      xlsx:local('vendor/xlsx-0.18.5/xlsx.full.min.js'),
      pdf:local('vendor/pdfjs-3.11.174/pdf.min.js'),
      pdfCmaps:local('vendor/pdfjs-3.11.174/cmaps/'),
      pdfFonts:local('vendor/pdfjs-3.11.174/standard_fonts/'),
      tesseract:local('vendor/tesseract-5.1.1/tesseract.min.js'),
      worker:local('vendor/tesseract-5.1.1/worker.min.js'),
      core:local('vendor/tesseract-core-5.1.1/'),
      languages:local('vendor/tessdata-4.0.0/')
    }
  };
  function formatRow(value) {
    const version = value.formatVersion ? ' · ' + value.formatVersion : '';
    const warnings = (value.warnings || []).join('；');
    return '<li><b>' + esc(value.name) + '</b><span>' + esc(String(value.format || '').toUpperCase() + version) + '</span>' + (warnings ? '<small>' + esc(warnings) + '</small>' : '') + '</li>';
  }
  function mount() {
    document.title = '结构工作台 · 本地版';
    const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = local('portable-mode.css'); document.head.append(style);
    document.querySelectorAll('[onclick="goStage(4)"],[onclick="goStage(10)"],[data-go="4"],[data-go="10"]').forEach(el => el.hidden = true);
    document.querySelectorAll('#stage1 summary .sub').forEach(el => { el.textContent = el.textContent.replace(/；后续「反校核」以本组为基准/, ''); });
    const dialog = document.createElement('dialog'); dialog.className = 'portable-status-dialog'; document.body.append(dialog);
    openSettings = async () => {
      dialog.innerHTML = '<div class="portable-dialog-heading"><h2>设置</h2><button type="button" data-close>关闭</button></div><p>项目保存在这台电脑；基础功能无需联网。</p><p id="portable-app-version"></p><button type="button" id="portable-open-data">打开项目文件夹</button><div id="portable-capabilities" role="status">正在检查可用功能…</div><p id="portable-settings-status" role="status"></p><div class="portable-file-check"><label class="portable-file-label">识别文件格式<input id="portable-check-file" type="file" accept=".doc,.docx,.docm,.dot,.dotx,.dotm,.xls,.xlsx,.xlsm,.xlsb,.xlt,.xltx,.xltm,.ppt,.pptx,.pptm,.pps,.ppsx,.ppsm,.pot,.potx,.potm,.pdf"></label><span>仅检查，不加入当前项目</span></div><p id="portable-file-message" role="status"></p><ul id="portable-file-results">' + history.map(formatRow).join('') + '</ul>';
      dialog.querySelector('[data-close]').onclick = () => dialog.close();
      dialog.querySelector('#portable-check-file').onchange = async event => {
        const file = event.target.files[0]; if (!file) return;
        const message = dialog.querySelector('#portable-file-message'); message.textContent = '正在检查 ' + file.name + '…';
        try { await inspectFile(file); message.textContent = '格式已识别。文件创建软件信息不能代表这台电脑安装的软件版本。'; dialog.querySelector('#portable-file-results').innerHTML = history.map(formatRow).join(''); }
        catch (error) { message.textContent = error.message; }
        event.target.value = '';
      };
      dialog.querySelector('#portable-app-version').textContent = '本地版 ' + (window.WORKBENCH_PORTABLE_VERSION || '版本信息未登记');
      const settingsHeaders = {'Content-Type':'application/json','X-Workbench-Request':'portable-settings'};
      dialog.querySelector('#portable-open-data').onclick = async () => {
        try { await api('open-data', {method:'POST', headers:settingsHeaders, body:'{}'}); }
        catch(error) { dialog.querySelector('#portable-settings-status').textContent = error.message; }
      };
      dialog.showModal();
      try {
        const result = await api('capabilities');
        const target = dialog.querySelector('#portable-capabilities'); if (target) renderCapabilities(target, result);
      } catch (error) { const target = dialog.querySelector('#portable-capabilities'); if (target) target.textContent = error.message; }
    };
  }
  function renderCapabilities(target, result) {
    const apps = (Array.isArray(result.installedApps) ? result.installedApps : Object.entries(result.installedApps || {}).map(([name,value]) => typeof value === 'object' ? {name,...value} : {name,version:value})).filter(app => app.detected !== false);
    target.innerHTML = '<p><b>检测到的软件</b></p>' + (apps.length ? '<ul>' + apps.map(app => '<li>' + esc(app.name || app.product || app.application || '本机组件') + (app.version ? ' · ' + esc(app.version) : '') + (app.available === false ? '（不可用）' : '') + '</li>').join('') + '</ul>' : '<p>未检测到已登记的 Office 软件。DOCX、XLSX 和 PPTX 等文件的识别不依赖安装 Office。</p>') + '<p>旧版 DOC 与精确 Word/PDF 转换取决于本机可用的转换软件；不支持时会在操作中提示，不会返回空白成果。</p>';
    const features = result.features || result.capabilities;
    if (Array.isArray(features)) target.innerHTML += '<ul>' + features.map(feature => '<li>' + esc(feature.label || feature.name || feature.id) + '：' + esc(feature.detail || feature.message || (feature.available ? '可用' : '需配置转换软件')) + '</li>').join('') + '</ul>';
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once:true}); else mount();
})();
