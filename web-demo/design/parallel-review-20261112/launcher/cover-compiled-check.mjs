import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const planPath = process.argv[2];
const qa = dirname(planPath);
const target = JSON.parse(await readFile(join(qa, 'compiled-test-server.json'), 'utf8'));
const plan = JSON.parse(await readFile(planPath, 'utf8'));
const {chromium} = await import(pathToFileURL('C:/Users/mj528/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const endpoint = target.url + '/api/workbench-projects/' + target.projectId + '/main';
const {record: current} = await (await fetch(endpoint)).json();
const parameters = {...current.data.parameters, software: 'QA结构计算软件', software_version: '2026.11'};
const saved = await fetch(endpoint, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Workbench-Request': 'project-store'},
  body: JSON.stringify({expectedRevision: current.revision, data: {...current.data, parameters}})});
assert.ok(saved.ok, 'Isolated fixture saved');
const browser = await chromium.launch({executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true});
const report = {target, pageErrors: []};
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}, acceptDownloads: true});
  page.on('pageerror', error => report.pageErrors.push(error.message));
  page.on('request', request => {
    if (request.url().endsWith('/api/calculation-book/export')) report.payload = request.postDataJSON();
  });
  await page.goto(target.url + '/workbuddy-integrated-studio.html?project=' + target.projectId);
  await page.waitForFunction(() => window.WorkbenchProjects && !WorkbenchProjects.loading && window.CalculationBook?.mcp);
  await page.locator('#tab9').click();
  await page.locator('#calcbook-confirmed').check();
  const waiting = page.waitForEvent('download', {timeout: 180000});
  await page.locator('#calcbook-export').click();
  const download = await waiting;
  report.docx = join(qa, 'compiled-cover.docx');
  await download.saveAs(report.docx);
  assert.equal(report.payload.software, parameters.software);
  assert.equal(report.payload.software_version, parameters.software_version);
  const response = await fetch(target.url + '/api/calculation-book/template/cover?project=' + target.projectId);
  assert.ok(response.ok);
  report.templateSha256 = createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
  assert.equal(report.templateSha256, plan.freeze.templateSha256);
  await page.locator('#tab11').click();
  await page.waitForFunction(() => document.getElementById('im-ppt-frame')?.contentWindow?.WorkbenchPpt?.mcp?.ready);
  report.ppt = await page.evaluate(() => document.getElementById('im-ppt-frame').contentWindow.WorkbenchPpt.mcp.read());
  await page.screenshot({path: join(qa, 'compiled-cover-ppt.png'), fullPage: true});
  assert.deepEqual(report.pageErrors, []);
  report.pass = true;
} finally {
  await writeFile(join(qa, 'compiled-cover.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify({pass: report.pass, docx: report.docx, templateSha256: report.templateSha256, pptKeys: Object.keys(report.ppt || {})}));
