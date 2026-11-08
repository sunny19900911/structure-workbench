import test from 'node:test';
import assert from 'node:assert/strict';
import {listEngineeringResources,readEngineeringResource,listEngineeringPrompts,getEngineeringPrompt,lookupSeismicGrade,inspectEngineeringProject,engineeringToolDefinitions} from '../../server/mcp-engineering.mjs';

const id='a'.repeat(32),otherId='b'.repeat(32);
const parameters={project_name:'合成教学楼',region:'合成地点',seismic_cat:'丙类',intensity:'7',pga:'0.10g',eq_group:'第二组',site_class:'II 类',tg:'0.40',design_life:'50'};
const config={height:'20',heightBasis:'main-roof-above-outdoor',structure:'混凝土框架结构',buildingUse:'other',span:'8'};
const record=(part,data)=>({projectId:id,part,revision:2,data});
function project(){return {main:record('main',{parameters,parameterVersion:5,cards:{}}),intake:record('intake',{sources:[{source_id:'ARCH-1',name:'合成建筑.docx',slot:'bldg',fragments:[]},{source_id:'GEO-1',name:'合成地勘.doc',slot:'geo',fragments:[]}],facts:[],parameterConflicts:[]}),
 'expansion-a':record('expansion-a',{identity:{unit:'A 楼'},parameters:{...parameters},measuresVersion:5,sources:[{source_id:'MODEL-A',slot:'yjk',name:'WMASS.OUT'}],sections:{overview:{kind:'manual',text:'人工稿',manual:true}},model:{sourceIds:['MODEL-A'],batch:'A-1',confirmed:false,warnings:[],metrics:{over_wind_x:0,over_wind_y:'2.50',over_eq_x:'1.6',over_eq_y:'1.7'}},regulations:[]})};}

test('14 packaged resources include the Office workflow and six historical categories without original absolute paths',()=>{
 const resources=listEngineeringResources();assert.equal(resources.length,14);assert.equal(new Set(resources.map(r=>r.uri)).size,14);
 assert.ok(readEngineeringResource('workbench://engineering/office').text.includes('office.generate'));
 for(const r of resources){const content=readEngineeringResource(r.uri);assert.equal(content.uri,r.uri);assert.equal(content.mimeType,r.mimeType);assert.ok(content.text.length>30);assert.doesNotMatch(content.text,/E:\\\\600-|"path":/);}
 const missing=JSON.parse(readEngineeringResource('workbench://engineering/irregularity/capacity').text);
 assert.equal(missing.common.text,'');assert.deepEqual(missing.cases,[]);
 assert.throws(()=>readEngineeringResource('workbench://engineering/../../secrets'),/未找到/);
});

test('prompts bind stable project and explicit unit, and do not create confirmation bureaucracy',()=>{
 assert.equal(listEngineeringPrompts().length,2);
 const p=getEngineeringPrompt('workbench_preliminary_design',{projectId:id,unit:'A 楼',request:'更新概况'});
 assert.match(p.messages[0].content.text,/按章|逐项确认|expectedRevision/);
 assert.match(p.messages[0].content.text,/A 楼/);assert.match(p.messages[0].content.text,new RegExp(id));
 assert.throws(()=>getEngineeringPrompt('workbench_preliminary_design',{projectId:'项目名称',unit:'A'}),/ID/);
 assert.throws(()=>getEngineeringPrompt('workbench_preliminary_design',{projectId:id}),/单体/);
 assert.throws(()=>getEngineeringPrompt('arbitrary-command',{projectId:id,unit:'A'}),/未知/);
});

test('MCP grade lookup requires structural roof-height meaning and automatic building-use scope',()=>{
 let result=lookupSeismicGrade({config:{...config,heightBasis:'fire-height'},parameters});assert.equal(result.status,'incomplete');assert.equal(result.frame,'');
 result=lookupSeismicGrade({config:{...config,buildingUse:undefined},parameters});assert.equal(result.status,'incomplete');assert.match(result.missing.join(),/用途/);
 result=lookupSeismicGrade({config,parameters});assert.equal(result.status,'ready');assert.equal(result.frame,'三级');assert.equal(result.written,false);assert.match(result.scope,/未重新求解/);
});

test('MCP lookup retains residential missing floors and special-system limits',()=>{
 assert.equal(lookupSeismicGrade({config:{...config,buildingUse:'residential',floors:''},parameters}).status,'incomplete');
 for(const c of [{special:'isolation'},{heightClass:'B'},{category:'甲类'},{height:300}])assert.equal(lookupSeismicGrade({config:{...config,...c},parameters}).status,'special');
 assert.equal(lookupSeismicGrade({config:{...config,structure:'钢框架结构'},parameters}).status,'incomplete');
 assert.equal(lookupSeismicGrade({config,parameters:{...parameters,has_iso:true}}).status,'special');
});

test('lookup does not use overall overturning ratio as few-wall frame share',()=>{
 const r=lookupSeismicGrade({config:{...config,special:'fewWalls'},parameters});assert.equal(r.status,'incomplete');assert.match(r.missing.join(),/底层框架.*百分比/);
 assert.equal(lookupSeismicGrade({config:{...config,special:'fewWalls',frameMomentPercent:60},parameters}).status,'ready');
});

