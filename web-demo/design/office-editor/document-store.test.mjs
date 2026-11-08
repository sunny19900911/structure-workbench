import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, writeFile, readdir, symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Document, Packer, Paragraph} from 'docx';
import pptxgen from 'pptxgenjs';
import {writePart, readPart} from '../../server/project-store.mjs';
import {createOfficeDocumentStore, OFFICE_DOCUMENT_MAX_BYTES, OFFICE_DOCUMENT_DIRECTORY} from '../../server/office-document-store.mjs';

const base = fileURLToPath(new URL('../../qa/portable-release/mcp/office-store/', import.meta.url));
await mkdir(base, {recursive: true});
const root = await mkdtemp(join(base, '文档版本 '));
const env = {WORKBENCH_PROJECT_STORE: root};
const id = () => randomUUID().replaceAll('-', '');
async function project() {const projectId = id(); await writePart(root, projectId, 'main', {parameters: {project_name: 'Office 存储验收'}}, 0); return projectId;}
const word = text => Packer.toBuffer(new Document({sections: [{children: [new Paragraph(text)]}]}));
const firstBytes = await word('一号楼：初始扩初说明，结构高度 23.70 m。');
const changedBytes = await word('一号楼：人工修改后的扩初说明，保留本次编辑。');
const input = (projectId, extra = {}) => ({projectId, unit: '一号楼', type: 'docx', title: '扩初说明', bytes: firstBytes, sourceParameterVersion: 3, ...extra});

test('真实 DOCX 保存、编辑、重新打开及历史版本字节一致，项目参数不回写', async () => {
  const projectId = await project(), store = createOfficeDocumentStore(env);
  const created = await store.create(input(projectId));
  assert.equal(created.fileRevision, 1); assert.equal(created.projectId, projectId); assert.equal(created.unit, '一号楼');
  assert.equal(created.filename, '扩初说明.docx'); assert.equal(created.sourceParameterVersion, 3); assert.equal(created.hasManualChanges, false);
  assert.deepEqual((await store.read(projectId, created.documentId)).bytes, firstBytes);
  const saved = await store.save({projectId, documentId: created.documentId, expectedRevision: 1, bytes: changedBytes});
  assert.equal(saved.fileRevision, 2); assert.equal(saved.hasManualChanges, true); assert.equal(saved.sourceParameterVersion, 3);
  const reopened = createOfficeDocumentStore(env);
  assert.deepEqual((await reopened.read(projectId, created.documentId)).bytes, changedBytes);
  assert.deepEqual((await reopened.read(projectId, created.documentId, {revision: 1})).bytes, firstBytes);
  assert.deepEqual((await reopened.history(projectId, created.documentId)).map(d => d.fileRevision), [2, 1]);
  assert.equal((await readPart(root, projectId, 'main')).revision, 1);
});

