import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const qa = process.argv[2];
const target = JSON.parse(await readFile(join(qa, 'compiled-test-server.json'), 'utf8'));
const {chromium} = await import(pathToFileURL('C:/Users/mj528/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const browser = await chromium.launch({executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true});
try {
  const page = await browser.newPage({viewport: {width: 1600, height: 1200}});
  await page.goto(target.url + '/workbuddy-integrated-studio.html?project=' + target.projectId);
  await page.waitForFunction(() => window.WorkbenchProjects && !WorkbenchProjects.loading);
  await page.locator('#tab11').click();
  await page.waitForFunction(() => document.getElementById('im-ppt-frame')?.contentWindow?.WorkbenchPpt?.mcp?.ready);
  const frame = page.frames().find(item => item.url().includes('06-ppt-report/prototype'));
  await frame.locator('#unit-name').selectOption('项目整体');
  await frame.locator('[data-page="15"]').click();
  await frame.locator('.caf-image img').waitFor();
  await frame.evaluate(() => {
    for (let element = document.getElementById('slide-canvas'); element; element = element.parentElement) element.scrollTop = 0;
    window.scrollTo(0, 0);
  });
  await frame.locator('#slide-canvas').screenshot({path: join(qa, 'compiled-page16-slide.png')});
  await page.screenshot({path: join(qa, 'compiled-page16.png'), fullPage: true});
} finally { await browser.close(); }