test('inspection keeps candidate model facts readable without claiming engineering approval',()=>{
 const records=project(),before=structuredClone(records),r=inspectEngineeringProject({projectId:id,records,unit:'A 楼'});
 assert.deepEqual(records,before);assert.equal(r.written,false);assert.equal(r.engineeringApproval,false);assert.equal(r.draftAllowed,true);
 assert.equal(r.model.confirmed,false);assert.equal(r.sources.length,3);assert.equal(r.sections[0].manual,true);assert.equal(r.findings.length,0);
});

test('zero and compatibility metric aliases remain actual extracted values',()=>{
 const records=project();records['expansion-a'].data.model.metrics={over_wind_x:0,overturn_wind_y:2,overturn_eq_x:2,overturn_eq_y:2};
 let r=inspectEngineeringProject({projectId:id,records,unit:'A 楼'});assert.ok(!r.findings.some(f=>f.code==='MODEL_METRIC_MISSING'));
 delete records['expansion-a'].data.model.metrics.overturn_eq_y;r=inspectEngineeringProject({projectId:id,records,unit:'A 楼'});
 assert.deepEqual(r.findings.find(f=>f.code==='MODEL_METRIC_MISSING').keys,['over_eq_y']);
});

test('inspection does not mix other unit model sources or silently pick multiple partitions',()=>{
 const records=project();records['expansion-b']=record('expansion-b',{identity:{unit:'B 楼'},sources:[{source_id:'MODEL-B',slot:'yjk'}]});
 records['expansion-a'].data.model.sourceIds=['MODEL-B'];let r=inspectEngineeringProject({projectId:id,records,unit:'A 楼'});
 assert.ok(r.findings.some(f=>f.code==='MODEL_SOURCE_MISSING'));assert.ok(!r.sources.some(s=>s.source_id==='MODEL-B'));
 records['expansion-duplicate']=structuredClone(records['expansion-a']);assert.throws(()=>inspectEngineeringProject({projectId:id,records,unit:'A 楼'}),/多个/);
});

test('records from different projects are rejected, not merged by unit name',()=>{
 const records=project();records.intake.projectId=otherId;assert.throws(()=>inspectEngineeringProject({projectId:id,records,unit:'A 楼'}),/另一项目/);
});

test('single-unit explicit parameters are used when comparing against the expansion snapshot',()=>{
 const records=project();records.intake.data.facts=[{unit:'A 楼',status:'confirmed',key:'site_class',value:'III 类'}];
 records['expansion-a'].data.parameters={...parameters,site_class:'Ⅲ类',tg:''};
 const r=inspectEngineeringProject({projectId:id,records,unit:'A 楼'});assert.equal(r.parameters.site_class,'III 类');
 assert.ok(!r.findings.some(f=>f.code==='PARAMETER_SNAPSHOT_DIFF'));assert.ok(r.findings.some(f=>f.code==='MISSING_PARAMETER'&&f.key==='tg'));
});

test('stale snapshots and manual drafts are reported while signed content is retained',()=>{
 const records=project(),s=records['expansion-a'].data;s.signed={at:'synthetic'};s.measuresVersion=4;s.parameters.wind='0.4';s.sections.overview.pendingAuto={draft:{text:'新稿'}};
 const before=JSON.stringify(records),r=inspectEngineeringProject({projectId:id,records,unit:'A 楼'});
 assert.equal(r.locks.expansion,true);assert.ok(r.findings.some(f=>f.code==='PARAMETER_VERSION_STALE'&&/签发/.test(f.message)));
 assert.ok(r.findings.some(f=>f.code==='SECTION_STALE'&&f.manual));assert.ok(r.findings.some(f=>f.code==='PARAMETER_SNAPSHOT_DIFF'));
 assert.equal(JSON.stringify(records),before);
});

test('plain saved data shape and deleted lifecycle are checked without writes',()=>{
 const records=project();const plain=Object.fromEntries(Object.entries(records).map(([k,v])=>[k,v.data]));plain.lifecycle={deleted:true};
 const r=inspectEngineeringProject({projectId:id,records:plain,unit:'A 楼'});assert.equal(r.draftAllowed,false);assert.equal(r.locks.deleted,true);assert.equal(r.written,false);
});

test('no source or model means draft gaps rather than inherited engineering values',()=>{
 const r=inspectEngineeringProject({projectId:id,records:{main:{parameters:{project_name:'新项目'}}},unit:'新单体'});
 assert.equal(r.draftAllowed,true);assert.deepEqual(r.parameters,{project_name:'新项目'});assert.equal(r.model,null);assert.equal(r.seismicGrade,null);
 assert.ok(r.findings.some(f=>f.code==='MISSING_MODEL'));assert.ok(r.findings.some(f=>f.code==='MISSING_SOURCE_GEO'));
});

test('tool schemas are read-only and do not accept raw project records for caller-controlled validation',()=>{
 assert.equal(engineeringToolDefinitions.length,2);
 for(const tool of engineeringToolDefinitions){assert.equal(tool.annotations.readOnlyHint,true);assert.equal(tool.inputSchema.additionalProperties,false);}
 assert.equal(engineeringToolDefinitions[0].inputSchema.properties.records,undefined);
});
