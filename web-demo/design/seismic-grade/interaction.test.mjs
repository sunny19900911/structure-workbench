import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {combinedParameters,unitNames} from '../../intake-core.js';
import {gradeInput,seismicGrade} from '../../seismic-grade-core.js';

const source=await readFile(new URL('../../intake-workbench.js',import.meta.url),'utf8');
test('查表只读小份单体数据，避开原始图片、全文和历史；结果不依赖网络',()=>{
 const state={facts:[],seismicGrades:{A:{height:'20',structure:'混凝土框架结构'}}};
 for(const name of ['sources','history'])Object.defineProperty(state,name,{get(){throw Error('不应读取大份资料 '+name);}});
 const globals={state,gradeDocument:{units:[],allUnitNames:[]},L:{params:()=>({intensity:'7',pga:'0.1g',seismic_cat:'丙类',site_class:'II类'})},PROJECT:'项目整体',unitNames,combinedParameters};
 const start=source.indexOf('function seismicInputs()'),end=source.indexOf('function applyDocumentIdentity()',start);
 const read=vm.runInNewContext(source.slice(start,end)+';seismicInputs',globals);
 const rows=read();assert.equal(rows[0].parameters.g_frame,'三级');rows[0].config.height='99';assert.equal(state.seismicGrades.A.height,'20');
});
test('连续输入立即更新本地条件且合并后台保存，服务器慢时不丢后一次输入',async()=>{
 let callback,scheduled=0,ensured=0;
 const state={seismicGrades:{},history:[],revision:0},context={window:{WorkbenchIntake:{}},state,ensure(){ensured++;},busy:false,W:{id:'test'},gradeStatus(){},clearTimeout(){callback=null;},setTimeout(fn){callback=fn;return ++scheduled;},gradeSaveTimer:null,gradeChangePending:false,save:async()=>{},note(){}};
 const start=source.indexOf('window.WorkbenchIntake.saveSeismicGrade='),end=source.indexOf('// Explicit confirmation',start);
 vm.runInNewContext(source.slice(start,end),context);const save=context.window.WorkbenchIntake.saveSeismicGrade;
 assert.equal(save('A',{height:'2'}),true);assert.equal(save('A',{height:'28'}),true);assert.equal(save('A',{structure:'混凝土框架结构'}),true);
 assert.equal(state.seismicGrades.A.height,'28');assert.equal(state.seismicGrades.A.structure,'混凝土框架结构');assert.equal(ensured,3);assert.equal(scheduled,3);assert.equal(typeof callback,'function');
 context.busy=true;assert.throws(()=>save('A',{height:'30'}),/导入/);assert.equal(state.seismicGrades.A.height,'28');
});
test('切换项目前等待缓冲条件保存，并把新的措施版本写回主分区',async()=>{
 const source=await readFile(new URL('../../project-workspace.js',import.meta.url),'utf8');
 let version=1,persisted=0;
 const modules=new Map([['intake',{save:async()=>{version++;}}]]);
 const context={loading:false,exporting:false,modules,window:{},save:async()=>{persisted=version;}};
 const start=source.indexOf('async function flush('),end=source.indexOf('async function load(',start);
 const flush=vm.runInNewContext(source.slice(start,end)+';flush',context);
 await flush();assert.equal(persisted,2);
});
test('高度在25与20米间往返，框架三级二级即时变化；回车同值仍重算显示',async()=>{
 const js=await readFile(new URL('../../seismic-grade-workbench.js',import.meta.url),'utf8');
 const config={height:'25',structure:'混凝土框架结构'},parameters={intensity:'7',pga:'0.1g',seismic_cat:'丙类',site_class:'II类'};
 let shown='',saves=0,refreshes=0;
 const row={dataset:{sgUnit:'A'}},target={dataset:{sg:'height'},value:'20',closest:()=>row};
 const context={entries:()=>[{name:'A',config}],update:(name,values)=>{if(values){Object.assign(config,values);saves++;}refreshes++;shown=seismicGrade(gradeInput(config,parameters)).frame;}};
 const saveField=vm.runInNewContext(js.slice(js.indexOf('function saveField('),js.indexOf("panel?.addEventListener('input'"))+';saveField',context);
 saveField({target});assert.equal(shown,'三级');target.value='25';saveField({target});assert.equal(shown,'二级');
 shown='过期显示';saveField({target});assert.equal(shown,'二级');assert.equal(saves,2);assert.equal(refreshes,3);
});
