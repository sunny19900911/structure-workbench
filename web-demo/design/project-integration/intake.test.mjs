import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {freshIntake,fragments,extractLocal,validateExtraction,mergeCandidates,adoptFact,conflicts,unitNames,expansionEvidence,combinedParameters,matchLocation} from '../../intake-core.js';
import {retrieveMethods,validateProposal,intakeApi} from '../../server/intake-api.mjs';

const source={source_id:'QA-BLDG',name:'验收建筑摘录',slot:'bldg',fragments:fragments({paras:['项目名称：验收项目','工程地点：江苏省无锡市江阴市','单体名称：A教学楼','建筑用途：教学楼','地上5层，地下1层，结构高度23.70m。','单体名称：B宿舍楼','建筑用途：宿舍','地上6层，地下0层，结构高度22.60m。']})};
test('长资料本地提取不套用AI的400项截断，保留末尾候选',()=>{
  const large={...source,fragments:fragments({paras:[...Array.from({length:1300},(_,i)=>'说明段落'+i),...Array.from({length:410},(_,i)=>'项目编号：QA-'+i)]})};
  const result=extractLocal(large);assert.equal(result.facts.length,410);assert.equal(result.facts.at(-1).value,'QA-409');
  assert.equal(result.facts.at(-1).locator,'提取段落 1710');
});
test('段落与表格按单体提取，保留原文定位；空项目没有事实',()=>{
  assert.deepEqual(freshIntake().facts,[]);
  const result=extractLocal(source);assert.equal(result.warnings.length,0);
  assert.equal(result.facts.find(f=>f.key==='floors_above'&&f.unit==='A教学楼').value,'5');
  assert.equal(result.facts.find(f=>f.key==='height_m'&&f.unit==='B宿舍楼').value,'22.60');
  const table={...source,fragments:fragments({tables:[[['单体名称','地上层数','地下层数'],['C楼','7','0']]]})};
  assert.equal(extractLocal(table).facts.find(f=>f.key==='floors_above').value,'7');
  assert.ok(result.facts.every(f=>f.source_id&&f.locator&&f.quote));
});
test('拦截伪造引用、错误单体与缺失字段；不把含水描述自动采用为抗浮水位',()=>{
  const valid={key:'floors_above',value:'5',unit:'A教学楼',fragment_id:'F5',quote:'地上5层'};
  const data=validateExtraction({facts:[valid,{...valid,value:'9'},{...valid,unit:'B宿舍楼'},{...valid,fragment_id:'未知'},null],warnings:'bad'},source);
  assert.equal(data.facts.length,1);assert.ok(data.warnings.length);
  const geo={...source,slot:'geo',fragments:fragments({paras:['地下水位埋深2.0m；建议抗浮水位待专项论证。']})};
  assert.ok(!extractLocal(geo).facts.some(f=>f.key==='water_depth'));
  const height={...source,fragments:fragments({paras:['单体名称：A楼','建筑高度：25m','结构高度：4000mm']})};
  const heights=extractLocal(height).facts;assert.ok(heights.some(f=>f.key==='height_arch_m'));assert.ok(!heights.some(f=>f.key==='height_m'));
});
test('不同值必须明确解决冲突，更正留痕；单体事实不串入其他单体',()=>{
  const s=freshIntake(),facts=extractLocal(source).facts;mergeCandidates(s,source,facts);
  for(const f of facts)adoptFact(s,f.id);
  assert.deepEqual(unitNames(s),['A教学楼','B宿舍楼']);
  assert.ok(expansionEvidence(s,'A教学楼').facts.every(f=>f.unit!=='B宿舍楼'));
  assert.ok(expansionEvidence(s,'项目整体').facts.every(f=>f.unit==='项目整体'));
  const first=s.facts.find(f=>f.key==='floors_above'&&f.unit==='A教学楼');
  const other={...first,id:'QA-CONFLICT',value:'8',status:'candidate'};s.facts.push(other);
  assert.equal(conflicts(s.facts).length,1);
  assert.throws(()=>adoptFact(s,other.id,{resolve:true}),/理由/);
  adoptFact(s,other.id,{resolve:true,reason:'当前建筑提资修订'});
  assert.equal(first.status,'rejected');assert.equal(other.status,'confirmed');assert.equal(s.history.at(-1).reason,'当前建筑提资修订');
});
test('公共参数手改后旧事实不再作为确认依据；不同单体体系不能继承旧抗震等级',()=>{
  const s=freshIntake();mergeCandidates(s,source,extractLocal(source).facts);for(const f of s.facts)adoptFact(s,f.id);
  assert.ok(!expansionEvidence(s,'A教学楼',{project_name:'已改名'}).facts.some(f=>f.key==='project_name'));
  s.facts.push({key:'struct_sys',value:'剪力墙',unit:'B宿舍楼',status:'confirmed'});
  const p=combinedParameters(s,'B宿舍楼',{struct_sys:'框架',g_frame:'三级',region:'本项目地点'});
  assert.equal(p.struct_sys,'剪力墙');assert.equal(p.g_frame,'');assert.equal(p.region,'本项目地点');
});
test('同名区县保留候选；完整地址消歧；未知地点不猜测',()=>{
  const locations={'甲省':{counties:[{n:'同名县',c:'甲市'}]},'乙省':{counties:[{n:'同名县',c:'乙市'}]}};
  assert.equal(matchLocation('同名县',locations).length,2);
  assert.equal(matchLocation('乙省乙市同名县',locations)[0].province,'乙省');
  assert.equal(matchLocation('未知地点',locations).length,0);
});
test('方案仅允许已有案例来源，阻止历史数值与计算通过断言',()=>{
  const k={cases:[{evidence:[{source_id:'CASE-A'}]}]},option={system:'混凝土框架',reasons:['与建筑空间需求进行比选'],checks:['核对适用高度及规则性'],source_ids:['CASE-A']};
  assert.equal(validateProposal({options:[option]},k).options.length,1);
  for(const patch of [{source_ids:['伪造']},{checks:['验算通过']},{system:'600mm柱框架'}])assert.throws(()=>validateProposal({options:[{...option,...patch}]},k));
});
const base=fileURLToPath(new URL('../../qa/project-integration/',import.meta.url));await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,'intake-fixture-'));
async function fixture(path,value){const file=join(root,path);await mkdir(dirname(file),{recursive:true});await writeFile(file,value,'utf8');}
await fixture('602-项目/wiki/扩初说明写作方法库/machine/case-matrix.json',JSON.stringify({cases:[{case_id:'CASE-A',use:'教学楼',system:'框架',floors_above:5,evidence:[{source_id:'CASE-A',locator:'工程概况'}]}]}));
await fixture('602-项目/wiki/扩初说明写作方法库/machine/expansion-design-rules.yaml','required_inputs:\n  building_unit:\n    - name\n    - floors_below\n    - structural_height_m\n');
await fixture('610-待处理/108-项目经验知识库/00-项目数据.json',JSON.stringify({cases:[]}));
test('检索不改变项目事实；无当前单体不推荐案例；零层是有效输入',async()=>{
  assert.equal((await retrieveMethods(root,{})).cases.length,0);
  const k=await retrieveMethods(root,{unit:{name:'A楼',use:'教学楼',floors_below:0}});
  assert.equal(k.cases[0].case_id,'CASE-A');assert.deepEqual(k.missing,['structural_height_m']);
});
async function call(plugin,path,data,headers={}){let handler;plugin.configureServer({middlewares:{use:(prefix,fn)=>handler=fn}});const req=Readable.from([Buffer.from(JSON.stringify(data))]);Object.assign(req,{url:path,method:'POST',headers:{host:'127.0.0.1:5191','x-workbench-request':'intake',...headers}});return new Promise((resolve,reject)=>handler(req,{writeHead(status){this.status=status;},end(text){resolve({status:this.status,data:JSON.parse(text)})}}).catch(reject));}
test('AI接口走受控结构化提取、校验返回；缺配置和跨来源请求可恢复',async()=>{
  const payload={facts:[{key:'floors_above',value:'5',unit:'A教学楼',fragment_id:'F5',quote:'地上5层'},{key:'floors_above',value:'99',unit:'A教学楼',fragment_id:'F5',quote:'地上5层'}]};
  const plugin=intakeApi({DEEPSEEK_API_KEY:'test-placeholder',WORKBENCH_DATABASE_ROOT:root},{fetch:async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(payload)}}]})})});
  const result=await call(plugin,'/extract',{source,consent:true});assert.equal(result.status,200);assert.equal(result.data.facts.length,1);
  assert.equal((await call(intakeApi(),'/extract',{source,consent:true})).status,503);
  assert.equal((await call(plugin,'/extract',{source,consent:true},{origin:'https://other.invalid'})).status,403);
  assert.equal((await call(plugin,'/extract',{source,consent:false})).status,400);
});
test('AI方案接口携带检索证据并返回可采用候选，历史参考不写入事实',async()=>{
  let sent;const plugin=intakeApi({DEEPSEEK_API_KEY:'test-placeholder',WORKBENCH_DATABASE_ROOT:root},{fetch:async(url,request)=>{sent=JSON.parse(request.body);return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({options:[{system:'混凝土框架',reasons:['作为空间适配的比选方案'],checks:['核对当前项目适用条件'],source_ids:['CASE-A']}]})}}]})};}});
  const result=await call(plugin,'/suggest',{consent:true,parameters:{region:'测试地点'},unit:{name:'A楼',use:'教学楼'}});
  assert.equal(result.status,200);assert.equal(result.data.options[0].statement,'AI推断');assert.ok(sent.messages[1].content.includes('CASE-A'));
  assert.equal((await call(plugin,'/suggest',{consent:true,unit:{}})).status,400);
});
