import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const qa = process.argv[2];
const publication = JSON.parse(await readFile(join(qa, 'publication.json'), 'utf8'));
const app = join(process.cwd(), 'outputs/portable/结构工作台-网页修复-20261111-220948/app');
const base = 'http://127.0.0.1:58727';
const projectId = '88b5e1bfa98a446f92849ab358d4898d';
const endpoint = base + '/api/workbench-projects/' + projectId + '/main';
const before = await (await fetch(endpoint)).text();
const previous = JSON.parse(await readFile('qa/portable-release/calculation-single-column-20261113/export-payload.json', 'utf8'));
const payload = {...previous, project_id: projectId, project_name: 'QA单栏验证_非工程成果', project_code: 'QA-SINGLE-COLUMN',
  unit: 'QA合成单体', company: '', software: 'QA合成软件', software_version: 'QA-2026.11', confirmed: true,
  out_files: ['WMASS.OUT', 'WDISP.OUT', 'WZQ.OUT'].map(name => ({name, content_base64: Buffer.from(name + '\nQA_SINGLE_COLUMN_LIVE\n合成内容验证。\n').toString('base64')}))};
const response = await fetch(base + '/api/calculation-book/export', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
assert.ok(response.ok, await response.clone().text());
const output = join(qa, process.argv[3] ? 'live-QA-original-left-cover.docx' : 'live-QA-single-column.docx');
await writeFile(output, Buffer.from(await response.arrayBuffer()));
const python = `from docx import Document
from docx.oxml.ns import qn
import json,sys
d=Document(sys.argv[1])
cols=d.element.xpath('.//w:sectPr/w:cols')
assert len(cols)==3
assert all(dict(c.attrib)=={qn('w:num'):'1'} and len(c)==0 for c in cols)
assert not d.element.xpath('.//w:cols/w:col')
assert not d.element.xpath('.//w:br[@w:type="column"]')
assert len(d.tables)>=5
assert all(t._tbl.tblPr.find(qn('w:jc')).get(qn('w:val'))=='center' for t in d.tables[:5])
assert d.tables[3].cell(0,1).paragraphs[1].text=='QA-2026.11'
assert not any('{{' in (t.text or '') or '}}' in (t.text or '') for t in d.element.iter() if t.tag==qn('w:t'))
assert all(name in '\\n'.join(p.text for p in d.paragraphs) for name in ('WMASS.OUT','WDISP.OUT','WZQ.OUT'))
print(json.dumps({'sections':len(cols),'columnCounts':[c.get(qn('w:num')) for c in cols],'childColumns':0,'columnBreaks':0,'coverTablesCentered':True,'placeholderFree':True}))
`;
const nativeArguments = process.argv[3] ? [process.argv[3], output] : ['-c', python, output];
const native = JSON.parse(execFileSync(join(app, '../runtime/python/python.exe'), nativeArguments, {encoding: 'utf8', windowsHide: true}));
const template = await fetch(base + '/api/calculation-book/template/cover?project=' + projectId);
assert.ok(template.ok);
const templateSha256 = createHash('sha256').update(Buffer.from(await template.arrayBuffer())).digest('hex');
assert.equal(templateSha256, createHash('sha256').update(await readFile(join(app, 'assets/calculation-book/cover-reference.docx'))).digest('hex'));
const health = await (await fetch(base + '/api/portable/health')).json();
assert.deepEqual(health, publication.health);
assert.equal(await (await fetch(endpoint)).text(), before);
const html = await (await fetch(base + '/workbuddy-integrated-studio.html')).text();
assert.ok(!html.includes('A3横向双栏快照'));
assert.ok(html.includes('目录可增删，查看计算书内容，人工确认后导出 Word。'));
const result = {pass: true, output, native, templateSha256, projectMainUnchanged: true,
  catalogItems: payload.sections.reduce((count, section) => count + section.items.length, 0), health, marker: publication.marker};
await writeFile(join(qa, 'live-verification.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
