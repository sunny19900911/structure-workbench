import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../../project-legacy-adapter.js',import.meta.url),'utf8');
const body=source.match(/canEdit\(id\)\{([^\n]+)\},/)[1];
function permission({id='c11',portable=true,role='填',signed=false,stage='扩初',visible=false,exists=true}={}){
 const sandbox={window:{WORKBENCH_PORTABLE:portable},PSTAGE:stage,cOf:()=>exists?{stage:['扩初','施工图']}:null,cardVisible:()=>visible,permOf:()=>role,stOf:()=>signed?3:0,id};
 return vm.runInNewContext('(function(id){'+body+'})(id)',sandbox);
}
test('隐藏PPT运行组件可持久化设计/审查草稿，不恢复导航也不放开其他隐藏模块',()=>{
 assert.equal(permission(),true);assert.equal(permission({role:'审'}),true);
 assert.equal(permission({id:'c10'}),false);assert.equal(permission({portable:false}),false);assert.equal(permission({exists:false}),false);
});
test('隐藏PPT仍受角色、阶段与已签发锁保护',()=>{
 for(const role of ['看','—'])assert.equal(permission({role}),false);
 assert.equal(permission({signed:true}),false);assert.equal(permission({stage:'未定义阶段'}),false);
 assert.equal(permission({id:'c1',visible:true}),true);assert.equal(permission({id:'c1',visible:true,signed:true}),false);
});
