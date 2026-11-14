import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,mkdtemp} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildMcpConfiguration,generateMcpConfiguration} from '../../deploy/portable/mcp-setup.mjs';

const root=fileURLToPath(new URL('../../qa/parallel-hardening/mcp-setup/',import.meta.url));
async function fixture(){
 await mkdir(root,{recursive:true});
 const folder=await mkdtemp(join(root,'中文 空格 ')),packageRoot=join(folder,'离线工作台'),dataRoot=join(folder,'同事项目');
 for(const relative of ['runtime/node/node.exe','app/server/mcp-server.mjs']){
  const path=join(packageRoot,relative);await mkdir(resolve(path,'..'),{recursive:true});await writeFile(path,'fixture only');
 }
 return {folder,packageRoot,dataRoot,ambient:{LOCALAPPDATA:join(folder,'local-app-data')}};
}

test('配置采用随包运行时、独立参数和同一数据目录，中文与空格不丢失',async()=>{
 const f=await fixture(),config=await buildMcpConfiguration(f),server=JSON.parse(config.workbuddy).mcpServers['structure-workbench'];
 assert.equal(server.type,'stdio');assert.equal(server.command,join(f.packageRoot,'runtime/node/node.exe'));
 assert.deepEqual(server.args,[join(f.packageRoot,'app/server/mcp-server.mjs')]);
 assert.deepEqual(server.env,{WORKBENCH_PORTABLE_DATA:f.dataRoot});
 const kimi=JSON.parse(config.kimi).mcpServers['structure-workbench'];
 assert.equal(kimi.command,server.command);assert.deepEqual(kimi.args,server.args);assert.deepEqual(kimi.env,server.env);
 assert.equal(kimi.startupTimeoutMs,30000);assert.equal(kimi.toolTimeoutMs,450000);
 assert.equal(server.timeout,450000);
 assert.equal(kimi.timeout,undefined);
 assert.match(config.codex,/\[mcp_servers.structure-workbench\]/);
 const commandLine=config.codex.split('\n').find(line=>line.startsWith('command = '));
 assert.equal(JSON.parse(commandLine.slice('command = '.length)),server.command);
 assert.ok(!server.command.includes('npx'));assert.ok(!config.workbuddy.includes('API_KEY'));
});

test('包根目录和存储覆写沿用明确环境，不带入无关环境或密钥',async()=>{
 const f=await fixture();
 const config=await buildMcpConfiguration({ambient:{...f.ambient,WORKBENCH_PORTABLE_ROOT:f.packageRoot,WORKBENCH_PORTABLE_DATA:f.dataRoot,DEEPSEEK_API_KEY:'fixture-secret-never-copy'}});
 assert.equal(config.dataRoot,f.dataRoot);assert.ok(!config.workbuddy.includes('fixture-secret-never-copy'));
 const normal=await buildMcpConfiguration({packageRoot:f.packageRoot,ambient:f.ambient});
 assert.equal(normal.dataRoot,join(f.ambient.LOCALAPPDATA,'StructureWorkbench'));
});

test('重复生成新目录，不覆盖先前人工配置，不触碰客户端设置',async()=>{
 const f=await fixture(),clientFile=join(f.folder,'客户端配置.json');await writeFile(clientFile,'keep client settings');
 const first=await generateMcpConfiguration(f);await writeFile(first.files.workbuddy,'manual changes');
 const second=await generateMcpConfiguration(f);
 assert.notEqual(first.output,second.output);assert.ok(second.output.startsWith(join(f.dataRoot,'mcp')));
 assert.equal(await readFile(first.files.workbuddy,'utf8'),'manual changes');
 assert.equal(await readFile(clientFile,'utf8'),'keep client settings');
 assert.equal(JSON.parse(await readFile(second.files.workbuddy,'utf8')).mcpServers['structure-workbench'].command,second.command);
 assert.equal(JSON.parse(await readFile(second.files.kimi,'utf8')).mcpServers['structure-workbench'].env.WORKBENCH_PORTABLE_DATA,f.dataRoot);
 assert.match(await readFile(second.files.instructions,'utf8'),/没有读取或改动/);
 const commands=await readFile(second.files.commands,'utf8');
 assert.ok(commands.includes(second.command));assert.ok(commands.includes(JSON.stringify([second.entry])));
 assert.match(commands,/双击 mcp.cmd/);assert.match(commands,/STDIO进程由客户端管理/);
});

test('缺少发行包文件时拒绝输出假配置',async()=>{
 const f=await fixture();
 await assert.rejects(buildMcpConfiguration({...f,packageRoot:join(f.folder,'缺失软件')}),/离线包不完整/);
});

test('真实 CLI 从任意目录启动，输出 UTF-8 配置且不依赖系统 node 查找',async()=>{
 const f=await fixture(),script=fileURLToPath(new URL('../../deploy/portable/mcp-setup.mjs',import.meta.url));
 const result=spawnSync(process.execPath,[script],{cwd:f.folder,env:{...process.env,WORKBENCH_PORTABLE_ROOT:f.packageRoot,WORKBENCH_PORTABLE_DATA:f.dataRoot},encoding:'utf8',windowsHide:true});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/MCP 配置已生成/);
 const output=result.stdout.split(/\r?\n/)[0].replace('MCP 配置已生成：','');
 assert.equal(JSON.parse(await readFile(join(output,'WorkBuddy-MCP.json'),'utf8')).mcpServers['structure-workbench'].env.WORKBENCH_PORTABLE_DATA,f.dataRoot);
});
