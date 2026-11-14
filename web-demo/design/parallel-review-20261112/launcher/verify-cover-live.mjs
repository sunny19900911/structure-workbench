import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const planPath = process.argv[2];
const qa = dirname(planPath);
const plan = JSON.parse(await readFile(planPath, 'utf8'));
const base = 'http://127.0.0.1:58727';
const hash = raw => createHash('sha256').update(raw).digest('hex');
const health = await (await fetch(base + '/api/portable/health')).json();
const report = {health, files: [], preservedPptFiles: [], projectRevisions: {}};
for (const item of new Map(plan.changes.map(item => [item.target, item])).values()) {
  assert.equal(hash(await readFile(join(plan.app, item.target))), item.after);
  report.files.push(item.target);
}
const oldMarker = JSON.parse(await readFile(join(qa, 'original-app-backup/dist/frontend-update.json'), 'utf8'));
for (const [file, expected] of Object.entries(oldMarker.sourceHashes).filter(([file]) => /ppt|cafeteria|single-image-layout/.test(file))) {
  assert.equal(hash(await readFile(join(plan.app, file))), expected);
  report.preservedPptFiles.push(file);
}
const template = await fetch(base + '/api/calculation-book/template/cover?project=88b5e1bfa98a446f92849ab358d4898d');
assert.ok(template.ok);
report.templateSha256 = hash(Buffer.from(await template.arrayBuffer()));
assert.equal(report.templateSha256, plan.freeze.templateSha256);
for (const id of ['88b5e1bfa98a446f92849ab358d4898d', '2a1ccf080c3e4b5f9d795e4e7b357b82']) {
  const {record} = await (await fetch(base + '/api/workbench-projects/' + id + '/main')).json();
  report.projectRevisions[id] = record.revision;
}
const client = new Client({name: 'cover-reload-readonly-check', version: '1'});
try {
  await client.connect(new StdioClientTransport({command: join(plan.app, '../runtime/node/node.exe'), args: [join(plan.app, 'server/mcp-server.mjs')],
    env: {...process.env, WORKBENCH_PORTABLE_DATA: health.dataRoot, WORKBENCH_MCP_URL: base}, stderr: 'pipe'}));
  report.mcpToolCount = (await client.listTools()).tools.length;
  assert.equal(report.mcpToolCount, 70);
  const status = await client.callTool({name: 'workbench_status', arguments: {}});
  assert.ok(!status.isError);
  report.mcpStatus = JSON.parse(status.content.find(item => item.type === 'text').text);
} finally {
  await client.close();
}
report.pass = true;
await writeFile(join(qa, 'live-cover-verification.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({pass: true, pid: health.pid, files: report.files.length, preservedPptFiles: report.preservedPptFiles.length, toolCount: report.mcpToolCount, revisions: report.projectRevisions}));