test('DOCX / PPTX / XLSX 通过真实内容识别再存储，保留文件原字节', async () => {
  const projectId = await project(), store = createOfficeDocumentStore(env);
  const ppt = new pptxgen(); ppt.addSlide().addText('结构工作台验收', {x: 1, y: 1, w: 6, h: 1});
  const presentation = await ppt.write({outputType: 'nodebuffer'});
  const xlsxPath = join(root, '合成表格.xlsx');
  const python = process.env.WORKBENCH_PYTHON || (process.platform === 'win32' ? join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe') : 'python3');
  await promisify(execFile)(python, ['-c', 'import sys;from openpyxl import Workbook;w=Workbook();w.active.append(["结构高度",23.7]);w.save(sys.argv[1])', xlsxPath], {windowsHide: true});
  for (const [type, bytes] of [['docx', firstBytes], ['pptx', presentation], ['xlsx', await readFile(xlsxPath)]]) {
    const document = await store.create(input(projectId, {type, bytes, title: '真实文件 ' + type}));
    assert.equal(document.type, type); assert.equal(document.fileRevision, 1);
    assert.deepEqual((await store.read(projectId, document.documentId)).bytes, bytes);
  }
  assert.equal((await store.list(projectId)).length, 3);
});

test('两个独立存储实例同时保存同一版本，仅一个提交成功，历史不被覆盖', async () => {
  const projectId = await project(), a = createOfficeDocumentStore(env), b = createOfficeDocumentStore(env);
  const original = await a.create(input(projectId));
  const results = await Promise.allSettled([
    a.save({projectId, documentId: original.documentId, expectedRevision: 1, bytes: changedBytes}),
    b.save({projectId, documentId: original.documentId, expectedRevision: 1, bytes: firstBytes, origin: 'mcp'})
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.status, 409);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'REVISION_CONFLICT');
  assert.deepEqual((await a.history(projectId, original.documentId)).map(d => d.fileRevision), [2, 1]);
  assert.deepEqual((await a.read(projectId, original.documentId, {revision: 1})).bytes, firstBytes);
  const versions = await readdir(join(root, projectId, OFFICE_DOCUMENT_DIRECTORY, original.documentId, 'versions'));
  assert.deepEqual(versions.sort(), ['0000000001', '0000000002']);
});

test('跨项目、单体与文档类型写入受保护，按单体列出文档', async () => {
  const projectA = await project(), projectB = await project(), store = createOfficeDocumentStore(env);
  const first = await store.create(input(projectA));
  await store.create(input(projectA, {unit: '二号楼'}));
  assert.equal((await store.list(projectA)).length, 2); assert.equal((await store.list(projectA, {unit: '二号楼'})).length, 1);
  assert.deepEqual(await store.list(projectB), []);
  await assert.rejects(store.read(projectB, first.documentId), {status: 404, code: 'DOCUMENT_NOT_FOUND'});
  await assert.rejects(store.save({projectId: projectA, documentId: first.documentId, expectedRevision: 1, unit: '二号楼', bytes: changedBytes}), {status: 409, code: 'DOCUMENT_SCOPE_MISMATCH'});
  await assert.rejects(store.save({projectId: projectA, documentId: first.documentId, expectedRevision: 1, type: 'pptx', bytes: changedBytes}), {status: 422, code: 'FORMAT_MISMATCH'});
  assert.equal((await store.get(projectA, first.documentId)).fileRevision, 1);
});

test('原始已编辑文档不被重新生成覆盖；MCP 修改同样受保护', async () => {
  const projectId = await project(), store = createOfficeDocumentStore(env);
  for (const origin of ['manual', 'mcp']) {
    const document = await store.create(input(projectId));
    await store.save({projectId, documentId: document.documentId, expectedRevision: 1, bytes: changedBytes, origin});
    for (const replacementOrigin of ['generated', 'imported']) await assert.rejects(store.save({projectId, documentId: document.documentId, expectedRevision: 2, bytes: firstBytes, origin: replacementOrigin}), {status: 409, code: 'MANUAL_DOCUMENT_PROTECTED'});
    assert.deepEqual((await store.read(projectId, document.documentId)).bytes, changedBytes);
  }
});

test('项目未保存或已删除时明确报 404/410，不建立孤立项目', async () => {
  const projectId = id(), store = createOfficeDocumentStore(env);
  await assert.rejects(store.create(input(projectId)), {status: 404, code: 'PROJECT_NOT_FOUND'});
  assert.ok(!(await readdir(root)).includes(projectId));
  await writePart(root, projectId, 'main', {parameters: {}}, 0);
  const document = await store.create(input(projectId));
  await writePart(root, projectId, 'lifecycle', {deleted: true}, 0);
  for (const run of [() => store.list(projectId), () => store.get(projectId, document.documentId), () => store.create(input(projectId)), () => store.save({projectId, documentId: document.documentId, expectedRevision: 1, bytes: changedBytes})]) await assert.rejects(run(), {status: 410, code: 'PROJECT_DELETED'});
  await writePart(root, projectId, 'lifecycle', {deleted: false}, 1);
  assert.deepEqual((await store.read(projectId, document.documentId)).bytes, firstBytes);
});

test('真实格式不匹配、损坏、空文件和超限文件不会产生可见版本', async () => {
  const projectId = await project(), store = createOfficeDocumentStore(env);
  await assert.rejects(store.create(input(projectId, {type: 'xlsx'})), {code: 'FORMAT_MISMATCH'});
  await assert.rejects(store.create(input(projectId, {bytes: Buffer.from('not a DOCX')})), {status: 422});
  await assert.rejects(store.create(input(projectId, {bytes: Buffer.alloc(0)})), {code: 'EMPTY_DOCUMENT'});
  await assert.rejects(store.create(input(projectId, {bytes: Buffer.alloc(OFFICE_DOCUMENT_MAX_BYTES + 1)})), {status: 413});
  await assert.rejects(store.create(input(projectId, {type: 'docm'})), {code: 'UNSUPPORTED_FORMAT'});
  assert.deepEqual(await store.list(projectId), []);
  const document = await store.create(input(projectId));
  await assert.rejects(store.save({projectId, documentId: document.documentId, expectedRevision: 1, bytes: Buffer.from('broken')}));
  assert.equal((await store.get(projectId, document.documentId)).fileRevision, 1);
});

test('路径穿越、目录链接和无效版本拒绝访问', async () => {
  const projectId = await project(), store = createOfficeDocumentStore(env);
  await assert.rejects(store.list('../escape'), {code: 'INVALID_PROJECT'});
  await assert.rejects(store.get(projectId, '../escape'), {code: 'INVALID_DOCUMENT_ID'});
  const document = await store.create(input(projectId, {title: '../需清理/文件名称'}));
  assert.equal(document.filename, '.._需清理_文件名称.docx');
  await assert.rejects(store.get(projectId, document.documentId, {revision: '../1'}), {status: 400});
  await assert.rejects(store.save({projectId, documentId: document.documentId, expectedRevision: 0, bytes: firstBytes}), {status: 400});
  const linkedProject = await project(), target = join(root, 'link-target');
  await mkdir(target);
  await symlink(target, join(root, linkedProject, OFFICE_DOCUMENT_DIRECTORY), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(store.create(input(linkedProject)), {code: 'INVALID_PATH'});
  assert.deepEqual(await readdir(target), []);
});

test('存储损坏通过字节哈希检测，不将坏文件返回给编辑器', async () => {
  const projectId = await project(), store = createOfficeDocumentStore(env), document = await store.create(input(projectId));
  const path = join(root, projectId, OFFICE_DOCUMENT_DIRECTORY, document.documentId, 'versions', '0000000001', 'document.docx');
  const bad = Buffer.from(firstBytes); bad[bad.length - 1] ^= 1; await writeFile(path, bad);
  await assert.rejects(store.read(projectId, document.documentId), {status: 422, code: 'DOCUMENT_CORRUPT'});
});

test('调用者传入字节会复制，验证期间外部改动不污染提交；旧修订不调用格式转换', async () => {
  const projectId = await project(); let calls = 0, release, entered;
  const inspecting = new Promise(resolve => {entered = resolve;});
  const barrier = new Promise(resolve => {release = resolve;});
  const store = createOfficeDocumentStore(env, {inspect: async () => {calls++; entered(); await barrier; return {format: 'docx', warnings: []};}});
  const bytes = Buffer.from('synthetic isolated validator test');
  const expected = Buffer.from(bytes), pending = store.create(input(projectId, {bytes}));
  await inspecting; bytes.fill(0); release();
  const document = await pending;
  assert.deepEqual((await store.read(projectId, document.documentId)).bytes, expected);
  await assert.rejects(store.save({projectId, documentId: document.documentId, expectedRevision: 2, bytes: expected}), {status: 409});
  assert.equal(calls, 1);
});

test('登记保存参数版本但不把缺失版本或文件创建版本猜成Office版本', async () => {
  const projectId = await project(), store = createOfficeDocumentStore(env);
  const document = await store.create(input(projectId, {sourceParameterVersion: 'params-4'}));
  assert.equal(document.sourceParameterVersion, 'params-4'); assert.ok(document.formatVersion.includes('Office Open XML'));
  const saved = await store.save({projectId, documentId: document.documentId, expectedRevision: 1, bytes: firstBytes, sourceParameterVersion: 5});
  assert.equal(saved.sourceParameterVersion, 5);
  await assert.rejects(store.create(input(projectId, {sourceParameterVersion: -1})), {status: 400});
  await assert.rejects(store.create(input(projectId, {unit: ''})), {status: 400});
});

test('同一次自然语言生成的成果集保留批次，编辑不改变所属成果集', async () => {
  const projectId = await project(), store = createOfficeDocumentStore(env), batchId = id();
  const document = await store.create(input(projectId, {batchId}));
  await store.create(input(projectId, {batchId: id()}));
  assert.equal((await store.list(projectId, {batchId})).length, 1);
  const saved = await store.save({projectId, documentId: document.documentId, expectedRevision: 1, bytes: changedBytes});
  assert.equal(saved.batchId, batchId);
  await assert.rejects(store.save({projectId, documentId: document.documentId, expectedRevision: 2, bytes: changedBytes, batchId: 'different'}), {status: 409, code: 'DOCUMENT_SCOPE_MISMATCH'});
  await assert.rejects(store.create(input(projectId, {batchId: '../bad'})), {status: 400});
});
