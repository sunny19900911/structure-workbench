import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, writeFile, readFile, copyFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createServer} from 'node:http';
import vm from 'node:vm';
import {writePart} from '../../server/project-store.mjs';
import {readPart} from '../../server/project-store.mjs';
import {createProjectArchive, importProjectArchive} from '../../server/portable-projects.mjs';
import {calculationSourceForProject} from '../../server/portable-calculation-sources.mjs';
import {calculationBookLocalApi} from '../../vite.config.js';

const exec = promisify(execFile), qa = fileURLToPath(new URL('../../qa/portable-calculation-sources/', import.meta.url));
await mkdir(qa, {recursive: true});
const bundledPython = join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
const python = process.env.CALCBOOK_PYTHON || process.env.WORKBENCH_PYTHON || (existsSync(bundledPython) ? bundledPython : process.platform === 'win32' ? 'python' : 'python3');
const ids = ['a', 'b', 'c'].map(value => value.repeat(32)), hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function fixture() {
  const root = await mkdtemp(join(qa, 'case-'));
  const env = {WORKBENCH_PORTABLE: '1', WORKBENCH_DATABASE_ROOT: root, WORKBENCH_PROJECT_STORE: join(root, 'projects'), CALCBOOK_SOURCE_DIR: join(root, 'defaults'), CALCBOOK_PYTHON: python, WORKBENCH_CACHE_ROOT: join(root, 'cache')};
  const create = async (directory, value) => {
    await mkdir(directory, {recursive: true});
    const path = join(directory, '跃层柱测试.xlsx');
    await exec(python, ['-c', "import sys; from openpyxl import Workbook; w=Workbook(); s=w.active; s.title='计算'; s['A1']=sys.argv[2]; s['B2']=8; s['B3']=4; s['B4']=5; s['B5']=6; s['B7']=7; s['B9']=9; w.save(sys.argv[1])", path, value]);
    return path;
  };
  await create(env.CALCBOOK_SOURCE_DIR, 'GLOBAL-NOT-IMPORTED');
  const files = [];
  for (const [index, id] of ids.entries()) {
    await writePart(env.WORKBENCH_PROJECT_STORE, id, 'main', {parameters: {project_name: '项目' + index}}, 0);
    if (index < 2) {
      const path = await create(join(root, 'project-assets', id, 'calculation-sources'), index ? 'PROJECT-B' : 'PROJECT-A'); files.push(path);
      await writePart(env.WORKBENCH_PROJECT_STORE, id, 'portable-assets', {calculationSources: {files: [{key: 'jump-column', name: '跃层柱测试.xlsx', sha256: hash(await readFile(path))}], missing: []}}, 0);
    } else await writePart(env.WORKBENCH_PROJECT_STORE, id, 'portable-assets', {calculationSources: {files: [], missing: [{key: 'jump-column', reason: '原母件未随包交付'}]}}, 0);
  }
  return {env, files, root};
}

test('项目母件严格按ID和哈希选用；缺项、越界、篡改都不回退全局母件', async () => {
  const {env, files} = await fixture();
  assert.match((await calculationSourceForProject(env, env.CALCBOOK_SOURCE_DIR, ids[0], {requiredKeys: ['jump-column']})).directory, new RegExp(ids[0]));
  await assert.rejects(calculationSourceForProject(env, env.CALCBOOK_SOURCE_DIR, ids[2], {requiredKeys: ['jump-column']}), /不会套用其他项目/);
  await assert.rejects(calculationSourceForProject(env, env.CALCBOOK_SOURCE_DIR, '../escape'), /编号无效/);
  await assert.rejects(calculationSourceForProject(env, env.CALCBOOK_SOURCE_DIR, '', {requiredKeys: ['jump-column']}), /打开一个项目/);
  assert.equal((await calculationSourceForProject({...env, WORKBENCH_PORTABLE: ''}, env.CALCBOOK_SOURCE_DIR, ids[0])).directory, env.CALCBOOK_SOURCE_DIR);
  await copyFile(files[1], files[0]);
  await assert.rejects(calculationSourceForProject(env, env.CALCBOOK_SOURCE_DIR, ids[0]), /母件已变化/);
});

