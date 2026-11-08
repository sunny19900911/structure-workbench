import {createReadStream} from 'node:fs';
import {mkdir, readdir, readFile, writeFile, lstat, realpath, stat, copyFile, mkdtemp, rename, rm, open} from 'node:fs/promises';
import {join, resolve, relative, sep, isAbsolute, basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID, createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pipeline} from 'node:stream/promises';
import {readPart, writePart, validProjectId} from './project-store.mjs';
import {calculationSourceForProject} from './portable-calculation-sources.mjs';
import {createOfficeDocumentStore, OFFICE_DOCUMENT_DIRECTORY, OFFICE_DOCUMENT_MAX_BYTES} from './office-document-store.mjs';
import {inspectDocument} from './document-format-api.mjs';

const exec = promisify(execFile);
const helper = fileURLToPath(new URL('./portable-archive.py', import.meta.url));
const PART = /^[a-z][a-z0-9_-]{0,79}$/;
const REVISION = /^(\d{10})-[a-f0-9-]+\.json$/;
const GROUPS = ['荷载校核', '上部', '基础', '施工图'];
const MAX_ARCHIVE = 1024 * 1024 * 1024;
const MAX_JSON = 32 * 1024 * 1024;
const workbookPatterns = {'jump-column': /跃层柱.*\.xlsx$/i, stair: /楼梯构件库计算表.*\.xlsm$/i};
const hash = value => createHash('sha256').update(value).digest('hex');
const inside = (root, path) => { const rel = relative(root, path); return rel && !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep); };
const portableRoot = 'portable:calculation';
const clone = value => JSON.parse(JSON.stringify(value));
const OFFICE_ID = /^[a-f0-9]{32}$/;
const OFFICE_TYPES = new Set(['docx', 'pptx', 'xlsx']);
const OFFICE_METADATA_MAX = 64 * 1024;
const OFFICE_MAX_VERSIONS = 2500;

export function portableProjectPaths(env = {}) {
  const data = resolve(env.WORKBENCH_DATABASE_ROOT || join(process.env.LOCALAPPDATA || process.cwd(), 'StructureWorkbench', 'data'));
  return {data, store: resolve(env.WORKBENCH_PROJECT_STORE || join(data, 'projects')), uploads: resolve(env.CALCBOOK_UPLOAD_DIR || join(data, 'calculation-uploads')), assets: join(data, 'project-assets'), temp: join(data, '.portable-tmp')};
}

