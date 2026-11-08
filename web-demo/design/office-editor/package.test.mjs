import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import PptxGenJS from 'pptxgenjs';
import {inspectOfficePackage,editOfficePackage,generateWorkbook} from '../../server/office-package.mjs';
const run=promisify(execFile), python=process.env.WORKBENCH_PYTHON||join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
const env={...process.env,WORKBENCH_PYTHON:python};
const dir=resolve('qa/portable-release/mcp/office/package-'+Date.now());

test('Excel command uses actual native workbook and round-trips through openpyxl',async()=>{
  await mkdir(dir,{recursive:true});
  const bytes=await generateWorkbook({title:'同源工程参数',parameters:[{name:'地点',value:'云南昆明'},{name:'建筑高度',value:'23.7'}],tables:[{name:'人工单体表',rows:[['名称','说明'],['教学楼','人工保留']]}]},env);
  const view=await inspectOfficePackage(bytes,'xlsx',env);
  assert.equal(view.sheets[0].cells.find(c=>c.address==='B4').text,'23.7');
  const after=await editOfficePackage(bytes,'xlsx',{op:'cell.set',sheet:'人工单体表',address:'B2',expectedText:'人工保留',text:'原生编辑后保留'},env);
  const path=join(dir,'结构参数.xlsx');await writeFile(path,after);
  const result=await run(python,['-c','from openpyxl import load_workbook; import sys; w=load_workbook(sys.argv[1]); print(w["人工单体表"]["B2"].value)',path],{encoding:'utf8',env:{...process.env,PYTHONIOENCODING:'utf-8'}});
  assert.equal(result.stdout.trim(),'原生编辑后保留');
  await assert.rejects(()=>editOfficePackage(after,'xlsx',{op:'cell.set',sheet:'人工单体表',address:'B2',expectedText:'人工保留',text:'stale'},env),e=>e.status===409&&e.code==='CONFLICT');
});

test('Generated native PPTX can be edited, moved and reopened by python-pptx',async()=>{
  await mkdir(dir,{recursive:true});
  const pptx=new PptxGenJS();pptx.layout='LAYOUT_WIDE';
  const slide=pptx.addSlide();slide.background={color:'E6F2EB'};
  slide.addText('结构方案汇报',{x:1,y:1,w:5,h:0.7,fontFace:'微软雅黑',fontSize:24,bold:true,color:'123456'});
  slide.addText('单体高度 23.7m',{x:1,y:2,w:5,h:0.7,fontSize:18});
  const bytes=await pptx.write({outputType:'nodebuffer'});await writeFile(join(dir,'修改前.pptx'),bytes);
  const view=await inspectOfficePackage(bytes,'pptx',env);assert.equal(view.slides.length,1);
  const shape=view.slides[0].shapes.find(s=>s.text==='结构方案汇报');assert.ok(shape);assert.equal(shape.fontSize,24);
  let after=await editOfficePackage(bytes,'pptx',{op:'shape.text',slide:1,shapeId:shape.id,expectedText:shape.text,text:'结构方案修改稿'},env);
  after=await editOfficePackage(after,'pptx',{op:'shape.move',slide:1,shapeId:shape.id,expectedX:shape.x,expectedY:shape.y,x:shape.x+50000,y:shape.y+60000},env);
  const path=join(dir,'结构汇报.pptx');await writeFile(path,after);
  const result=await run(python,['-c','from pptx import Presentation; import sys,json; p=Presentation(sys.argv[1]); print(json.dumps([{"text":s.text,"x":s.left} for s in p.slides[0].shapes if s.has_text_frame],ensure_ascii=True))',path],{encoding:'utf8'});
  const shapes=JSON.parse(result.stdout);assert.equal(shapes[0].text,'结构方案修改稿');assert.equal(shapes[0].x,shape.x+50000);assert.equal(shapes[1].text,'单体高度 23.7m');
  const comparison=await run(python,['-c','import zipfile,sys,json; a=zipfile.ZipFile(sys.argv[1]); b=zipfile.ZipFile(sys.argv[2]); print(json.dumps([n for n in a.namelist() if a.read(n)!=b.read(n)]))',join(dir,'修改前.pptx'),path]);
  assert.deepEqual(JSON.parse(comparison.stdout),['ppt/slides/slide1.xml']);
});

test('Malformed packages and mismatched type fail without pretending Office support',async()=>{
  await assert.rejects(()=>inspectOfficePackage(Buffer.from('not-office'),'pptx',env),e=>e.status===422);
  const bytes=await generateWorkbook({parameters:[]},env);
  await assert.rejects(()=>inspectOfficePackage(bytes,'pptx',env),e=>e.code==='FORMAT_MISMATCH');
});
