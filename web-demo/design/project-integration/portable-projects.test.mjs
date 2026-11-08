import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, writeFile, stat, readdir, symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createServer} from 'node:http';
import {writePart, readPart} from '../../server/project-store.mjs';
import {createProjectArchive, importProjectArchive, portableProjectApi, portableProjectPaths} from '../../server/portable-projects.mjs';

const exec = promisify(execFile);
const python = process.env.WORKBENCH_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const qa = fileURLToPath(new URL('../../qa/portable-projects/', import.meta.url));
await mkdir(qa, {recursive: true});
const sourceId = 'a'.repeat(32), destinationId = 'b'.repeat(32), checksum = value => createHash('sha256').update(value).digest('hex');
const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');

async function fixture({workbook = true} = {}) {
  const root = await mkdtemp(join(qa, 'case-'));
  const env = {WORKBENCH_DATABASE_ROOT: join(root, '电脑甲'), WORKBENCH_PYTHON: python, CALCBOOK_SOURCE_DIR: join(root, '母件')};
  const paths = portableProjectPaths(env), input = join(root, '盈建科输出'), relativePath = '单体一/计算书/上部/结构报告.pdf';
  await mkdir(join(input, '单体一/计算书/上部'), {recursive: true});
  await writeFile(join(input, relativePath), pdf); const info = await stat(join(input, relativePath));
  const main = {parameters: {project_name: '离线交接试验', projectId: sourceId}, mode: 'blank', calculation: {pdfSources: {path: input, files: [{relativePath, name: '结构报告.pdf', group: '上部', pages: 1, size: info.size, mtimeMs: info.mtimeMs}]}, linkedExcel: {workbook: 'jump-column', sheet: '计算', edits: {B2: '8'}}, outFiles: [{name: 'wmass.out', text: 'current project'}]}};
  await writePart(paths.store, sourceId, 'main', main, 0);
  await writePart(paths.store, sourceId, 'main', {...main, parameterVersion: 2}, 1);
  await writePart(paths.store, sourceId, 'expansion-unit1', {identity: {project_id: sourceId, unit: '单体一'}, tableEdits: {table1: {cell: '人工改写'}}, reportImages: [{dataUrl: 'data:image/png;base64,aGVsbG8='}], body: '正文初稿'}, 0);
  await writePart(paths.store, sourceId, 'expansion-unit1', {identity: {project_id: sourceId, unit: '单体一'}, tableEdits: {table1: {cell: '人工改写'}}, reportImages: [{dataUrl: 'data:image/png;base64,aGVsbG8='}], body: '正文定稿'}, 1);
  if (workbook) {
    await mkdir(env.CALCBOOK_SOURCE_DIR, {recursive: true});
    await exec(python, ['-c', "import sys,zipfile; z=zipfile.ZipFile(sys.argv[1],'w'); z.writestr('[Content_Types].xml','<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"/>'); z.writestr('xl/workbook.xml','<workbook/>'); z.close()", join(env.CALCBOOK_SOURCE_DIR, '跃层柱测试.xlsx')]);
  }
  return {root, env, paths, input, relativePath};
}

test('跨电脑项目包保留所有分区版本、人工稿、图片和真实PDF；新ID与Excel母件隔离', async t => {
  const f = await fixture(), before = await readPart(f.paths.store, sourceId, 'main');
  const archive = await createProjectArchive(sourceId, f.env); t.after(archive.cleanup);
  assert.deepEqual(archive.warnings, []);
  const destination = {WORKBENCH_DATABASE_ROOT: join(f.root, '电脑乙'), WORKBENCH_PYTHON: python};
  const result = await importProjectArchive(archive.file, destination, {newId: () => destinationId});
  const paths = portableProjectPaths(destination), main = await readPart(paths.store, destinationId, 'main'), expansion = await readPart(paths.store, destinationId, 'expansion-unit1');
  assert.equal(result.pdfCount, 1); assert.equal(main.revision, 2); assert.equal(expansion.revision, 2);
  assert.equal(main.data.parameters.projectId, destinationId); assert.equal(expansion.data.identity.project_id, destinationId);
  assert.equal(expansion.data.body, '正文定稿'); assert.equal(expansion.data.tableEdits.table1.cell, '人工改写');
  assert.equal(expansion.data.reportImages[0].dataUrl, 'data:image/png;base64,aGVsbG8=');
  assert.equal((await readdir(join(paths.store, destinationId, 'main'))).length, 2);
  const restored = main.data.calculation.pdfSources;
  assert.ok(restored.path.startsWith(paths.uploads)); assert.ok(!restored.path.includes('电脑甲'));
  assert.equal(checksum(await readFile(join(restored.path, restored.files[0].relativePath))), checksum(pdf));
  assert.equal((await stat(join(restored.path, restored.files[0].relativePath))).mtimeMs, restored.files[0].mtimeMs);
  assert.deepEqual(await readPart(f.paths.store, sourceId, 'main'), before);
  assert.deepEqual(await readFile(join(f.input, f.relativePath)), pdf);
  const source = await readPart(paths.store, destinationId, 'portable-assets');
  assert.equal(source.data.calculationSources.files[0].key, 'jump-column');
  assert.equal(checksum(await readFile(join(paths.assets, destinationId, 'calculation-sources', '跃层柱测试.xlsx'))), source.data.calculationSources.files[0].sha256);
  // Imported projects remain portable without the first computer's configured source path.
  const second = await createProjectArchive(destinationId, destination); t.after(second.cleanup);
  assert.deepEqual(second.warnings, []);
  const third = await importProjectArchive(second.file, {WORKBENCH_DATABASE_ROOT: join(f.root, '电脑丙'), WORKBENCH_PYTHON: python});
  assert.notEqual(third.projectId, destinationId); assert.equal(third.pdfCount, 1);
});

test('项目编号碰撞不覆盖，损坏校验与恶意路径不会发布半个项目', async t => {
  const f = await fixture(), archive = await createProjectArchive(sourceId, f.env); t.after(archive.cleanup);
  const before = await readPart(f.paths.store, sourceId, 'main');
  await assert.rejects(importProjectArchive(archive.file, f.env, {newId: () => sourceId}), /已存在/);
  assert.deepEqual(await readPart(f.paths.store, sourceId, 'main'), before);
  const corrupt = join(f.root, 'corrupt.zip');
  await exec(python, ['-c', "import sys,zipfile; a=zipfile.ZipFile(sys.argv[1]); b=zipfile.ZipFile(sys.argv[2],'w'); [(b.writestr(i.filename,a.read(i.filename)+(b'changed' if i.filename.endswith('.pdf') else b''))) for i in a.infolist()]; b.close()", archive.file, corrupt]);
  const destination = {WORKBENCH_DATABASE_ROOT: join(f.root, '安全目标'), WORKBENCH_PYTHON: python};
  await assert.rejects(importProjectArchive(corrupt, destination), /校验/);
  const traversal = join(f.root, 'traversal.zip');
  await exec(python, ['-c', "import sys,zipfile; z=zipfile.ZipFile(sys.argv[1],'w'); z.writestr('../outside.txt','not allowed'); z.close()", traversal]);
  await assert.rejects(importProjectArchive(traversal, destination), /不安全/);
  const duplicate = join(f.root, 'duplicate.zip');
  await exec(python, ['-c', "import sys,zipfile; z=zipfile.ZipFile(sys.argv[1],'w'); z.writestr('Data.json','x'); z.writestr('data.json','y'); z.close()", duplicate]);
  await assert.rejects(importProjectArchive(duplicate, destination), /重复/);
  assert.deepEqual(await readdir(portableProjectPaths(destination).store).catch(() => []), []);
});

test('缺失或多匹配Excel母件明确警告，PDF变化和链接拒绝静默遗漏', async t => {
  const f = await fixture({workbook: false}), archive = await createProjectArchive(sourceId, f.env); t.after(archive.cleanup);
  assert.match(archive.warnings.join(''), /母件/);
  const result = await importProjectArchive(archive.file, {WORKBENCH_DATABASE_ROOT: join(f.root, '带缺项副本'), WORKBENCH_PYTHON: python});
  assert.match(result.warnings.join(''), /母件/);
  await writeFile(join(f.input, f.relativePath), Buffer.concat([pdf, Buffer.from('modified')]));
  await assert.rejects(createProjectArchive(sourceId, f.env), /变化/);
  const other = await fixture();
  const source = await readPart(other.paths.store, sourceId, 'main');
  const outside = join(other.root, '另一个目录'); await mkdir(outside); await writeFile(join(outside, 'private.pdf'), pdf);
  await symlink(outside, join(other.input, '链接目录'), process.platform === 'win32' ? 'junction' : 'dir');
  source.data.calculation.pdfSources.files[0].relativePath = '链接目录/private.pdf';
  await writePart(other.paths.store, sourceId, 'main', source.data, source.revision);
  await assert.rejects(createProjectArchive(sourceId, other.env), /链接/);
});

test('项目包接口仅接受主动同源请求，返回有效ZIP且导入可读取', async t => {
  const f = await fixture(); let handler;
  portableProjectApi(f.env).configureServer({middlewares: {use(route, callback) { assert.equal(route, '/api/portable-projects'); handler = callback; }}});
  const server = createServer((req, res) => handler(req, res)); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve))); const base = 'http://127.0.0.1:' + server.address().port;
  const headers = {'X-Workbench-Request': 'portable-projects'};
  assert.equal((await fetch(base + '/export?project=' + sourceId, {method: 'POST'})).status, 403);
  assert.equal((await fetch(base + '/export?project=' + sourceId, {method: 'POST', headers: {...headers, Origin: 'https://outside.example'}})).status, 403);
  const response = await fetch(base + '/export?project=' + sourceId, {method: 'POST', headers});
  assert.equal(response.status, 200); assert.equal(response.headers.get('Content-Type'), 'application/zip');
  const bytes = Buffer.from(await response.arrayBuffer()); assert.equal(bytes.subarray(0, 2).toString(), 'PK');
  const imported = await fetch(base + '/import', {method: 'POST', headers, body: bytes});
  assert.equal(imported.status, 200); const result = await imported.json(); assert.notEqual(result.projectId, sourceId);
  assert.equal((await readPart(f.paths.store, result.projectId, 'main')).revision, 2);
});
