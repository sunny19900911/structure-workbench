import {join, basename, resolve, relative, sep} from 'node:path';
import {lstat, realpath, readdir, readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readPart, validProjectId} from './project-store.mjs';

const patterns = {'jump-column': /跃层柱.*\.xlsx$/i, stair: /楼梯构件库计算表.*\.xlsm$/i};
const inside = (root, path) => { const rel = relative(root, path); return rel && rel !== '..' && !rel.startsWith('..' + sep) && !rel.includes(':'); };

// Only the server constructs paths. Imported projects never fall back to another
// project's or the installation's calculation sheets, even when an asset is missing.
export async function calculationSourceForProject(env, defaultDir, projectId, {requiredKeys = [], replacingKeys = []} = {}) {
  if (projectId && !validProjectId(projectId)) throw Error('计算书项目编号无效');
  if (env.WORKBENCH_PORTABLE !== '1') return {directory: defaultDir, warnings: [], imported: false, revision: 0};
  const data = resolve(env.WORKBENCH_DATABASE_ROOT), store = env.WORKBENCH_PROJECT_STORE || join(data, 'projects');
  if (!projectId) {
    if (requiredKeys.length) throw Error('请先打开一个项目再读取计算书');
    return {directory: join(data, 'empty-calculation-sources'), warnings: [], imported: false, revision: 0};
  }
  if ((await readPart(store, projectId, 'lifecycle'))?.data.deleted) throw Error('项目已删除，请恢复后再生成计算书');
  const record = await readPart(store, projectId, 'portable-assets');
  if (!record) return {directory: defaultDir, warnings: [], imported: false, revision: 0};
  const source = record.data.calculationSources;
  if (!source || !Array.isArray(source.files) || !Array.isArray(source.missing)) throw Error('项目母件登记损坏，请重新导入项目包');
  if (source.batch && !/^[a-f0-9]{32}$/.test(source.batch)) throw Error('项目母件版本目录无效');
  const directory = join(data, 'project-assets', projectId, 'calculation-sources', ...(source.batch ? [source.batch] : []));
  const allowed = new Set(), keys = new Set();
  for (const file of source.files) {
    if (!patterns[file.key] || keys.has(file.key) || typeof file.name !== 'string' || basename(file.name) !== file.name || /[\\/:\x00-\x1f]/.test(file.name) || !patterns[file.key].test(file.name) || !/^[a-f0-9]{64}$/.test(file.sha256 || '')) throw Error('项目母件登记无效');
    keys.add(file.key); allowed.add(file.name);
  }
  for (const key of requiredKeys) {
    const missing = source.missing.find(item => item?.key === key);
    if (missing || !keys.has(key)) throw Error('当前项目缺少 Excel 母件（' + key + '）' + (missing?.reason ? '：' + missing.reason : '') + '，不会套用其他项目母件');
  }
  if (source.files.some(file => !replacingKeys.includes(file.key))) {
    try {
      let parent = data;
      for (const segment of ['project-assets', projectId, 'calculation-sources', ...(source.batch ? [source.batch] : [])]) { parent = join(parent, segment); if ((await lstat(parent)).isSymbolicLink()) throw Error('项目母件目录不能使用链接'); }
      const root = await realpath(directory);
      for (const name of await readdir(directory)) if (Object.values(patterns).some(pattern => pattern.test(name)) && !allowed.has(name)) throw Error('项目母件目录出现未登记文件，请重新导入正确项目包');
      for (const file of source.files) {
        if (replacingKeys.includes(file.key)) continue;
        const path = join(directory, file.name), info = await lstat(path), actual = await realpath(path);
        if (!info.isFile() || info.isSymbolicLink() || !inside(root, actual) || info.size > 128 * 1024 * 1024) throw Error('项目母件文件无效');
        if (createHash('sha256').update(await readFile(actual)).digest('hex') !== file.sha256) throw Error('当前项目 Excel 母件已变化，请重新核对并导入项目包');
      }
    } catch (error) { if (error.code === 'ENOENT') throw Error('当前项目 Excel 母件缺失，请重新导入完整项目包'); throw error; }
  }
  return {directory, imported: true, revision: record.revision, warnings: source.missing.map(item => String(item?.key || '') + '：' + String(item?.reason || '母件缺失'))};
}