function safeRelative(value) {
  if (typeof value !== 'string' || value.length > 1500) throw Error('附件路径无效');
  const parts = value.split('/');
  if (parts.length > 16 || parts.some(p => !p || p === '.' || p === '..' || /[\\:\x00-\x1f<>"|?*]/.test(p) || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw Error('附件路径无效');
  return parts;
}

async function regularFile(root, relativePath) {
  const parts = safeRelative(relativePath), base = await realpath(root);
  if ((await lstat(root)).isSymbolicLink()) throw Error('附件目录不能是链接');
  let path = base;
  for (const part of parts) { path = join(path, part); if ((await lstat(path)).isSymbolicLink()) throw Error('附件不能经过链接目录'); }
  const actual = await realpath(path), info = await stat(actual);
  if (!inside(base, actual) || !info.isFile()) throw Error('附件不在选定目录内');
  return {path: actual, info};
}

async function python(mode, source, target, env) {
  try {
    await exec(env.WORKBENCH_PYTHON || env.CALCBOOK_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), [helper, mode, source, target], {windowsHide: true, timeout: 240000, maxBuffer: 1024 * 1024, env: {...process.env, PYTHONUTF8: '1'}});
  } catch (error) {
    let message;
    try { message = JSON.parse(String(error.stderr).trim().split('\n').at(-1)).error; } catch {}
    throw Error(message || (error.code === 'ENOENT' ? '本机项目打包工具不可用，请重新解压完整工作台' : error.killed ? '项目包处理超时，请减少附件后重试' : '项目包损坏或格式不支持'));
  }
}

async function tempFolder(paths) {
  await mkdir(paths.temp, {recursive: true});
  return mkdtemp(join(paths.temp, 'transfer-'));
}

async function cleanTemp(paths, temp) {
  if (!inside(resolve(paths.temp), resolve(temp)) || !basename(temp).startsWith('transfer-')) throw Error('临时目录无效');
  await rm(temp, {recursive: true, force: true});
}

function validateRecord(record, projectId, part, revision) {
  if (!record || record.schema !== 1 || record.projectId !== projectId || record.part !== part || record.revision !== revision || !Number.isSafeInteger(revision) || revision < 1 || !record.data || typeof record.data !== 'object' || Array.isArray(record.data)) throw Error('项目分区内容或版本不一致');
}

async function projectSnapshot(store, projectId) {
  if (!validProjectId(projectId)) throw Error('项目编号无效');
  const folder = join(store, projectId), records = [], latest = {};
  if ((await lstat(folder)).isSymbolicLink()) throw Error('项目目录不能是链接');
  for (const part of (await readdir(folder, {withFileTypes: true})).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!PART.test(part.name)) continue;
    if (!part.isDirectory() || part.isSymbolicLink()) throw Error('项目分区不是普通目录');
    const seen = new Set();
    for (const filename of (await readdir(join(folder, part.name))).filter(name => REVISION.test(name)).sort()) {
      const revision = Number(REVISION.exec(filename)[1]);
      if (seen.has(revision)) throw Error('项目存在重复版本，请先核查保存状态');
      seen.add(revision);
      const {path, info} = await regularFile(folder, part.name + '/' + filename);
      if (info.size > MAX_JSON) throw Error('项目分区超过 32 MB');
      const record = JSON.parse(await readFile(path, 'utf8'));
      validateRecord(record, projectId, part.name, revision);
      records.push({part: part.name, revision, record});
      latest[part.name] = record;
      if (records.length > 5000) throw Error('项目历史版本过多，超过本次打包上限');
    }
  }
  if (!latest.main || latest.lifecycle?.data.deleted) throw Error('项目不存在或已删除，请先恢复项目');
  return {records, latest};
}

async function copyStable(path, destination, expected = {}) {
  const before = await stat(path);
  if (before.size > 128 * 1024 * 1024 || (expected.size != null && expected.size !== before.size) || (expected.mtimeMs != null && Math.abs(expected.mtimeMs - before.mtimeMs) > 1)) throw Error('附件已变化或过大，请重新读取文件后导出');
  await mkdir(join(destination, '..'), {recursive: true});
  await copyFile(path, destination);
  const after = await stat(path);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw Error('打包期间附件发生变化，请重试');
}

async function collectPdfs(main, content) {
  const sources = main.data.calculation?.pdfSources, files = sources?.files || [];
  if (!Array.isArray(files) || files.length > 200) throw Error('计算书 PDF 清单无效或超过 200 份');
  if (files.length && (typeof sources.path !== 'string' || !isAbsolute(sources.path))) throw Error('计算书附件目录缺失，请重新读取 PDF 后导出');
  const result = [], used = new Set(); let size = 0;
  for (const file of files) {
    if (!GROUPS.includes(file.group) || !/\.pdf$/i.test(file.relativePath || '')) throw Error('计算书 PDF 分组或路径无效');
    const {path, info} = await regularFile(sources.path, file.relativePath);
    const header = Buffer.alloc(Math.min(1024, info.size)), handle = await open(path, 'r');
    try { await handle.read(header, 0, header.length, 0); } finally { await handle.close(); }
    if (!header.includes(Buffer.from('%PDF-'))) throw Error(file.name + ' 不是有效的 PDF 文件');
    size += info.size; if (size > 512 * 1024 * 1024) throw Error('计算书 PDF 总大小超过 512 MB');
    const relativePath = file.group + '/' + safeRelative(file.relativePath).join('/');
    if (used.has(relativePath.toLocaleLowerCase('en-US'))) throw Error('计算书 PDF 名称重复');
    used.add(relativePath.toLocaleLowerCase('en-US'));
    const member = 'files/calculation/' + relativePath, destination = join(content, ...member.split('/'));
    await copyStable(path, destination, file);
    result.push({path: member, relativePath, name: basename(path), group: file.group, pages: Number.isInteger(file.pages) ? file.pages : 0, size: info.size});
  }
  return result;
}

async function collectWorkbooks(snapshot, paths, projectId, content, env) {
  const main = snapshot.latest.main.data, linked = main.calculation?.linkedExcel;
  const previous = snapshot.latest['portable-assets']?.data.calculationSources;
  const keys = [...new Set([...(Array.isArray(linked) ? linked : linked ? [linked] : [])].map(item => item.workbook).concat((previous?.files || []).map(item => item.key), (previous?.missing || []).map(item => item.key)))];
  let directory = env.CALCBOOK_SOURCE_DIR;
  if (previous) {
    try { directory = (await calculationSourceForProject({...env, WORKBENCH_PORTABLE: '1', WORKBENCH_DATABASE_ROOT: paths.data}, env.CALCBOOK_SOURCE_DIR, projectId)).directory; }
    catch (error) { return {files: [], missing: keys.map(key => ({key, reason: error.message}))}; }
  }
  const files = [], missing = [];
  for (const key of keys) {
    if (!workbookPatterns[key]) { missing.push({key: String(key || ''), reason: '当前版本不支持此 Excel 母件类型'}); continue; }
    if (!directory || previous?.missing?.some(item => item.key === key)) { missing.push({key, reason: '缺少当前项目引用的 Excel 母件'}); continue; }
    try {
      const matches = (await readdir(directory)).filter(name => workbookPatterns[key].test(name));
      if (matches.length !== 1) { missing.push({key, reason: matches.length ? '存在多个同类 Excel 母件，未自动选择' : '未找到当前项目引用的 Excel 母件'}); continue; }
      const name = matches[0], {path} = await regularFile(directory, name);
      const member = 'files/calculation-sources/' + safeRelative(name)[0], destination = join(content, ...member.split('/'));
      await copyStable(path, destination);
      files.push({key, name, path: member, sha256: hash(await readFile(destination))});
    } catch (error) { missing.push({key, reason: error.code === 'ENOENT' ? 'Excel 母件目录不存在' : error.message}); }
  }
  return {files, missing};
}

function validateOfficeMetadata(document, expected) {
  const validText = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\x00-\x1f]/.test(value);
  if (!document || document.schema !== 1 || document.projectId !== expected.projectId || document.documentId !== expected.documentId || document.fileRevision !== expected.revision || document.type !== expected.type || document.unit !== expected.unit || !validText(document.title, 200) || !validText(document.unit, 200) || !validText(document.filename, 220) || /[\\/:*?"<>|]/.test(document.filename) || !document.filename.endsWith('.' + document.type) || !/^[a-f0-9]{64}$/.test(document.sha256 || '') || !Number.isSafeInteger(document.size) || document.size < 1 || document.size > OFFICE_DOCUMENT_MAX_BYTES || typeof document.hasManualChanges !== 'boolean' || !['generated', 'imported', 'manual', 'mcp'].includes(document.origin) || !Number.isFinite(Date.parse(document.createdAt)) || !Number.isFinite(Date.parse(document.savedAt))) throw Error('Office 文档版本登记无效或所属项目不一致');
  const version = document.sourceParameterVersion;
  if (version != null && !(Number.isSafeInteger(version) && version >= 0) && !(validText(version, 120))) throw Error('Office 来源参数版本无效');
  if (document.batchId != null && (typeof document.batchId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(document.batchId))) throw Error('Office 成果集标识无效');
  if (!Array.isArray(document.warnings) || document.warnings.length > 100 || document.warnings.some(w => typeof w !== 'string' || w.length > 2000)) throw Error('Office 文档提示登记无效');
}

function officeSignature(documents) {
  return JSON.stringify(documents.map(d => [d.documentId, d.fileRevision, d.sha256]).sort((a, b) => a[0].localeCompare(b[0])));
}

async function collectOfficeDocuments(projectId, paths, content, env) {
  const store = createOfficeDocumentStore({...env, WORKBENCH_PROJECT_STORE: paths.store});
  const current = await store.list(projectId), documents = []; let versionCount = 0, total = 0;
  for (const latest of current) {
    const history = (await store.history(projectId, latest.documentId)).reverse(), versions = [];
    if (history.length !== latest.fileRevision || history.at(-1)?.fileRevision !== latest.fileRevision) throw Error('Office 文档历史版本缺失或打包期间又有保存，请重新导出');
    for (let i = 0; i < history.length; i++) {
      const metadata = history[i], revision = i + 1;
      if (++versionCount > OFFICE_MAX_VERSIONS) throw Error('Office 文档历史超过 2500 版，请整理项目后导出');
      validateOfficeMetadata(metadata, {projectId, documentId: latest.documentId, unit: latest.unit, type: latest.type, revision});
      const {bytes, document} = await store.read(projectId, latest.documentId, {revision});
      if (JSON.stringify(document) !== JSON.stringify(metadata)) throw Error('Office 文档登记在打包期间发生变化');
      total += bytes.length; if (total > MAX_ARCHIVE) throw Error('Office 文档历史超过 1 GB，请整理项目后导出');
      const base = 'files/office-documents/' + latest.documentId + '/' + String(revision).padStart(10, '0');
      const metadataPath = base + '/metadata.json', filePath = base + '/document.' + latest.type;
      const destination = join(content, ...base.split('/'));
      await mkdir(destination, {recursive: true});
      const raw = JSON.stringify(metadata);
      if (Buffer.byteLength(raw) > OFFICE_METADATA_MAX) throw Error('Office 文档版本登记过大');
      await writeFile(join(destination, 'metadata.json'), raw, {flag: 'wx'});
      await writeFile(join(destination, 'document.' + latest.type), bytes, {flag: 'wx'});
      versions.push({revision, metadataPath, filePath, sha256: metadata.sha256, size: metadata.size});
    }
    documents.push({documentId: latest.documentId, unit: latest.unit, type: latest.type, latestRevision: latest.fileRevision, versions});
  }
  return {documents, signature: officeSignature(current), store};
}

async function restoreOfficeDocuments(manifest, extracted, stagingProject, projectId, members, usedFiles, env) {
  const documents = manifest.officeDocuments === undefined ? [] : manifest.officeDocuments;
  if (!Array.isArray(documents) || documents.length > OFFICE_MAX_VERSIONS) throw Error('Office 文档清单无效');
  const ids = new Set(), entries = new Map(manifest.entries.map(entry => [entry.path, entry]));
  let versionCount = 0, total = 0;
  for (const item of documents) {
    if (!item || !OFFICE_ID.test(item.documentId || '') || ids.has(item.documentId) || !OFFICE_TYPES.has(item.type) || typeof item.unit !== 'string' || !item.unit.trim() || item.unit.length > 200 || !Number.isInteger(item.latestRevision) || item.latestRevision < 1 || !Array.isArray(item.versions) || item.versions.length !== item.latestRevision) throw Error('Office 文档清单或历史版本无效');
    ids.add(item.documentId); let previous;
    for (let i = 0; i < item.versions.length; i++) {
      const entry = item.versions[i], revision = i + 1;
      if (++versionCount > OFFICE_MAX_VERSIONS) throw Error('Office 文档历史超过 2500 版');
      const base = 'files/office-documents/' + item.documentId + '/' + String(revision).padStart(10, '0');
      if (!entry || entry.revision !== revision || entry.metadataPath !== base + '/metadata.json' || entry.filePath !== base + '/document.' + item.type || !members.has(entry.metadataPath) || !members.has(entry.filePath) || usedFiles.has(entry.metadataPath) || usedFiles.has(entry.filePath) || entries.get(entry.metadataPath).bytes > OFFICE_METADATA_MAX || !Number.isSafeInteger(entry.size) || entry.size < 1 || entry.size > OFFICE_DOCUMENT_MAX_BYTES || entries.get(entry.filePath).bytes !== entry.size) throw Error('Office 文档附件缺失、路径无效或版本不连续');
      usedFiles.add(entry.metadataPath); usedFiles.add(entry.filePath);
      const metadata = JSON.parse(await readFile(join(extracted, ...entry.metadataPath.split('/')), 'utf8'));
      validateOfficeMetadata(metadata, {projectId: manifest.projectId, documentId: item.documentId, revision, type: item.type, unit: item.unit});
      if (metadata.sha256 !== entry.sha256 || metadata.size !== entry.size || (previous && (metadata.createdAt !== previous.createdAt || (metadata.batchId ?? null) !== (previous.batchId ?? null) || previous.hasManualChanges && !metadata.hasManualChanges))) throw Error('Office 文档历史登记不一致');
      const bytes = await readFile(join(extracted, ...entry.filePath.split('/')));
      if (bytes.length !== metadata.size || hash(bytes) !== metadata.sha256) throw Error('Office 文档哈希校验失败');
      total += bytes.length; if (total > MAX_ARCHIVE) throw Error('Office 文档历史超过 1 GB');
      const detected = await inspectDocument(bytes, metadata.filename, env);
      if (detected.format !== item.type || detected.encrypted || detected.macros) throw Error('Office 文档真实格式与清单不一致');
      const destination = join(stagingProject, OFFICE_DOCUMENT_DIRECTORY, item.documentId, 'versions', String(revision).padStart(10, '0'));
      await mkdir(destination, {recursive: true});
      await writeFile(join(destination, 'metadata.json'), JSON.stringify({...metadata, projectId}), {flag: 'wx'});
      await writeFile(join(destination, 'document.' + item.type), bytes, {flag: 'wx'});
      previous = metadata;
    }
  }
  return documents.length;
}

export async function createProjectArchive(projectId, env = {}) {
  const paths = portableProjectPaths(env), temp = await tempFolder(paths);
  try {
    const snapshot = await projectSnapshot(paths.store, projectId), content = join(temp, 'content');
    await mkdir(content);
    const pdfs = await collectPdfs(snapshot.latest.main, content);
    const calculationSources = await collectWorkbooks(snapshot, paths, projectId, content, env);
    const office = await collectOfficeDocuments(projectId, paths, content, env);
    const currentMain = snapshot.latest.main.revision;
    for (const item of snapshot.records) {
      const record = clone(item.record);
      if (item.part === 'main' && item.revision === currentMain && record.data.calculation?.pdfSources) record.data.calculation.pdfSources = {path: pdfs.length ? portableRoot : '', files: pdfs.map(({path, ...file}) => file)};
      const path = join(content, 'project', item.part, String(item.revision).padStart(10, '0') + '.json');
      await mkdir(join(path, '..'), {recursive: true}); await writeFile(path, JSON.stringify(record), {flag: 'wx'});
    }
    const name = snapshot.latest.main.data.parameters?.project_name || '未命名项目';
    const manifest = {format: 'structure-workbench-project', schema: 1, createdAt: new Date().toISOString(), projectId, name, latest: Object.fromEntries(Object.entries(snapshot.latest).map(([part, record]) => [part, record.revision])), historyScope: '全部已保存分区历史、Office 文档全部版本及当前引用的计算书附件', pdfs, calculationSources, officeDocuments: office.documents, warnings: calculationSources.missing.map(item => item.key + '：' + item.reason)};
    await writeFile(join(content, 'manifest.json'), JSON.stringify(manifest));
    const file = join(temp, 'project.workbench.zip'); await python('pack', content, file, env);
    const after = await projectSnapshot(paths.store, projectId);
    if (JSON.stringify(manifest.latest) !== JSON.stringify(Object.fromEntries(Object.entries(after.latest).map(([part, record]) => [part, record.revision])))) throw Error('打包期间项目又有保存，请重新导出最新项目');
    if (office.signature !== officeSignature(await office.store.list(projectId))) throw Error('打包期间 Office 文档又有保存，请重新导出最新项目');
    return {file, name, warnings: manifest.warnings, cleanup: () => cleanTemp(paths, temp)};
  } catch (error) { await cleanTemp(paths, temp); throw error; }
}

function remapIds(value, oldId, newId, depth = 0) {
  if (depth > 80) throw Error('项目数据嵌套过深');
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => remapIds(item, oldId, newId, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, ['projectId', 'project_id'].includes(key) && item === oldId ? newId : remapIds(item, oldId, newId, depth + 1)]));
}