test('真实计算书status/workbook/export按项目隔离，缺失母件明确失败且封面仍可用', async t => {
  const {env, root} = await fixture(), routes = [];
  calculationBookLocalApi(env).configureServer({middlewares: {use(prefix, fn) { routes.push([prefix, fn]); }}});
  const server = createServer((req, res) => {
    const found = routes.find(([prefix]) => req.url.split('?')[0] === prefix || req.url.startsWith(prefix + '/'));
    if (!found) { res.writeHead(404); res.end(); return; }
    req.url = req.url.slice(found[0].length) || '/'; found[1](req, res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/calculation-book';
  const status = await (await fetch(base + '/status?project=' + ids[0])).json();
  assert.equal(status.workbooks.length, 1);
  const values = [];
  for (const id of ids.slice(0, 2)) {
    const response = await fetch(base + '/workbook?' + new URLSearchParams({project: id, workbook: 'jump-column', sheet: '计算'}));
    assert.equal(response.status, 200); values.push(JSON.stringify(await response.json()));
  }
  assert.match(values[0], /PROJECT-A/); assert.doesNotMatch(values[0], /PROJECT-B|GLOBAL-NOT/);
  assert.match(values[1], /PROJECT-B/); assert.doesNotMatch(values[1], /PROJECT-A|GLOBAL-NOT/);
  const missing = await fetch(base + '/workbook?' + new URLSearchParams({project: ids[2], workbook: 'jump-column', sheet: '计算'}));
  assert.equal(missing.status, 500); assert.match((await missing.json()).error, /不会套用其他项目/);
  const missingStatus = await (await fetch(base + '/status?project=' + ids[2])).json();
  assert.equal(missingStatus.workbooks.length, 0); assert.match(missingStatus.sourceWarnings.join(''), /未随包/);
  assert.equal((await fetch(base + '/template/cover?project=' + ids[2])).status, 200);
  const body = {confirmed: true, project_name: '独立计算书', sections: [{title: '目录', items: ['测试目录']}], excel_blocks: [{workbook: 'jump-column', sheet: '计算', edits: {B2: 8, B3: 4, B4: 5, B5: 6, B7: 7, B9: 9}}]};
  const failed = await fetch(base + '/export', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...body, project_id: ids[2]})});
  assert.equal(failed.status, 500); assert.match((await failed.json()).error, /不会套用其他项目/);
  const exported = await fetch(base + '/export', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...body, project_id: ids[0]})});
  assert.equal(exported.status, 200);
  const path = join(root, 'result.docx'); await writeFile(path, Buffer.from(await exported.arrayBuffer()));
  const {stdout} = await exec(python, ['-c', "import sys,zipfile; print(zipfile.ZipFile(sys.argv[1]).read('word/document.xml').decode())", path], {env: {...process.env, PYTHONUTF8: '1'}});
  assert.match(stdout, /PROJECT-A/); assert.doesNotMatch(stdout, /PROJECT-B|GLOBAL-NOT/);

  // A colleague chooses a current workbook in the browser; no disk path or manual copy is needed.
  const uploadPath = join(root, '本机选择.xlsx');
  await exec(python, ['-c', 'import sys; from openpyxl import Workbook; w=Workbook(); s=w.active; s.title="计算"; s["A1"]="UPLOADED-C"; s["B6"]="=SQRT(PI()*PI()*3*10^4*1/12*B2*B3^3/(B4*B5*1000))/1000"; s["B8"]="=B6/B7"; s["B10"]="=IF(B8<B9,\\"满足\\",\\"不满足\\")"; w.save(sys.argv[1])', uploadPath]);
  const bytes = await readFile(uploadPath), importUrl = base + '/import-source?' + new URLSearchParams({project: ids[2], slot: 'jump-column', revision: '1'});
  const sourceHeaders = {'X-Workbench-Request': 'calculation-source', 'X-File-Name': encodeURIComponent('本机选择.xlsx')};
  assert.equal((await fetch(importUrl, {method: 'POST', body: bytes})).status, 403);
  assert.equal((await fetch(importUrl, {method: 'POST', headers: sourceHeaders, body: 'not an Excel file'})).status, 422);
  const unknownTemplate = await fetch(importUrl, {method: 'POST', headers: sourceHeaders, body: await readFile(join(env.CALCBOOK_SOURCE_DIR, '跃层柱测试.xlsx'))});
  assert.equal(unknownTemplate.status, 400); assert.match((await unknownTemplate.json()).error, /未套用固定算法/);
  const wrongSlot = await fetch(base + '/import-source?' + new URLSearchParams({project: ids[2], slot: 'stair', revision: '1'}), {method: 'POST', headers: sourceHeaders, body: bytes});
  assert.equal(wrongSlot.status, 400); assert.match((await wrongSlot.json()).error, /xlsm/);
  assert.equal((await readPart(env.WORKBENCH_PROJECT_STORE, ids[2], 'portable-assets')).revision, 1);
  const importedSource = await fetch(importUrl, {method: 'POST', headers: sourceHeaders, body: bytes});
  assert.equal(importedSource.status, 200, await importedSource.clone().text());
  assert.equal((await fetch(importUrl, {method: 'POST', headers: sourceHeaders, body: bytes})).status, 409);
  const uploaded = await (await fetch(base + '/workbook?' + new URLSearchParams({project: ids[2], workbook: 'jump-column', sheet: '计算'}))).json();
  assert.equal(uploaded.can_recalculate, true); assert.match(JSON.stringify(uploaded.rows), /UPLOADED-C/);
  assert.deepEqual(await readFile(uploadPath), bytes);
  const assets = await readPart(env.WORKBENCH_PROJECT_STORE, ids[2], 'portable-assets');
  assert.equal(assets.revision, 2); assert.equal(assets.data.calculationSources.missing.length, 0);
  assert.match(assets.data.calculationSources.batch, /^[a-f0-9]{32}$/);
  const projectArchive = await createProjectArchive(ids[2], env); t.after(projectArchive.cleanup);
  const restoredEnv = {...env, WORKBENCH_DATABASE_ROOT: join(root, '另一位同事'), WORKBENCH_PROJECT_STORE: join(root, '另一位同事', 'projects')};
  const restored = await importProjectArchive(projectArchive.file, restoredEnv);
  const restoredSource = await calculationSourceForProject(restoredEnv, env.CALCBOOK_SOURCE_DIR, restored.projectId, {requiredKeys: ['jump-column']});
  assert.match(restoredSource.directory, new RegExp(restored.projectId));
});

test('前端母件请求带当前项目，迟到失败不污染新项目且先清除旧表', async () => {
  const source = await readFile(new URL('../../calculation-book.js', import.meta.url), 'utf8');
  const state = {textContent: ''}, table = {oldRows: 9, replaceChildren() { this.oldRows = 0; }};
  let finish, requested;
  const context = vm.createContext({window: {WORKBENCH_PORTABLE: true, WorkbenchProjects: {id: ids[0]}}, URLSearchParams, document: {getElementById: id => id === 'calcbook-excel-table' ? table : state}, fetch: url => { requested = url; return new Promise(resolve => { finish = resolve; }); }});
  vm.runInContext(source.split("document.getElementById('calcbook-add')")[0], context);
  vm.runInContext("calcbookState.workbookKey='jump-column'; calcbookState.sheetName='计算';", context);
  const loading = vm.runInContext('calcbookLoadSheet()', context);
  assert.equal(new URL(requested, 'http://localhost').searchParams.get('project'), ids[0]); assert.equal(table.oldRows, 0);
  context.window.WorkbenchProjects.id = ids[1]; state.textContent = '项目B';
  finish({ok: false, json: async () => ({error: '项目A已离线'})}); await loading;
  assert.equal(state.textContent, '项目B');
});
