import {mkdir, writeFile, copyFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID, createHash} from 'node:crypto';
import {readPart, writePart, validProjectId} from './project-store.mjs';
import {portableProjectPaths} from './portable-projects.mjs';
import {calculationSourceForProject} from './portable-calculation-sources.mjs';
import {inspectDocument} from './document-format-api.mjs';

const slots = {'jump-column': {format: 'xlsx', name: '当前项目跃层柱.xlsx'}, stair: {format: 'xlsm', name: '当前项目楼梯构件库计算表.xlsm'}};

export function portableCalculationUploadApi(env, {validate, inspect = inspectDocument} = {}) {
  const pending = new Set(), paths = portableProjectPaths(env);
  function register(server) { server.middlewares.use('/api/calculation-book/import-source', async (req, res) => {
    const json = (status, data) => { res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}); res.end(JSON.stringify(data)); };
    let projectId = '', directory = '', ownsJob = false, saved = false;
    try {
      if (env.WORKBENCH_PORTABLE !== '1') return json(404, {error: '仅本地版提供母件导入'});
      if (req.method !== 'POST' || req.headers['x-workbench-request'] !== 'calculation-source' || req.headers.origin && new URL(req.headers.origin).host !== req.headers.host || req.headers['sec-fetch-site'] === 'cross-site') return json(403, {error: '请从本机工作台选择 Excel 母件'});
      const url = new URL(req.url, 'http://localhost'); projectId = url.searchParams.get('project');
      const key = url.searchParams.get('slot'), expected = Number(url.searchParams.get('revision'));
      if (!validProjectId(projectId) || !slots[key] || !url.searchParams.has('revision') || !Number.isSafeInteger(expected) || expected < 0) return json(400, {error: '项目、母件类型或保存版本无效'});
      if (pending.has(projectId)) return json(409, {error: '当前项目已有母件正在导入'});
      pending.add(projectId); ownsJob = true;
      const main = await readPart(paths.store, projectId, 'main'), previous = await readPart(paths.store, projectId, 'portable-assets');
      if (!main || (await readPart(paths.store, projectId, 'lifecycle'))?.data.deleted) throw Error('请先打开并保存当前项目');
      if ((previous?.revision || 0) !== expected) return json(409, {error: '母件已在其他窗口更新，请重新载入项目后导入'});
      const filename = decodeURIComponent(req.headers['x-file-name'] || '');
      let length = 0; const chunks = [];
      for await (const chunk of req) { length += chunk.length; if (length > 64 * 1024 * 1024) return json(413, {error: 'Excel 母件最大 64 MB'}); chunks.push(chunk); }
      const bytes = Buffer.concat(chunks), detected = await inspect(bytes, filename, env);
      if (detected.family !== 'excel' || detected.format !== slots[key].format) throw Error('所选类型需要 .' + slots[key].format + ' 母件；请在 Excel 中另存副本后选择，不能直接改后缀');
      const batch = randomUUID().replaceAll('-', '');
      directory = join(paths.assets, projectId, 'calculation-sources', batch); await mkdir(directory, {recursive: true});
      const files = [], missing = (previous?.data.calculationSources?.missing || []).filter(item => item.key !== key);
      if (previous) {
        const current = await calculationSourceForProject(env, env.CALCBOOK_SOURCE_DIR, projectId, {replacingKeys: [key]});
        for (const file of previous.data.calculationSources.files.filter(file => file.key !== key)) { await copyFile(join(current.directory, file.name), join(directory, file.name)); files.push(file); }
      }
      await writeFile(join(directory, slots[key].name), bytes, {flag: 'wx'});
      const validation = await validate(directory, key);
      files.push({key, name: slots[key].name, originalName: filename.slice(0, 200), sha256: createHash('sha256').update(bytes).digest('hex')});
      const linked = main.data.calculation?.linkedExcel?.workbook;
      if (linked && linked !== key && !files.some(file => file.key === linked) && !missing.some(item => item.key === linked)) missing.push({key: linked, reason: '此前联动的母件尚未导入当前项目'});
      const data = {...previous?.data, schema: 1, calculationSources: {batch, files, missing}, updatedAt: new Date().toISOString()};
      const record = await writePart(paths.store, projectId, 'portable-assets', data, expected); saved = true;
      return json(200, {workbook: key, revision: record.revision, filename, warnings: validation.warnings || []});
    } catch (error) { return json(error.status || 400, {error: error.message || '母件导入失败'}); }
    finally { if (ownsJob) pending.delete(projectId); if (!saved && directory) await rm(directory, {recursive: true, force: true}); }
  }); }
  return {name: 'portable-calculation-upload', configureServer: register, configurePreviewServer: register};
}
