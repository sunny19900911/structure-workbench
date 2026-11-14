import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {execFileSync} from 'node:child_process';

const planPath = process.argv[2];
const qa = dirname(planPath);
const plan = JSON.parse(await readFile(planPath, 'utf8'));
const base = 'http://127.0.0.1:58727';
const projectId = '88b5e1bfa98a446f92849ab358d4898d';
const endpoint = base + '/api/workbench-projects/' + projectId + '/main';
const before = await (await fetch(endpoint)).text();
const payload = {project_id: projectId, project_name: 'QA软件转发验证_非工程成果', project_code: 'QA-COVER-LIVE',
  unit: 'QA合成单体', stage: 'QA', discipline: '结构', company: '', software: 'QA合成软件', software_version: 'QA-2026.11',
  confirmed: true, sections: [{title: 'QA合成目录', items: ['软件版本字段验收']}], out_files: [], excel_blocks: []};
const response = await fetch(base + '/api/calculation-book/export', {method: 'POST',
  headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
assert.ok(response.ok, await response.clone().text());
const output = join(qa, 'live-QA-cover.docx');
await writeFile(output, Buffer.from(await response.arrayBuffer()));
const python = `from docx import Document
import json,sys
d=Document(sys.argv[1])
p=d.tables[3].cell(0,1).paragraphs
assert p[0].text=='QA合成软件'
assert p[1].text=='QA-2026.11'
assert d.tables[1].cell(0,1).text=='QA软件转发验证_非工程成果'
assert not any('{{' in (t.text or '') or '}}' in (t.text or '') for t in d.element.iter() if t.tag.endswith('}t'))
print(json.dumps({'software':p[0].text,'version':p[1].text,'tables':len(d.tables),'placeholderFree':True},ensure_ascii=True))
`;
const native = JSON.parse(execFileSync(join(plan.app, '../runtime/python/python.exe'), ['-c', python, output], {encoding: 'utf8', windowsHide: true}));
assert.equal(await (await fetch(endpoint)).text(), before, 'Current project main unchanged');
const report = {payload, output, native, projectMainUnchanged: true, pass: true};
await writeFile(join(qa, 'live-export-verification.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
