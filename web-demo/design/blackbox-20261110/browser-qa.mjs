import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const root=fileURLToPath(new URL('../../',import.meta.url)),qa=join(root,'qa/portable-release/blackbox'),data=join(qa,'runtime'),base='http://127.0.0.1:5460';
const state=await(await fetch(base+'/api/launcher/status')).json();assert.equal(resolve(state.dataRoot),resolve(data));
const runtime=process.env.WORKBENCH_SOURCE_RUNTIME||join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies');
const {chromium}=await import(pathToFileURL(join(runtime,'node/node_modules/playwright/index.mjs')).href);
const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({viewport:{width:520,height:720}}),page=await context.newPage(),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
const input=join(qa,'输入项目 中文');await mkdir(input,{recursive:true});await writeFile(join(input,'建筑资料.txt'),'QA合成建筑资料，仅作输入扫描验证，不代表真实工程。');
let client,transport,workbench;
async function call(name,args={}){const result=await client.callTool({name:'workbench_'+name,arguments:args},undefined,{timeout:200000});const value=JSON.parse(result.content.find(c=>c.type==='text').text);if(result.isError)throw Error(name+': '+JSON.stringify(value));return value;}
try{
 await page.goto(base+'/blackbox');await page.getByText('本地服务运行中',{exact:true}).waitFor();await page.screenshot({path:join(qa,'screen-empty.png')});
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByLabel('项目输入文件夹',{exact:true}).fill(input);await page.getByRole('button',{name:'保存设置'}).click();await page.locator('#settings-dialog').waitFor({state:'hidden'});
 const selected=(await(await fetch(base+'/api/launcher/status')).json()).selected;assert.equal(selected.inputPath,input);assert.match(await page.locator('#project-name').innerText(),/输入项目/);checks.push('设置选择真实目录、创建项目及工作台成果目录');
 await page.reload();await page.getByText('本地服务运行中',{exact:true}).waitFor();assert.match(await page.locator('#project-name').innerText(),/输入项目/);checks.push('管理窗口重开恢复原项目ID');
 await page.getByRole('button',{name:'连接 Kimi',exact:true}).click();await page.locator('#config').waitFor();const configuration=JSON.parse(await page.locator('#config').inputValue()).mcpServers['structure-workbench'];assert.equal(configuration.env.WORKBENCH_PORTABLE_DATA,data);await page.locator('#connect-dialog [data-close]').click();checks.push('从真实连接按钮生成隔离STDIO配置');
 client=new Client({name:'blackbox-sdk-qa',version:'1.0'});transport=new StdioClientTransport({...configuration,env:{...process.env,...configuration.env},stderr:'pipe'});await client.connect(transport);const tools=(await client.listTools()).tools;assert.ok(tools.some(t=>t.name==='workbench_project_folder'));assert.ok(tools.some(t=>t.name==='workbench_expansion_subsection_edit'));const files=await call('project_folder',{projectId:selected.projectId});assert.deepEqual(files.files.map(f=>f.name),['建筑资料.txt']);
 await page.getByText(/blackbox-sdk-qa · 已连接/).waitFor({timeout:15000});checks.push('真实SDK工具发现、目录扫描、会话心跳展示');
 workbench=await context.newPage();workbench.on('pageerror',e=>errors.push('workbench: '+e.message));await workbench.goto(base+'/workbuddy-integrated-studio.html?project='+selected.projectId);
 await workbench.waitForFunction(()=>window.WorkbenchProjects?.id&&!window.WorkbenchProjects.loading&&window.ExpansionWorkbench?.mcp&&window.WorkbenchModules?.mcp,{timeout:90000});
 await workbench.evaluate(()=>window.WorkbenchProjects.flush());await page.getByText('工作台页面已连接。',{exact:true}).waitFor({timeout:20000});
 const ctx=(await call('project_context',{projectId:selected.projectId,args:{}})).result;assert.equal(ctx.projectId,selected.projectId);checks.push('目录项目由原工作台加载，页面状态与实际MCP读取一致');
 await page.getByRole('button',{name:'退出后台',exact:true}).click();await page.getByText(/请先保存并关闭工作台页面/).waitFor();assert.ok((await fetch(base+'/api/portable/health')).ok);checks.push('页面连接期间退出被拒，后台及项目仍可读');
 const artifact=(await call('export_document',{projectId:selected.projectId,unit:ctx.unit,kind:'expansion',format:'docx'})).artifact;assert.ok(artifact.path.startsWith(join(input,'工作台成果')));const bytes=await readFile(artifact.path);assert.ok(bytes.length>10000);assert.equal(bytes.subarray(0,2).toString(),'PK');checks.push('共享MCP→原组稿→实际DOCX落入项目成果新批次');
 await page.reload();await page.getByText('工作台页面已连接。',{exact:true}).waitFor();await page.screenshot({path:join(qa,'screen-project.png')});await page.setViewportSize({width:360,height:740});await page.screenshot({path:join(qa,'screen-narrow.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);checks.push('520px及360px界面无横向溢出');
 await client.close();client=null;await workbench.close();workbench=null;await page.close();assert.ok((await fetch(base+'/api/portable/health')).ok);checks.push('关闭窗口和业务页后后台继续运行');
 await writeFile(join(qa,'browser-result.json'),JSON.stringify({checks,errors,projectId:selected.projectId,artifact,tools:tools.length,instanceId:state.instanceId},null,2));console.log(JSON.stringify({checks,errors,artifact},null,2));
}catch(e){await page.screenshot({path:join(qa,'failure.png')}).catch(()=>{});await writeFile(join(qa,'browser-result.json'),JSON.stringify({checks,errors,error:e.stack},null,2));throw e;}
finally{await client?.close();await browser.close();}
