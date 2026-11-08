import {mkdir, readdir, readFile, writeFile, rename, rm, lstat, realpath} from 'node:fs/promises';
import {join, resolve, relative, isAbsolute, sep} from 'node:path';
import {randomUUID, createHash} from 'node:crypto';
import {readPart, validProjectId} from './project-store.mjs';
import {inspectDocument} from './document-format-api.mjs';

export const OFFICE_DOCUMENT_MAX_BYTES = 64 * 1024 * 1024;
export const OFFICE_DOCUMENT_DIRECTORY = '.office-documents';
const TYPES = Object.freeze({
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
});
const ORIGINS = new Set(['generated', 'imported', 'manual', 'mcp']);
const ID = /^[a-f0-9]{32}$/;
const REVISION = /^\d{10}$/;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = (message, status = 400, code = 'INVALID_DOCUMENT') => Object.assign(Error(message), {status, code});
const within = (base, file) => {const rel = relative(base, file); return !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep);};
const revisionName = value => String(value).padStart(10, '0');

function checkedText(value, label, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f]/.test(value)) throw fail(label + '无效');
  return value.trim();
}
function checkedVersion(value) {
  if (value == null) return null;
  if (Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && value.length > 0 && value.length <= 120 && !/[\x00-\x1f]/.test(value)) return value;
  throw fail('来源参数版本无效');
}
function checkedBatch(value) {
  if (value == null) return null;
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value)) throw fail('成果集标识无效');
  return value;
}
function checkedRevision(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 9999999999) throw fail('文件版本无效');
  return value;
}
function filename(title, type) {
  const clean = title.replace(/[\\/:*?"<>|]/g, '_').replace(/[. ]+$/, '').replace(new RegExp('\\.' + type + '$', 'i'), '');
  return (clean || '文档') + '.' + type;
}

/** Actual OOXML files stay with the existing project, separate from generated downloads.
 * Each revision is an immutable directory. Renaming a completed staging directory to
 * a numbered revision commits bytes and metadata together and arbitrates writers.
 * A failed save never modifies the latest revision or the original source file.
 */
export function createOfficeDocumentStore(env = {}, dependencies = {}) {
  const root = resolve(env.WORKBENCH_PROJECT_STORE || join(env.WORKBENCH_DATABASE_ROOT || 'E:/600-工作台数据库', '603-进行项目', 'workbench-projects'));
  const inspect = dependencies.inspect || inspectDocument;

  async function checkedPath(path, {missing = false} = {}) {
    const absolute = resolve(path);
    if (!within(root, absolute)) throw fail('文档路径越出项目库', 400, 'INVALID_PATH');
    const parts = relative(root, absolute).split(sep).filter(Boolean);
    let current = root;
    // Reject junctions/symlinks in project and document paths before reading/writing.
    for (const part of ['', ...parts]) {
      if (part) current = join(current, part);
      try {if ((await lstat(current)).isSymbolicLink()) throw fail('文档路径不能经过链接目录', 400, 'INVALID_PATH');}
      catch (error) {if (missing && error.code === 'ENOENT') return absolute; throw error;}
    }
    if (!within(await realpath(root), await realpath(absolute))) throw fail('文档路径越出项目库', 400, 'INVALID_PATH');
    return absolute;
  }

  async function project(projectId) {
    if (!validProjectId(projectId)) throw fail('项目标识无效', 400, 'INVALID_PROJECT');
    try {await checkedPath(join(root, projectId));}
    catch (error) {if (error.code === 'ENOENT') throw fail('项目不存在，请先保存项目', 404, 'PROJECT_NOT_FOUND'); throw error;}
    if (!(await readPart(root, projectId, 'main'))) throw fail('项目不存在，请先保存项目', 404, 'PROJECT_NOT_FOUND');
    if ((await readPart(root, projectId, 'lifecycle'))?.data.deleted) throw fail('项目已删除，请先恢复项目', 410, 'PROJECT_DELETED');
    return join(root, projectId, OFFICE_DOCUMENT_DIRECTORY);
  }

  async function documentFolder(projectId, documentId) {
    if (!ID.test(documentId || '')) throw fail('文档标识无效', 400, 'INVALID_DOCUMENT_ID');
    const path = join(await project(projectId), documentId);
    try {await checkedPath(path);}
    catch (error) {if (error.code === 'ENOENT') throw fail('当前项目中没有这份文档', 404, 'DOCUMENT_NOT_FOUND'); throw error;}
    return path;
  }

  async function revisions(folder) {
    const versions = join(folder, 'versions');
    try {await checkedPath(versions); return (await readdir(versions)).filter(name => REVISION.test(name) && Number(name) > 0).sort();}
    catch (error) {if (error.code === 'ENOENT') return []; throw error;}
  }

  async function metadata(folder, projectId, documentId, version) {
    const revision = checkedRevision(version), path = join(folder, 'versions', revisionName(revision), 'metadata.json');
    let document;
    try {await checkedPath(path); document = JSON.parse(await readFile(path, 'utf8'));}
    catch (error) {if (error.code === 'ENOENT') throw fail('文件版本不存在', 404, 'REVISION_NOT_FOUND'); if (error instanceof SyntaxError) throw fail('文档版本登记损坏', 422, 'DOCUMENT_CORRUPT'); throw error;}
    if (document.schema !== 1 || document.projectId !== projectId || document.documentId !== documentId || document.fileRevision !== revision || !Object.hasOwn(TYPES, document.type) || !/^[a-f0-9]{64}$/.test(document.sha256 || '') || !Number.isSafeInteger(document.size) || document.size < 1 || document.size > OFFICE_DOCUMENT_MAX_BYTES) throw fail('文档版本登记不一致', 422, 'DOCUMENT_CORRUPT');
    return document;
  }

  async function get(projectId, documentId, options = {}) {
    const folder = await documentFolder(projectId, documentId);
    const version = options.revision === undefined ? Number((await revisions(folder)).at(-1)) : checkedRevision(options.revision);
    if (!version) throw fail('当前文档尚无已保存版本', 404, 'DOCUMENT_NOT_FOUND');
    return metadata(folder, projectId, documentId, version);
  }

  async function list(projectId, options = {}) {
    const directory = await project(projectId);
    if (options.unit !== undefined) checkedText(options.unit, '单体');
    if (options.batchId !== undefined) checkedBatch(options.batchId);
    let names;
    try {await checkedPath(directory); names = await readdir(directory);}
    catch (error) {if (error.code === 'ENOENT') return []; throw error;}
    const documents = [];
    for (const id of names.filter(name => ID.test(name))) {
      try {const item = await get(projectId, id); if ((options.unit === undefined || item.unit === options.unit) && (options.batchId === undefined || item.batchId === options.batchId)) documents.push(item);}
      catch (error) {if (error.code !== 'DOCUMENT_NOT_FOUND') throw error;}
    }
    return documents.sort((a, b) => b.savedAt.localeCompare(a.savedAt) || a.documentId.localeCompare(b.documentId));
  }

  async function history(projectId, documentId) {
    const folder = await documentFolder(projectId, documentId);
    const result = [];
    for (const name of (await revisions(folder)).reverse()) result.push(await metadata(folder, projectId, documentId, Number(name)));
    if (!result.length) throw fail('当前文档尚无已保存版本', 404, 'DOCUMENT_NOT_FOUND');
    return result;
  }

  async function read(projectId, documentId, options = {}) {
    const document = await get(projectId, documentId, options);
    const path = join(root, projectId, OFFICE_DOCUMENT_DIRECTORY, documentId, 'versions', revisionName(document.fileRevision), 'document.' + document.type);
    await checkedPath(path);
    const info = await lstat(path);
    if (!info.isFile() || info.size !== document.size || info.size > OFFICE_DOCUMENT_MAX_BYTES) throw fail('已保存文件大小与登记不一致', 422, 'DOCUMENT_CORRUPT');
    const bytes = await readFile(path);
    if (hash(bytes) !== document.sha256) throw fail('已保存文件校验失败，原历史版本仍保留', 422, 'DOCUMENT_CORRUPT');
    return {document, bytes};
  }

  async function checkedBytes(bytes, type, title) {
    if (!Object.hasOwn(TYPES, type)) throw fail('仅支持 DOCX、PPTX 和 XLSX 文档', 422, 'UNSUPPORTED_FORMAT');
    if (!(bytes instanceof Uint8Array) || bytes.length === 0) throw fail('文档内容为空', 422, 'EMPTY_DOCUMENT');
    if (bytes.length > OFFICE_DOCUMENT_MAX_BYTES) throw fail('文档超过 64 MB', 413, 'RESOURCE_LIMIT');
    // Copy caller memory so concurrent caller changes cannot alter validated bytes.
    const buffer = Buffer.from(bytes), detected = await inspect(buffer, filename(title, type), env);
    if (detected.format !== type || detected.encrypted || detected.macros) throw fail('文件真实格式与文档类型不一致，或包含不支持的加密/宏', 422, 'FORMAT_MISMATCH');
    return {buffer, detected};
  }

  async function commit(folder, document, bytes) {
    const versions = join(folder, 'versions');
    await checkedPath(versions, {missing: true});
    await mkdir(versions, {recursive: true});
    const stage = join(versions, '.pending-' + randomUUID());
    await mkdir(stage);
    try {
      await writeFile(join(stage, 'document.' + document.type), bytes, {flag: 'wx'});
      await writeFile(join(stage, 'metadata.json'), JSON.stringify(document), {encoding: 'utf8', flag: 'wx'});
      await project(document.projectId);
      try {await rename(stage, join(versions, revisionName(document.fileRevision)));}
      catch (error) {
        const existing = await revisions(folder);
        if (existing.includes(revisionName(document.fileRevision))) throw fail('文档已有新版本，请载入最新版本后再保存', 409, 'REVISION_CONFLICT');
        throw error;
      }
    } finally {
      // Only this operation's staging directory can be removed; committed history stays.
      if (within(versions, stage) && stage.startsWith(join(versions, '.pending-'))) await rm(stage, {recursive: true, force: true});
    }
    return document;
  }

  async function create(input) {
    const directory = await project(input.projectId), unit = checkedText(input.unit, '单体'), title = checkedText(input.title, '文档名称');
    const origin = input.origin || 'generated';
    if (!ORIGINS.has(origin)) throw fail('文档来源类型无效');
    const sourceParameterVersion = checkedVersion(input.sourceParameterVersion), batchId = checkedBatch(input.batchId);
    const {buffer, detected} = await checkedBytes(input.bytes, input.type, title);
    const documentId = randomUUID().replaceAll('-', ''), folder = join(directory, documentId), now = new Date().toISOString();
    await checkedPath(directory, {missing: true});
    await mkdir(directory, {recursive: true});
    await mkdir(folder);
    return commit(folder, {schema: 1, documentId, projectId: input.projectId, unit, type: input.type, title,
      filename: filename(title, input.type), mime: TYPES[input.type], fileRevision: 1, sha256: hash(buffer), size: buffer.length,
      sourceParameterVersion, batchId, origin, hasManualChanges: origin === 'manual' || origin === 'mcp',
      createdAt: now, savedAt: now, formatVersion: detected.formatVersion || '', warnings: detected.warnings || []}, buffer);
  }

  async function save(input) {
    const expected = checkedRevision(input.expectedRevision), old = await get(input.projectId, input.documentId);
    if (old.fileRevision !== expected) throw fail('文档已有新版本，请载入最新版本后再保存', 409, 'REVISION_CONFLICT');
    const origin = input.origin || 'manual';
    if (!ORIGINS.has(origin)) throw fail('文档来源类型无效');
    if (old.hasManualChanges && (origin === 'generated' || origin === 'imported')) throw fail('这份文档已有人工修改，请将重新生成的内容另存为新文档', 409, 'MANUAL_DOCUMENT_PROTECTED');
    if (input.unit !== undefined && input.unit !== old.unit) throw fail('保存单体与文档不一致', 409, 'DOCUMENT_SCOPE_MISMATCH');
    if (input.batchId !== undefined && input.batchId !== old.batchId) throw fail('保存成果集与文档不一致', 409, 'DOCUMENT_SCOPE_MISMATCH');
    if (input.type !== undefined && input.type !== old.type) throw fail('保存文档类型不一致', 422, 'FORMAT_MISMATCH');
    const title = input.title === undefined ? old.title : checkedText(input.title, '文档名称');
    const sourceParameterVersion = input.sourceParameterVersion === undefined ? old.sourceParameterVersion : checkedVersion(input.sourceParameterVersion);
    const {buffer, detected} = await checkedBytes(input.bytes, old.type, title);
    const folder = await documentFolder(input.projectId, input.documentId);
    return commit(folder, {...old, title, filename: filename(title, old.type), fileRevision: checkedRevision(expected + 1), sha256: hash(buffer), size: buffer.length,
      sourceParameterVersion, origin, hasManualChanges: old.hasManualChanges || origin === 'manual' || origin === 'mcp',
      savedAt: new Date().toISOString(), formatVersion: detected.formatVersion || '', warnings: detected.warnings || []}, buffer);
  }

  return {root, create, list, get, save, read, history};
}
