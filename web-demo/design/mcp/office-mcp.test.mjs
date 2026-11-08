import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createWorkbenchMCP} from '../../server/mcp-server.mjs';
import {BROWSER_OPERATIONS, OFFICE_COMMAND_ARGUMENTS} from '../../mcp-browser-operations.js';
import {bridgeError, validateBridgeRequest, validateBridgeValue, validateRevisionSnapshot, checkedImage} from '../../mcp-browser-core.js';

const projectId = '1234567890abcdef1234567890abcdef', documentId = 'abcdef1234567890abcdef1234567890', unit = '教学楼';
const root = fileURLToPath(new URL('../../qa/portable-release/mcp/office-tools/', import.meta.url));
await mkdir(root, {recursive: true});
const parsed = result => JSON.parse(result.content.find(c => c.type === 'text').text);
const metadata = {projectId, documentId, unit, type: 'docx', fileRevision: 3, filename: '教学楼.docx'};
async function linked(t, handler) {
  const calls = [], artifacts = [];
  const service = {request: async (path, options) => {calls.push({path, options}); return handler(path, options);}, artifact: async (bytes, filename, mime) => {const saved = {bytes, filename, mime}; artifacts.push(saved); return {filename, bytes: bytes.length};}};
  const server = createWorkbenchMCP({client: service}), client = new Client({name: 'office-mcp-qa', version: '1.0'}), [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(b), client.connect(a)]); t.after(async () => {await client.close(); await server.close();});
  return {client, calls, artifacts};
}

test('Office 九项新工具保留旧接口，白名单包含所有当前 Word 编辑操作', async t => {
  const {client, calls} = await linked(t, () => {throw Error('catalogue must not access files');});
  const {tools} = await client.listTools();
  for (const name of ['office_generate', 'office_open', 'office_read', 'office_command', 'office_save', 'office_list', 'office_import', 'office_download', 'office_versions', 'expansion_generate', 'document_import', 'ppt_export', 'calculation_export']) assert.ok(tools.some(tool => tool.name === 'workbench_' + name));
  const command = tools.find(tool => tool.name === 'workbench_office_command');
  for (const name of ['format.bold', 'format.italic', 'format.underline', 'format.font', 'format.size', 'paragraph.left', 'paragraph.center', 'paragraph.justify', 'table.insert', 'table.addRow', 'table.deleteRow', 'image.insert', 'history.undo', 'history.redo', 'text.replace', 'cell.set', 'shape.text', 'shape.move']) assert.ok(command.inputSchema.properties.args.properties.name.enum.includes(name));
  for (const operation of BROWSER_OPERATIONS.filter(item => item.name.startsWith('office.'))) assert.equal(operation.requiresUnit, true);
  assert.equal(calls.length, 0);
});

test('Office 命令条件 schema 拒绝无目标、任意代码、错字段和缺双重修订', async t => {
  const {client, calls} = await linked(t, () => {throw Error('invalid input must not execute');});
  const common = {projectId, unit, expectedRevisions: {main: 5}};
  const command = (name, args) => ({name: 'workbench_office_command', arguments: {...common, args: {documentId, expectedRevision: 3, name, args}}});
  for (const request of [
    command('eval', {code: 'dangerous()'}), command('format.bold', {}), command('format.font', {targetText: '目标'}),
    command('format.size', {targetText: '目标', size: 97}), command('table.insert', {targetText: '目标', rows: 0, columns: 3}),
    command('text.replace', {expectedText: '原文', text: '新文', javascript: 'no'}), command('shape.move', {slide: 1, shapeId: '2', x: 1, y: 2}),
    command('image.insert', {targetText: '目标', data: 'data:image/png;base64,AAAA'}),
    {name: 'workbench_office_generate', arguments: {projectId, expectedRevisions: {main: 5}, args: {}}},
    {name: 'workbench_office_save', arguments: {...common, args: {documentId}}},
    {name: 'workbench_office_command', arguments: {projectId, unit, args: {documentId, expectedRevision: 3, name: 'history.undo', args: {}}}}
  ]) {
    const result = await client.callTool(request); assert.equal(result.isError, true); assert.equal(parsed(result).code, 'INVALID_ARGUMENTS');
  }
  assert.equal(calls.length, 0);
});

test('自然语言一组成果使用网页同一 generate 入口，保留项目单体及参数版本', async t => {
  const batch = {batchId: 'batch-1', projectId, unit, sourceParameterVersion: 7, documents: ['docx', 'pptx', 'xlsx'].map(type => ({type, batchId: 'batch-1', sourceParameterVersion: 7})), draft: true, engineeringApproval: false};
  const {client, calls} = await linked(t, () => ({result: {result: batch, context: {projectId, unit}}}));
  const result = parsed(await client.callTool({name: 'workbench_office_generate', arguments: {projectId, unit, expectedRevisions: {main: 5}, args: {}}}));
  assert.deepEqual(result.result, batch); assert.equal(calls[0].path, '/api/mcp-browser/execute');
  assert.equal(calls[0].options.body.operation, 'office.generate'); assert.equal(calls[0].options.body.unit, unit); assert.deepEqual(calls[0].options.body.expectedRevisions, {main: 5});
});

