import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, readdir, unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Document, Packer, Paragraph} from 'docx';
import pptxgen from 'pptxgenjs';
import {writePart, readPart} from '../../server/project-store.mjs';
import {createOfficeDocumentStore, OFFICE_DOCUMENT_DIRECTORY} from '../../server/office-document-store.mjs';
import {createProjectArchive, importProjectArchive, portableProjectPaths} from '../../server/portable-projects.mjs';

const run = promisify(execFile), id = () => randomUUID().replaceAll('-', '');
const base = fileURLToPath(new URL('../../qa/portable-release/mcp/office-archive/', import.meta.url));
await mkdir(base, {recursive: true});
const python = process.env.WORKBENCH_PYTHON || (process.platform === 'win32' ? join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe') : 'python3');
const originalWord = await Packer.toBuffer(new Document({sections: [{children: [new Paragraph('原始结构设计说明；设防参数来自本项目。')]}]}));
const editedWord = await Packer.toBuffer(new Document({sections: [{children: [new Paragraph('工程师修改的段落，不被旧稿覆盖。')]}]}));
async function fixture({files = true} = {}) {
  const root = await mkdtemp(join(base, '备份 还原 ')), projectId = id();
  const env = {WORKBENCH_DATABASE_ROOT: join(root, '电脑甲'), WORKBENCH_PYTHON: python};
  const paths = portableProjectPaths(env), store = createOfficeDocumentStore({...env, WORKBENCH_PROJECT_STORE: paths.store});
  await writePart(paths.store, projectId, 'main', {parameters: {project_name: '工程文档备份验收'}, parameterVersion: 7}, 0);
  const batchId = id(), documents = [];
  if (files) {
    const word = await store.create({projectId, unit: '一号楼', type: 'docx', title: '扩初说明', bytes: originalWord, sourceParameterVersion: 7, batchId});
    documents.push(await store.save({projectId, documentId: word.documentId, expectedRevision: 1, bytes: editedWord}));
    const ppt = new pptxgen(); ppt.addSlide().addText('同一批次结构汇报', {x: 1, y: 1, w: 6, h: 1});
    documents.push(await store.create({projectId, unit: '一号楼', type: 'pptx', title: '结构汇报', bytes: await ppt.write({outputType: 'nodebuffer'}), sourceParameterVersion: 7, batchId}));
    const workbook = join(root, '合成.xlsx');
    await run(python, ['-c', 'import sys;from openpyxl import Workbook;w=Workbook();w.active.append(["楼层数",5]);w.save(sys.argv[1])', workbook], {windowsHide: true});
    documents.push(await store.create({projectId, unit: '一号楼', type: 'xlsx', title: '参数表', bytes: await readFile(workbook), sourceParameterVersion: 7, batchId}));
  }
  return {root, projectId, env, paths, store, batchId, documents};
}

// Recalculate outer ZIP hashes so malicious inputs exercise the Office validation,
// rather than merely failing the existing generic archive checksum check.
async function modifiedArchive(source, destination, mode) {
  const script = `import sys,zipfile,json,hashlib
with zipfile.ZipFile(sys.argv[1]) as z: files={i.filename:z.read(i.filename) for i in z.infolist()}
m=json.loads(files.pop('manifest.json'));mode=sys.argv[3]
if mode=='legacy': m.pop('officeDocuments',None)
else:
 d=next(x for x in m['officeDocuments'] if x['type']=='docx');v=d['versions'][0];p=v['metadataPath'];meta=json.loads(files[p])
 if mode=='missing': files.pop(v['filePath'])
 elif mode=='gap': d['versions'][1]['revision']=3
 elif mode=='scope': meta['projectId']='f'*32
 elif mode=='unit': meta['unit']='其他单体'
 elif mode=='hash': meta['sha256']='0'*64
 elif mode=='badformat':
  files[v['filePath']]=b'not an Office document';meta['sha256']=hashlib.sha256(files[v['filePath']]).hexdigest();meta['size']=len(files[v['filePath']]);v['sha256']=meta['sha256'];v['size']=meta['size']
 elif mode=='duplicate': m['officeDocuments'].append(d.copy())
 elif mode=='unlisted': m.pop('officeDocuments')
 elif mode=='path': v['filePath']='files/office-documents/../escape.docx'
 elif mode=='batch':
  p=d['versions'][1]['metadataPath'];meta=json.loads(files[p]);meta['batchId']='wrong-batch'
 files[p]=json.dumps(meta,ensure_ascii=False).encode()
m['entries']=[dict(path=p,bytes=len(b),sha256=hashlib.sha256(b).hexdigest()) for p,b in sorted(files.items())]
with zipfile.ZipFile(sys.argv[2],'x',compression=zipfile.ZIP_DEFLATED) as z:
 z.writestr('manifest.json',json.dumps(m,ensure_ascii=False));[z.writestr(p,b) for p,b in files.items()]
`;
  await run(python, ['-c', script, source, destination, mode], {windowsHide: true});
}

test('跨电脑项目备份恢复全部 Office 文档、人工稿和历史，重映射项目 ID 后仍可编辑再备份', async t => {
  const f = await fixture(), mainBefore = await readPart(f.paths.store, f.projectId, 'main');
  const archive = await createProjectArchive(f.projectId, f.env); t.after(archive.cleanup);
  const destination = {WORKBENCH_DATABASE_ROOT: join(f.root, '电脑乙'), WORKBENCH_PYTHON: python}, projectId = id();
  const result = await importProjectArchive(archive.file, destination, {newId: () => projectId});
  assert.equal(result.officeCount, 3); assert.equal(result.projectId, projectId); assert.notEqual(projectId, f.projectId);
  const store = createOfficeDocumentStore({...destination, WORKBENCH_PROJECT_STORE: portableProjectPaths(destination).store});
  const actual = await store.list(projectId, {batchId: f.batchId}); assert.equal(actual.length, 3);
  for (const original of f.documents) {
    const restored = await store.get(projectId, original.documentId);
    assert.deepEqual(restored, {...original, projectId});
    assert.deepEqual((await store.read(projectId, original.documentId)).bytes, (await f.store.read(f.projectId, original.documentId)).bytes);
  }
  const word = f.documents.find(d => d.type === 'docx');
  assert.deepEqual((await store.read(projectId, word.documentId, {revision: 1})).bytes, originalWord);
  assert.deepEqual((await store.read(projectId, word.documentId)).bytes, editedWord);
  assert.deepEqual((await store.history(projectId, word.documentId)).map(v => v.projectId), [projectId, projectId]);
  await store.save({projectId, documentId: word.documentId, expectedRevision: 2, bytes: editedWord, origin: 'mcp'});
  assert.equal((await f.store.get(f.projectId, word.documentId)).fileRevision, 2);
  assert.deepEqual(await readPart(f.paths.store, f.projectId, 'main'), mainBefore);
  const second = await createProjectArchive(projectId, destination); t.after(second.cleanup);
  const thirdEnv = {WORKBENCH_DATABASE_ROOT: join(f.root, '电脑丙'), WORKBENCH_PYTHON: python};
  const third = await importProjectArchive(second.file, thirdEnv);
  const thirdStore = createOfficeDocumentStore({...thirdEnv, WORKBENCH_PROJECT_STORE: portableProjectPaths(thirdEnv).store});
  assert.equal((await thirdStore.get(third.projectId, word.documentId)).fileRevision, 3);
  assert.equal((await thirdStore.history(third.projectId, word.documentId)).length, 3);
});

test('没有 Office 清单的历史项目包仍可导入，不要求用户升级旧备份', async t => {
  const f = await fixture({files: false}), archive = await createProjectArchive(f.projectId, f.env); t.after(archive.cleanup);
  const legacy = join(f.root, '旧版.workbench.zip'); await modifiedArchive(archive.file, legacy, 'legacy');
  const result = await importProjectArchive(legacy, {WORKBENCH_DATABASE_ROOT: join(f.root, '旧包目标'), WORKBENCH_PYTHON: python});
  assert.equal(result.officeCount, 0); assert.notEqual(result.projectId, f.projectId);
});

test('Office 缺件、断版、错误哈希、类型和 scope 即使外层校验重算也拒绝发布', async t => {
  const f = await fixture(), archive = await createProjectArchive(f.projectId, f.env); t.after(archive.cleanup);
  const cases = [
    ['missing', /附件缺失/], ['gap', /版本不连续/], ['scope', /所属项目/], ['unit', /所属项目/], ['hash', /登记不一致/],
    ['badformat', /无法识别|不是|格式|Office|损坏/], ['duplicate', /清单或历史版本/], ['unlisted', /未声明/], ['path', /路径无效/], ['batch', /历史登记/]
  ];
  for (const [mode, message] of cases) {
    const bad = join(f.root, mode + '.zip'); await modifiedArchive(archive.file, bad, mode);
    const destination = {WORKBENCH_DATABASE_ROOT: join(f.root, '拒绝 ' + mode), WORKBENCH_PYTHON: python};
    await assert.rejects(importProjectArchive(bad, destination), message, mode);
    assert.deepEqual(await readdir(portableProjectPaths(destination).store).catch(() => []), [], mode + ' must not publish partial project');
  }
  assert.equal((await f.store.list(f.projectId)).length, 3);
});

test('文档历史丢失时导出失败，不生成看似完整但漏文件的备份', async () => {
  const f = await fixture(), word = f.documents.find(d => d.type === 'docx');
  const file = join(f.paths.store, f.projectId, OFFICE_DOCUMENT_DIRECTORY, word.documentId, 'versions', '0000000001', 'document.docx');
  await unlink(file);
  await assert.rejects(createProjectArchive(f.projectId, f.env), {code: 'ENOENT'});
});
