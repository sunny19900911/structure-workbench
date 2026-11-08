import './project-workspace.js';

if (window.WORKBENCH_PORTABLE) {
  const container = document.querySelector('.wp-management > div');
  const projects = window.WorkbenchProjects;
  if (container && projects) {
    const legacyBackup = document.getElementById('wp-backup');
    if (legacyBackup) legacyBackup.hidden = true;
    const exportButton = document.createElement('button'), importButton = document.createElement('button'), input = document.createElement('input');
    exportButton.id = 'portable-project-export'; exportButton.type = 'button'; exportButton.textContent = '导出项目包';
    importButton.id = 'portable-project-import'; importButton.type = 'button'; importButton.textContent = '导入项目包';
    input.type = 'file'; input.accept = '.zip'; input.hidden = true;
    container.append(exportButton, importButton, input);
    const status = text => { const node = document.getElementById('wp-status'); if (node) node.textContent = text; };
    const headers = {'X-Workbench-Request': 'portable-projects'};
    const request = async (url, options) => {
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 360000);
      try {
        const response = await fetch(url, {...options, signal: controller.signal});
        if (!response.ok) throw Error((await response.json().catch(() => ({}))).error || '项目包操作失败');
        return response;
      } catch (error) { throw Error(error.name === 'AbortError' ? '项目包处理超时，请稍后重试；原项目仍保留' : error.message); }
      finally { clearTimeout(timer); }
    };
    exportButton.addEventListener('click', () => projects.runOperation(async () => {
      await projects.flush();
      const response = await request('/api/portable-projects/export?' + new URLSearchParams({project: projects.id}), {method: 'POST', headers});
      const blob = await response.blob(), url = URL.createObjectURL(blob), link = document.createElement('a');
      const name = /filename\*=UTF-8''([^;]+)/i.exec(response.headers.get('Content-Disposition') || '')?.[1];
      link.href = url; link.download = name ? decodeURIComponent(name) : '项目.workbench.zip';
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      let warnings = [];
      try { warnings = JSON.parse(decodeURIComponent(response.headers.get('X-Workbench-Warnings') || '%5B%5D')); } catch {}
      status('项目包已下载，包含已保存正文、图片和当前 PDF 附件。' + (warnings.length ? ' 注意：' + warnings.join('；') : ''));
    }, exportButton));
    importButton.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      const file = input.files?.[0]; input.value = ''; if (!file) return;
      projects.runOperation(async () => {
        if (file.size > 1024 * 1024 * 1024) throw Error('项目包最大 1 GB');
        await projects.flush();
        const response = await request('/api/portable-projects/import', {method: 'POST', headers: {...headers, 'Content-Type': 'application/zip'}, body: file});
        const result = await response.json();
        await projects.openImported(result.projectId);
        status('项目已导入为独立副本，原项目保留。' + (result.warnings?.length ? ' Excel 仍需处理：' + result.warnings.join('；') : ''));
      }, importButton);
    });
  }
}
