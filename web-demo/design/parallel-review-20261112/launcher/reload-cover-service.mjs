import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {open, readFile, writeFile, readdir} from 'node:fs/promises';
import {dirname, join, relative} from 'node:path';
import {createHash} from 'node:crypto';

const planPath = process.argv[2];
const qa = dirname(planPath);
const plan = JSON.parse(await readFile(planPath, 'utf8'));
const base = 'http://127.0.0.1:58727';
const original = await (await fetch(base + '/api/portable/health')).json();
assert.equal(original.pid, 61404);
assert.equal(original.instanceId, '74763222-f16e-4dcd-bd7a-009018372f93');
const expectedData = join(process.cwd(), 'qa/portable-release/launcher-20261111/ui-update-20261111-220948/已保存数据副本');
assert.equal(original.dataRoot, expectedData);
const executable = join(plan.app, '../runtime/node/node.exe');
const start = join(plan.app, 'deploy/portable/start.mjs');
const inspection = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-Command',
  "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); Get-CimInstance Win32_Process -Filter 'ProcessId = 61404' | Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress"], {encoding: 'utf8', windowsHide: true}));
assert.equal(inspection.ExecutablePath.toLowerCase(), join(plan.app, '../runtime/node/node.exe').toLowerCase());
assert.ok(inspection.CommandLine.includes(start));
assert.ok(inspection.CommandLine.endsWith('--port 58727'));

async function projectHashes(folder, root = folder, hashes = {}) {
  for (const entry of await readdir(folder, {withFileTypes: true})) {
    const file = join(folder, entry.name);
    if (entry.isDirectory()) await projectHashes(file, root, hashes);
    else if (entry.isFile()) hashes[relative(root, file)] = createHash('sha256').update(await readFile(file)).digest('hex');
  }
  return hashes;
}
const beforeProjects = await projectHashes(join(expectedData, 'projects'));
await writeFile(join(qa, 'before-project-hashes.json'), JSON.stringify(beforeProjects, null, 2));
let state;
for (let attempt = 0; attempt < 3; attempt++) {
  state = await (await fetch(base + '/api/launcher/status')).json();
  assert.equal(state.instanceId, original.instanceId);
  assert.equal(state.browser.tasks.length, 0, 'Wait for in-flight MCP tasks');
  assert.ok(state.browser.clients.every(client => !client.busy), 'Wait for busy pages');
  assert.ok(state.clients.every(client => !client.busy), 'Wait for import/export');
  const children = execFileSync('powershell.exe', ['-NoProfile', '-Command',
    "@(Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq 61404 }).Count"], {encoding: 'utf8', windowsHide: true}).trim();
  assert.equal(children, '0', 'Wait for child-process exports/imports');
  await new Promise(resolve => setTimeout(resolve, 500));
}
await writeFile(join(qa, 'before-reload.json'), JSON.stringify({health: original, process: inspection, status: state}, null, 2));
const publisher = join(process.cwd(), 'design/parallel-review-20261111/launcher/static-ppt-update.py');
execFileSync(join(plan.app, '../runtime/python/python.exe'), [publisher, '--apply', planPath], {cwd: process.cwd(), windowsHide: true, stdio: 'pipe'});
process.kill(original.pid);
for (let attempt = 0; attempt < 100; attempt++) {
  let listening = false;
  try { listening = (await fetch(base + '/api/portable/health', {signal: AbortSignal.timeout(300)})).ok; } catch {}
  if (!listening) break;
  if (attempt === 99) throw Error('Old service did not stop');
  await new Promise(resolve => setTimeout(resolve, 100));
}
const log = await open(join(qa, 'reloaded-service.log'), 'a');
const child = spawn(executable, [start, '--port', '58727'], {cwd: dirname(plan.app),
  env: {...process.env, WORKBENCH_PORTABLE_DATA: expectedData, WORKBENCH_SOURCE_MODE: '0'},
  windowsHide: true, detached: true, stdio: ['ignore', log.fd, log.fd]});
child.unref();
await log.close();
let health;
for (let attempt = 0; attempt < 200; attempt++) {
  try { health = await (await fetch(base + '/api/portable/health', {signal: AbortSignal.timeout(500)})).json(); } catch {}
  if (health?.pid === child.pid) break;
  await new Promise(resolve => setTimeout(resolve, 200));
}
assert.equal(health?.pid, child.pid, 'Restarted on the same port');
assert.equal(health.dataRoot, original.dataRoot);
assert.notEqual(health.instanceId, original.instanceId);
const afterProjects = await projectHashes(join(expectedData, 'projects'));
assert.deepEqual(afterProjects, beforeProjects, 'Saved projects preserved byte-for-byte');
const result = {before: original, after: health, projectFiles: Object.keys(beforeProjects).length, projectsUnchanged: true, plan: planPath};
await writeFile(join(qa, 'reload-verification.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