test('图片 MCP 只读取显式 PNG/JPEG 文件并转成编辑器数据，不暴露文件路径', async t => {
  const directory = await mkdtemp(join(root, '图片 ')), file = join(directory, '工程图.png'), bytes = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]); await writeFile(file, bytes);
  const {client, calls} = await linked(t, () => ({result: {result: {saved: true}, context: {projectId, unit}}}));
  const result = await client.callTool({name: 'workbench_office_command', arguments: {projectId, unit, expectedRevisions: {main: 5}, args: {documentId, expectedRevision: 3, name: 'image.insert', args: {targetText: '总平面图', filePath: file, alt: '总平面图'}}}});
  assert.equal(result.isError, undefined); const args = calls[0].options.body.args.args;
  assert.equal(args.data, 'data:image/png;base64,' + bytes.toString('base64')); assert.equal(args.targetText, '总平面图'); assert.ok(!Object.hasOwn(args, 'filePath'));
  const bad = join(directory, '伪图.png'); await writeFile(bad, '<svg>not a PNG</svg>');
  const rejected = await client.callTool({name: 'workbench_office_command', arguments: {projectId, unit, expectedRevisions: {main: 5}, args: {documentId, expectedRevision: 3, name: 'image.insert', args: {targetText: '总平面图', filePath: bad}}}});
  assert.equal(rejected.isError, true); assert.equal(calls.length, 1);
});

test('Office 原件导入仅允许现代格式，发送选定副本及真实项目参数版本', async t => {
  const directory = await mkdtemp(join(root, '导入 ')), file = join(directory, '结构说明.docx'), bytes = Buffer.from('synthetic transport fixture'); await writeFile(file, bytes);
  const {client, calls} = await linked(t, path => path.endsWith('/main') ? {record: {data: {parameterVersion: 7}}} : {document: {...metadata, fileRevision: 1}});
  const result = parsed(await client.callTool({name: 'workbench_office_import', arguments: {projectId, unit, filePath: file}}));
  assert.equal(result.document.fileRevision, 1); assert.equal(calls[0].path, '/api/workbench-projects/' + projectId + '/main');
  assert.equal(calls[1].path, '/api/office-documents/' + projectId + '?type=docx'); assert.equal(calls[1].options.header, 'office-documents');
  assert.equal(decodeURIComponent(calls[1].options.headers['x-document-unit']), unit); assert.equal(calls[1].options.headers['x-parameter-version'], '7');
  assert.deepEqual(calls[1].options.body, bytes); assert.deepEqual(await readFile(file), bytes);
  const old = join(directory, '旧版.doc'); await writeFile(old, 'old-format fixture');
  const rejected = await client.callTool({name: 'workbench_office_import', arguments: {projectId, unit, filePath: old}});
  assert.equal(rejected.isError, true); assert.equal(calls.length, 2);
});

