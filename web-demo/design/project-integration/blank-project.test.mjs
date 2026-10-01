import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createState,scaffold} from '../../expansion-core.js';

const html=await readFile(new URL('../../workbuddy-integrated-studio.html',import.meta.url),'utf8');
const example=JSON.parse(await readFile(new URL('../../data/example-project.json',import.meta.url),'utf8'));
const section=id=>html.split(`<section id="${id}"`)[1].split('</section>')[0];
const defaults=name=>JSON.parse(html.match(new RegExp(`^const ${name} = (.+);$`,'m'))[1]);
const historical=/云南旅游|龙泉路|万彩城|25-AD-037|57919\.26|16010\.084|C50 起|归并系数均为 1\.01|保护层厚度.*增加 5mm/;

test('未运行脚本时，措施和扩初初始正文也不包含历史项目断言',()=>{
  assert.doesNotMatch(section('stage1'),historical);
  assert.doesNotMatch(section('stage2'),historical);
  assert.match(section('stage1'),/Q355B/);
  assert.match(section('stage1'),/楼面均布活荷载/);
  assert.doesNotMatch(section('stage1'),/data-empty-section=/);
  assert.match(section('stage1'),/data-p="project_name"/);
  assert.match(section('stage2'),/本项目正文尚未编写/);
});

test('项目参数和导入数据没有示例默认值，包括未显示的派生值',()=>{
  for(const [key,value] of Object.entries(defaults('DEF')))
    assert.equal(value,key==='discipline'?'结构':'',key);
  assert.deepEqual(defaults('DATA_DEF'),{});
  assert.deepEqual(defaults('DATA_TABLES'),{});
  const controls=[...html.matchAll(/<input\b[^>]*data-k="([^"]+)"[^>]*>/g)];
  assert.ok(controls.length>20);
  for(const [tag,key] of controls)assert.equal(tag.match(/value="([^"]*)"/)[1],key==='discipline'?'结构':'',key);
});

test('历史示例独立保留，但新扩初状态与无资料骨架不消费示例',()=>{
  assert.match(example.paper,/云南旅游/);
  assert.match(example.expansionPaper,/龙泉路/);
  assert.ok(example.dataTables.bldg_units.rows.length>1);
  assert.ok(example.source_id);
  const state=createState({projectName:'空白工程',projectCode:'',unit:'项目整体'});
  assert.deepEqual(state.sections,{});
  assert.deepEqual(state.facts,[]);
  assert.deepEqual(state.sources,[]);
  assert.equal(state.model,null);
  const generated=scaffold(state,'overview');
  assert.doesNotMatch(JSON.stringify(generated),historical);
});