export async function importProjectArchive(archive, env = {}, {newId = () => randomUUID().replaceAll('-', '')} = {}) {
  const paths = portableProjectPaths(env), temp = await tempFolder(paths), projectId = newId();
  let publishedAssets = false, publishedPdfs = false;
  if (!validProjectId(projectId)) { await cleanTemp(paths, temp); throw Error('新项目编号无效'); }
  const finalProject = join(paths.store, projectId), finalAssets = join(paths.assets, projectId), finalPdfs = join(paths.uploads, projectId);
  try {
    if ((await stat(archive)).size > MAX_ARCHIVE) throw Error('项目包超过 1 GB');
    for (const path of [finalProject, finalAssets, finalPdfs]) {
      try { await lstat(path); throw Error('新项目编号已存在，未覆盖已有项目'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const extracted = join(temp, 'extracted'); await python('unpack', archive, extracted, env);
    const manifest = JSON.parse(await readFile(join(extracted, 'manifest.json'), 'utf8'));
    if (!validProjectId(manifest.projectId) || !manifest.latest || typeof manifest.latest !== 'object' || Array.isArray(manifest.latest) || !Array.isArray(manifest.pdfs) || manifest.pdfs.length > 200) throw Error('项目包项目清单无效');
    const records = [], foundLatest = {}, revisions = new Set();
    const sourceFiles = manifest.calculationSources?.files || [], missing = manifest.calculationSources?.missing || [];
    if (!Array.isArray(sourceFiles) || sourceFiles.length > 10 || !Array.isArray(missing) || missing.length > 10) throw Error('Excel 母件清单无效');
    const members = new Set(manifest.entries.map(entry => entry.path));
    const usedFiles = new Set();
    for (const entry of manifest.entries) {
      if (!entry.path.startsWith('project/')) continue;
      const parts = entry.path.split('/'), match = /^(\d{10})\.json$/.exec(parts[2]);
      if (parts.length !== 3 || !PART.test(parts[1]) || !match || entry.bytes > MAX_JSON) throw Error('项目分区路径无效');
      const part = parts[1], revision = Number(match[1]);
      if (revisions.has(part + ':' + revision)) throw Error('项目包版本重复');
      revisions.add(part + ':' + revision);
      const record = JSON.parse(await readFile(join(extracted, ...parts), 'utf8'));
      validateRecord(record, manifest.projectId, part, revision);
      records.push({part, revision, record}); foundLatest[part] = Math.max(foundLatest[part] || 0, revision); usedFiles.add(entry.path);
    }
    if (!foundLatest.main || Object.keys(foundLatest).length !== Object.keys(manifest.latest).length || Object.entries(foundLatest).some(([part, rev]) => manifest.latest[part] !== rev)) throw Error('项目包最新版本清单不一致');
    const latestMain = records.find(item => item.part === 'main' && item.revision === foundLatest.main).record;
    if (records.some(item => item.part === 'lifecycle' && item.revision === foundLatest.lifecycle && item.record.data.deleted)) throw Error('项目包已删除，请恢复原项目后重新导出');
    const currentPdf = latestMain.data.calculation?.pdfSources;
    if (manifest.pdfs.length && currentPdf?.path !== portableRoot || (currentPdf?.files?.length || 0) !== manifest.pdfs.length) throw Error('PDF 清单与项目正文不一致');
    const pdfRoot = join(finalPdfs, 'imported'), stagedPdfs = join(temp, 'pdfs', 'imported'), importedFiles = [];
    let totalPdf = 0;
    for (const file of manifest.pdfs) {
      safeRelative(file.relativePath);
      if (!GROUPS.includes(file.group) || file.path !== 'files/calculation/' + file.relativePath || !/\.pdf$/i.test(file.relativePath) || !members.has(file.path) || usedFiles.has(file.path)) throw Error('PDF 附件清单无效');
      usedFiles.add(file.path);
      const source = join(extracted, ...file.path.split('/')), bytes = await readFile(source);
      if (!bytes.subarray(0, 1024).includes(Buffer.from('%PDF-')) || bytes.length !== file.size) throw Error('PDF 附件内容无效');
      totalPdf += bytes.length; if (totalPdf > 512 * 1024 * 1024) throw Error('PDF 附件超过 512 MB');
      const destination = join(stagedPdfs, ...file.relativePath.split('/'));
      await mkdir(join(destination, '..'), {recursive: true}); await writeFile(destination, bytes, {flag: 'wx'});
      const info = await stat(destination);
      importedFiles.push({relativePath: file.relativePath, name: basename(file.relativePath), group: file.group, pages: Number.isInteger(file.pages) ? file.pages : 0, size: info.size, mtimeMs: info.mtimeMs});
    }
    const stagedAssets = join(temp, 'assets'), workbookKeys = new Set();
    for (const file of sourceFiles) {
      if (!workbookPatterns[file.key] || !workbookPatterns[file.key].test(file.name) || safeRelative(file.name).length !== 1 || file.path !== 'files/calculation-sources/' + file.name || !members.has(file.path) || usedFiles.has(file.path) || workbookKeys.has(file.key)) throw Error('Excel 母件清单无效');
      usedFiles.add(file.path); workbookKeys.add(file.key);
      const source = join(extracted, ...file.path.split('/'));
      if (hash(await readFile(source)) !== file.sha256) throw Error('Excel 母件校验失败');
      const destination = join(stagedAssets, 'calculation-sources', file.name);
      await mkdir(join(destination, '..'), {recursive: true}); await copyFile(source, destination);
    }
    const stagingStore = join(temp, 'store'), stagingProject = join(stagingStore, projectId);
    const officeCount = await restoreOfficeDocuments(manifest, extracted, stagingProject, projectId, members, usedFiles, env);
    if (usedFiles.size !== members.size) throw Error('项目包含未声明的附件');
    for (const {part, revision, record: original} of records) {
      const record = remapIds(original, manifest.projectId, projectId);
      record.projectId = projectId;
      if (part === 'main' && revision === foundLatest.main && record.data.calculation?.pdfSources) record.data.calculation.pdfSources = {path: importedFiles.length ? pdfRoot : '', files: importedFiles};
      const path = join(stagingProject, part, String(revision).padStart(10, '0') + '-' + randomUUID() + '.json');
      await mkdir(join(path, '..'), {recursive: true}); await writeFile(path, JSON.stringify(record), {flag: 'wx'});
    }
    const provenance = {schema: 1, calculationSources: {files: sourceFiles.map(({path, ...file}) => file), missing}, importedFrom: {projectId: manifest.projectId, exportedAt: manifest.createdAt, importedAt: new Date().toISOString()}, archiveWarnings: missing.map(item => item.key + '：' + item.reason)};
    await writePart(stagingStore, projectId, 'portable-assets', provenance, foundLatest['portable-assets'] || 0);
    await mkdir(paths.store, {recursive: true}); await mkdir(paths.assets, {recursive: true}); await mkdir(paths.uploads, {recursive: true});
    if (sourceFiles.length) { await rename(stagedAssets, finalAssets); publishedAssets = true; }
    if (importedFiles.length) { await rename(join(temp, 'pdfs'), finalPdfs); publishedPdfs = true; }
    // Publishing the project directory is last; the project list never sees partial records.
    await rename(stagingProject, finalProject);
    return {projectId, name: latestMain.data.parameters?.project_name || '未命名项目', parts: Object.keys(foundLatest).length, pdfCount: importedFiles.length, officeCount, warnings: provenance.archiveWarnings};
  } catch (error) {
    if (publishedAssets && inside(paths.assets, finalAssets)) await rm(finalAssets, {recursive: true, force: true});
    if (publishedPdfs && inside(paths.uploads, finalPdfs)) await rm(finalPdfs, {recursive: true, force: true});
    throw error;
  } finally { await cleanTemp(paths, temp); }
}

export function portableProjectApi(env = {}) {
  const paths = portableProjectPaths(env); let transferring = false;
  function register(server) { server.middlewares.use('/api/portable-projects', async (req, res) => {
    const json = (status, data) => { res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}); res.end(JSON.stringify(data)); };
    let uploaded, uploadTemp, exported, acquired = false;
    try {
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host || req.headers['sec-fetch-site'] === 'cross-site' || req.headers['x-workbench-request'] !== 'portable-projects') return json(403, {error: '仅允许工作台主动操作项目包'});
      if (req.method !== 'POST') return json(405, {error: '请选择导出或导入项目包'});
      const url = new URL(req.url, 'http://localhost');
      if (!['/export', '/import'].includes(url.pathname)) return json(404, {error: '项目包接口不存在'});
      if (transferring) return json(409, {error: '已有项目包正在处理，请稍候'});
      transferring = true; acquired = true;
      if (url.pathname === '/export') {
        exported = await createProjectArchive(url.searchParams.get('project'), env);
        const filename = String(exported.name).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 100) + '.workbench.zip';
        transferring = false; acquired = false;
        res.writeHead(200, {'Content-Type': 'application/zip', 'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(filename), 'Cache-Control': 'no-store', 'X-Workbench-Warnings': encodeURIComponent(JSON.stringify(exported.warnings))});
        await pipeline(createReadStream(exported.file), res); return;
      }
      uploadTemp = await tempFolder(paths); uploaded = join(uploadTemp, 'upload.zip');
      const handle = await open(uploaded, 'wx'); let size = 0;
      try { for await (const chunk of req) { size += chunk.length; if (size > MAX_ARCHIVE) throw Error('项目包超过 1 GB'); await handle.write(chunk); } } finally { await handle.close(); }
      const result = await importProjectArchive(uploaded, env);
      transferring = false; acquired = false;
      return json(200, result);
    } catch (error) { if (!res.headersSent) json(400, {error: error.code === 'ENOENT' ? '项目或附件不存在，请重新读取附件后再导出' : error.message || '项目包处理失败'}); else res.destroy(error); }
    finally { if (exported) await exported.cleanup(); if (uploadTemp) await cleanTemp(paths, uploadTemp); if (acquired) transferring = false; }
  }); }
  return {name: 'portable-project-transfer', configureServer: register, configurePreviewServer: register};
}
