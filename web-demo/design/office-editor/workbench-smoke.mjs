// Real browser + native files, with all non-loopback requests blocked.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {homedir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile),root=fileURLToPath(new URL('../../',import.meta.url));
const base=process.argv[2]||'http://127.0.0.1:58842';
assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/);
const health=await(await fetch(base+'/api/portable/health')).json();
assert.ok(resolve(health.dataRoot).replaceAll('\\','/').startsWith(resolve(root,'qa/portable-release/mcp').replaceAll('\\','/')+'/'),'Refusing non-QA store');
const output=join(health.dataRoot,'office-e2e-'+Date.now());await mkdir(output,{recursive:true});
const runtime=join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies');
const python=process.env.WORKBENCH_PYTHON||join(runtime,'python/python.exe');
const playwright=process.env.WORKBENCH_PLAYWRIGHT_ENTRY||join(runtime,'node/node_modules/playwright/index.mjs');
const fixture=resolve(root,'qa/portable-release/mcp/最终验收 1108/acceptance/建筑测试.docx');
const fixtureBase64=(await readFile(fixture)).toString('base64');
const {chromium}=await import(pathToFileURL(playwright).href);
const browser=await chromium.launch({headless:true,channel:'msedge'});
const context=await browser.newContext({viewport:{width:1600,height:1100}});
const page=await context.newPage();page.setDefaultTimeout(120000);
const errors=[],blocked=[],checks=[];let projectId,batch;
page.on('pageerror',error=>errors.push(error.message));
await context.route('**/*',route=>{
  const url=route.request().url();if(/^(blob:|data:)/.test(url)||new URL(url).hostname==='127.0.0.1')return route.continue();
  blocked.push(url);return route.abort();
});
async function check(name,action){
  const details=await action();checks.push({name,passed:true,details});console.log('PASS '+name);
  await writeFile(join(output,'results.json'),JSON.stringify({projectId,batch,checks,errors,blocked},null,2));return details;
}
async function open(documentId){return page.evaluate(id=>window.WorkbenchOffice.open(id),documentId);}
async function command(documentId,name,args,expectedRevision){return page.evaluate(({documentId,name,args,expectedRevision})=>window.WorkbenchOffice.command(documentId,{name,args,expectedRevision}),{documentId,name,args,expectedRevision});}
try{
  await page.goto(base+'/workbuddy-integrated-studio.html');
  await page.waitForFunction(()=>window.WorkbenchOffice&&window.WorkbenchProjects?.id&&!window.WorkbenchProjects.loading&&window.WorkbenchModules?.mcp);
  await check('create isolated project through existing workbench command',async()=>{
    const result=await page.evaluate(()=>window.WorkbenchProjects.mcp.create('办公平台三类成果验收'));
    projectId=result.projectId;assert.match(projectId,/^[a-f0-9]{32}$/);return result;
  });
  await check('import real architecture DOCX and compose expansion from current unit',async()=>{
    const value=await page.evaluate(async data=>{
      const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));await window.WorkbenchIntake.readFiles('bldg',[new File([bytes],'办公验收建筑资料.docx')]);
      if(!window.WorkbenchIntake.units.includes('测试教学楼'))throw Error('建筑单体未读出');
      await window.ExpansionWorkbench.selectUnit('测试教学楼');await window.ExpansionWorkbench.mcp.generate();
      const before=window.ExpansionWorkbench.mcp.read(),section=before.sections.overview;
      await window.ExpansionWorkbench.mcp.edit({sectionId:'overview',expectedText:section.text,text:section.text+'\n办公平台文字验收唯一标记。'});
      await window.WorkbenchProjects.flush();return {unit:window.ExpansionWorkbench.unit,version:window.WorkbenchProjects.parameterVersion};
    },fixtureBase64);assert.equal(value.unit,'测试教学楼');return value;
  });
  batch=await check('generate native Word PPT Excel from one parameter version and batch',async()=>{
    const result=await page.evaluate(()=>window.WorkbenchOffice.generate());
    assert.equal(result.documents.length,3);assert.deepEqual(result.documents.map(d=>d.type).sort(),['docx','pptx','xlsx']);
    assert.equal(new Set(result.documents.map(d=>d.batchId)).size,1);assert.equal(typeof result.sourceParameterVersion,'number');
    for(const document of result.documents)assert.equal(document.sourceParameterVersion,result.sourceParameterVersion);
    await page.evaluate(()=>window.WorkbenchOffice.show());return result;
  });
  const word=batch.documents.find(d=>d.type==='docx'),excel=batch.documents.find(d=>d.type==='xlsx'),ppt=batch.documents.find(d=>d.type==='pptx');
  const wordMarker='办公平台 Word 原生修改已保存';
  await check('Word open edit save close reopen preserves changed native content',async()=>{
    const before=await open(word.documentId);assert.ok(before.text.includes('办公平台文字验收唯一标记'));
    const changed=await command(word.documentId,'text.replace',{expectedText:'办公平台文字验收唯一标记',text:wordMarker},before.document.fileRevision);
    assert.ok(changed.text.includes(wordMarker));assert.equal(changed.dirty,false);
    const reopened=await open(word.documentId);assert.ok(reopened.text.includes(wordMarker));assert.equal(reopened.document.fileRevision,2);
    await page.screenshot({path:join(output,'Word实际编辑.png')});return {revision:reopened.document.fileRevision};
  });
  let excelTarget;
  const excelMarker='办公平台 Excel 原生修改已保存';
  await check('Excel edit native cell then reopen same document',async()=>{
    const before=await open(excel.documentId);const sheet=before.view.sheets.find(s=>s.name==='项目参数');assert.ok(sheet);
    const target=sheet.cells.find(c=>c.address==='B3');assert.ok(target);excelTarget={sheet:sheet.name,address:target.address};
    const changed=await command(excel.documentId,'cell.set',{...excelTarget,expectedText:target.text,text:excelMarker},before.document.fileRevision);
    assert.equal(changed.document.fileRevision,2);
    const reopened=await open(excel.documentId);assert.equal(reopened.view.sheets.find(s=>s.name===excelTarget.sheet).cells.find(c=>c.address===excelTarget.address).text,excelMarker);
    await page.screenshot({path:join(output,'Excel实际编辑.png')});return {revision:reopened.document.fileRevision,...excelTarget};
  });
  let pptTarget;
  const pptMarker='办公平台 PPT 原生修改已保存';
  await check('PPT edit native shape then reopen same document',async()=>{
    const before=await open(ppt.documentId);let selected;
    for(const slide of before.view.slides){const shape=slide.shapes.find(s=>s.editable&&s.text&&s.text.length>4&&!s.text.includes('\n'));if(shape){selected={slide,shape};break;}}
    assert.ok(selected);pptTarget={slide:selected.slide.number,shapeId:selected.shape.id};
    const changed=await command(ppt.documentId,'shape.text',{...pptTarget,expectedText:selected.shape.text,text:pptMarker},before.document.fileRevision);
    assert.equal(changed.document.fileRevision,2);
    const reopened=await open(ppt.documentId);assert.equal(reopened.view.slides.find(s=>s.number===pptTarget.slide).shapes.find(s=>s.id===pptTarget.shapeId).text,pptMarker);
    await page.screenshot({path:join(output,'PPT实际编辑.png')});return {revision:reopened.document.fileRevision,...pptTarget};
  });
  await check('download actual files and reopen with native Office format parsers',async()=>{
    const files={};for(const document of batch.documents){const response=await fetch(`${base}/api/office-documents/${projectId}/${document.documentId}/content`);assert.equal(response.status,200);const path=join(output,'已编辑成果.'+document.type);await writeFile(path,Buffer.from(await response.arrayBuffer()));files[document.type]=path;}
    const script=`import json,sys,zipfile\nfrom pathlib import Path\nfrom lxml import etree\nfrom openpyxl import load_workbook\nfrom pptx import Presentation\nspec=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))\nwith zipfile.ZipFile(spec['files']['docx']) as z:\n assert z.testzip() is None\n root=etree.fromstring(z.read('word/document.xml'))\n assert spec['wordMarker'] in ''.join(root.itertext())\n ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}\n sections=root.findall('.//w:sectPr',ns)\n assert any(s.find('w:cols',ns) is not None and s.find('w:cols',ns).get('{'+ns['w']+'}num')=='2' for s in sections), 'double column missing'\n assert any(s.find('w:pgSz',ns) is not None and int(s.find('w:pgSz',ns).get('{'+ns['w']+'}w'))>int(s.find('w:pgSz',ns).get('{'+ns['w']+'}h')) for s in sections),'landscape missing'\nwb=load_workbook(spec['files']['xlsx']);assert wb[spec['excelTarget']['sheet']][spec['excelTarget']['address']].value==spec['excelMarker']\nppt=Presentation(spec['files']['pptx']);slide=ppt.slides[spec['pptTarget']['slide']-1];shape=next(s for s in slide.shapes if str(s.shape_id)==spec['pptTarget']['shapeId']);assert shape.text==spec['pptMarker']\nprint(json.dumps({'docx':'reopened, landscape and 2 columns retained','xlsx':'cell preserved','pptx':'shape text preserved','slides':len(ppt.slides)},ensure_ascii=True))\n`;
    await writeFile(join(output,'verify.py'),script);await writeFile(join(output,'artifacts.json'),JSON.stringify({files,wordMarker,excelMarker,pptMarker,excelTarget,pptTarget},null,2));
    const result=await run(python,[join(output,'verify.py'),join(output,'artifacts.json')],{windowsHide:true,env:{...process.env,PYTHONUTF8:'1'}});return JSON.parse(result.stdout);
  });
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:checks.length,output,projectId,batchId:batch.batchId}));
}catch(error){await page.screenshot({path:join(output,'failure.png')}).catch(()=>{});await writeFile(join(output,'failure.txt'),error.stack||String(error));await writeFile(join(output,'results.json'),JSON.stringify({projectId,batch,checks,errors,blocked},null,2));console.error('OUTPUT '+output);throw error;}
finally{await browser.close();}