test('Office 列表按单体筛选，下载锁定读取版本，历史查询不修改文件', async t => {
  const bytes = Buffer.from('saved exact revision');
  const {client, calls, artifacts} = await linked(t, path => path.includes('/content?') ? {bytes, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'} : path.endsWith('/history') ? {versions: [metadata]} : path.includes(documentId) ? {document: metadata} : {documents: [metadata]});
  await client.callTool({name: 'workbench_office_list', arguments: {projectId, unit}});
  assert.equal(new URL(calls[0].path, 'http://localhost').searchParams.get('unit'), unit);
  const downloaded = parsed(await client.callTool({name: 'workbench_office_download', arguments: {projectId, documentId, revision: 3}}));
  assert.equal(calls[1].path, '/api/office-documents/' + projectId + '/' + documentId + '?revision=3');
  assert.equal(calls[2].path, '/api/office-documents/' + projectId + '/' + documentId + '/content?revision=3');
  assert.deepEqual(artifacts[0].bytes, bytes); assert.equal(downloaded.document.fileRevision, 3); assert.equal(downloaded.engineeringApproval, false);
  const versions = parsed(await client.callTool({name: 'workbench_office_versions', arguments: {projectId, documentId}}));
  assert.equal(versions.versions.length, 1); assert.equal(calls[3].path, '/api/office-documents/' + projectId + '/' + documentId + '/history');
});

const source = await readFile(new URL('../../mcp-browser-bridge.js', import.meta.url), 'utf8');
const implementation = source.slice(source.indexOf('async function officeDocument('), source.indexOf('async function tick('));
function adapter({record = {...metadata}, office = {}, dirty = false} = {}) {
  const calls = [], saved = {...record};
  const current = () => ({document: {...saved}, dirty: false, text: '当前文档'});
  const service = {read: async id => {calls.push(['read', id]); return current();}, command: async (id, command) => {calls.push(['command', id, command]); saved.fileRevision++; return {result: {modified: 1}};}, save: async () => {calls.push(['save']); saved.fileRevision++;}, open: async id => {calls.push(['open', id]); return current();}, generate: async () => {calls.push(['generate']); return {documents: [], sourceParameterVersion: 7};}, ...office};
  const scope = {window: {WorkbenchOffice: service}, W: {id: projectId, mcp: {run: fn => fn()}, flush: async () => {}}, E: {unit, mcp: {part: 'expansion-test'}}, M: {},
    fetch: async () => ({ok: true, json: async () => ({document: {...saved}})}),
    bridgeError, validateBridgeRequest, validateBridgeValue, validateRevisionSnapshot, checkedImage, OFFICE_COMMAND_ARGUMENTS,
    revisions: async () => ({main: 5}), localRevisions: () => ({main: 5}), dirty: () => dirty, context: async () => ({projectId, unit})};
  vm.runInNewContext(implementation, scope); return {execute: scope.executeTask, calls, saved};
}
const commandTask = (name, args) => ({operation: 'office.command', projectId, unit, expectedRevisions: {main: 5}, args: {documentId, expectedRevision: 3, name, args}});

test('真实桥接拒绝错误项目/单体/文件修订/命令类型，且不调用编辑器', async () => {
  for (const settings of [{record: {...metadata, projectId: 'f'.repeat(32)}}, {record: {...metadata, unit: '另一栋楼'}}, {record: {...metadata, fileRevision: 4}}, {record: {...metadata, type: 'xlsx'}}]) {
    const a = adapter(settings); await assert.rejects(a.execute(commandTask('text.replace', {expectedText: '旧稿', text: '新稿'}))); assert.equal(a.calls.length, 0);
  }
  const a = adapter(); await assert.rejects(a.execute({...commandTask('history.undo', {}), expectedRevisions: {main: 4}}), e => e.code === 'REVISION_CONFLICT'); assert.equal(a.calls.length, 0);
  await assert.rejects(a.execute({...commandTask('history.undo', {}), unit: undefined}), e => e.code === 'UNIT_REQUIRED'); assert.equal(a.calls.length, 0);
});

test('真实桥接二次验证命令字段，并返回保存后的实际文件修订', async () => {
  const a = adapter();
  await assert.rejects(a.execute(commandTask('format.bold', {}))); assert.equal(a.calls.length, 0);
  await assert.rejects(a.execute(commandTask('table.insert', {targetText: ' ', rows: 3, columns: 3}))); assert.equal(a.calls.length, 0);
  const result = await a.execute(commandTask('format.bold', {targetText: '工程概况'}));
  assert.equal(a.calls[0][0], 'command'); assert.equal(a.calls[0][2].args.targetText, '工程概况');
  assert.equal(result.result.document.fileRevision, 4); assert.equal(result.result.engineeringApproval, false);
});

test('office.save 同时校验文件修订并走页面保存路径，office.read不主动flush', async () => {
  const a = adapter(); const saved = await a.execute({operation: 'office.save', projectId, unit, expectedRevisions: {main: 5}, args: {documentId, expectedRevision: 3}});
  assert.equal(saved.result.document.fileRevision, 4); assert.deepEqual(a.calls.map(c => c[0]), ['read', 'save', 'read']);
  const b = adapter({dirty: true}); const read = await b.execute({operation: 'office.read', projectId, unit, args: {documentId}});
  assert.equal(read.result.document.fileRevision, 3); assert.deepEqual(b.calls.map(c => c[0]), ['read']);
});

test('Office MCP读文档保留形状位置及图片存在信息，不向模型发送网页图片Base64',async()=>{
  const view={slides:[{shapes:[{id:'3',x:4,y:8,text:'标题',imageDataUrl:'data:image/png;base64,KEEP_IN_BROWSER'}]}]};
  const a=adapter({record:{...metadata,type:'pptx'},office:{read:async()=>({document:{...metadata,type:'pptx'},view})}});
  const result=await a.execute({operation:'office.read',projectId,unit,args:{documentId}});
  const shape=result.result.view.slides[0].shapes[0];assert.equal(shape.hasImage,true);assert.equal(shape.x,4);assert.equal(shape.text,'标题');assert.ok(!Object.hasOwn(shape,'imageDataUrl'));
  assert.match(view.slides[0].shapes[0].imageDataUrl,/KEEP_IN_BROWSER/,'sanitization must not remove the actual UI preview');
});
