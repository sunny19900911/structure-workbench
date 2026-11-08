import {stat,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {portablePaths} from './runtime.mjs';

const SERVER_NAME='structure-workbench';
const defaultRoot=()=>fileURLToPath(new URL('../../../',import.meta.url));
const quote=value=>JSON.stringify(value);

/** Only creates standalone snippets. Never reads or changes client configuration. */
export async function buildMcpConfiguration({packageRoot,dataRoot,ambient=process.env}={}){
 const root=resolve(packageRoot||ambient.WORKBENCH_PORTABLE_ROOT||defaultRoot());
 const appRoot=join(root,'app'),command=join(root,'runtime','node','node.exe'),entry=join(appRoot,'server','mcp-server.mjs');
 for(const file of [command,entry]){
  if(!await stat(file).then(value=>value.isFile(),()=>false))throw Error('离线包不完整或尚未包含 MCP：请完整解压新版后，再运行“生成MCP配置”。缺少 '+file);
 }
 const paths=portablePaths(appRoot,{...ambient,...(dataRoot?{WORKBENCH_PORTABLE_DATA:dataRoot}:{})});
 const env={WORKBENCH_PORTABLE_DATA:paths.data};
 const connection={type:'stdio',command,args:[entry],env,timeout:300000};
 const workbuddy=JSON.stringify({mcpServers:{[SERVER_NAME]:connection}},null,2)+'\n';
 const kimi=JSON.stringify({mcpServers:{[SERVER_NAME]:{command,args:[entry],env,startupTimeoutMs:30000,toolTimeoutMs:300000}}},null,2)+'\n';
 const codex=[
  '# 仅将这一段加入 Codex 的 MCP 配置；不要替换已有服务器配置。',
  `[mcp_servers.${SERVER_NAME}]`,
  `command = ${quote(command)}`,
  `args = [${quote(entry)}]`,
  'startup_timeout_sec = 30',
  'tool_timeout_sec = 300',
  '',
  `[mcp_servers.${SERVER_NAME}.env]`,
  `WORKBENCH_PORTABLE_DATA = ${quote(paths.data)}`,
  ''
 ].join('\n');
 return {root,dataRoot:paths.data,command,entry,workbuddy,kimi,codex};
}

export async function generateMcpConfiguration(options={}){
 const config=await buildMcpConfiguration(options);
 const parent=join(config.dataRoot,'mcp');
 await mkdir(parent,{recursive:true});
 // A new folder preserves earlier snippets and any manual changes to them.
 const output=await mkdtemp(join(parent,'连接配置-'));
 const files={workbuddy:join(output,'WorkBuddy-MCP.json'),kimi:join(output,'Kimi-MCP.json'),codex:join(output,'Codex-MCP.toml'),instructions:join(output,'先看这里.txt')};
 const instructions=[
  '结构工作台：本机 MCP 连接',
  '',
  '1. 建议先双击离线包里的“启动工作台”，保持网页打开。',
  '2. WorkBuddy：进入设置里的 MCP（部分版本在“连接器／自定义连接器”），添加本机 stdio 服务。',
  '   将 WorkBuddy-MCP.json 的 structure-workbench 条目合入配置；已有其他条目时不要整份覆盖。',
  '   若界面分栏填写：command 是命令，args 是参数，env 是环境变量。',
  '3. Codex：在 MCP 设置中添加本机服务，或将 Codex-MCP.toml 这一段加入 MCP 配置。',
  '   如果已经有 structure-workbench 条目，只更新该条目，不重复添加同名表。',
  '4. Kimi Code：在本机客户端的 MCP 配置中合入 Kimi-MCP.json。CLI 可用 /mcp-config，或合入 ~/.kimi-code/mcp.json。',
  '   新建会话后用 /mcp 检查连接；本配置需要能运行本地命令的 Kimi Code。',
  '5. 保存后启用或重连服务，在聊天中发送：',
  '   “请使用 structure-workbench，先读取结构设计工作流，再列出本机项目；先不要修改项目。”',
  '',
  '工作台未启动时，MCP 会尝试启动随包的本地服务。涉及网页组稿和导出时，请保持工作台网页打开。',
  '这份配置只连接本机，不需要域名、宝塔或公网地址。不要把工作台网页的网址填成 MCP 地址。',
  '项目数据目录：'+config.dataRoot,
  '软件移动或重新解压到另一位置后，请重新生成配置，并更新客户端中的原条目。',
  '本工具只生成这几份文件，没有读取或改动 WorkBuddy/Kimi Code/Codex 的原有设置。',
  '',
  '本机保存不代表模型也离线。使用联网 AI 时，工具返回的资料会进入该 AI 的会话。',
  '连接成功后仍需做一次实际项目读取；配置文件生成不等于客户端已经验证通过。',
  '',
  'WorkBuddy 官方连接器说明：https://open.workbuddy.cn/en/docs/connector',
  'Kimi Code 官方 MCP 说明：https://www.kimi.com/code/docs/en/kimi-code-cli/customization/mcp',
  'Codex 官方 MCP 说明：https://developers.openai.com/codex/mcp',
  ''
 ].join('\r\n');
 await Promise.all([writeFile(files.workbuddy,config.workbuddy,'utf8'),writeFile(files.kimi,config.kimi,'utf8'),writeFile(files.codex,config.codex,'utf8'),writeFile(files.instructions,'\ufeff'+instructions,'utf8')]);
 return {...config,output,files};
}

async function main(){
 const args=process.argv.slice(2);
 if(args.some(arg=>arg!=='--open'))throw Error('用法：node mcp-setup.mjs [--open]');
 const result=await generateMcpConfiguration();
 console.log('MCP 配置已生成：'+result.output);
 console.log('请打开“先看这里.txt”，按说明加入 WorkBuddy、Kimi Code 或 Codex。');
 if(args.includes('--open')&&process.platform==='win32'){
  const child=spawn('explorer.exe',[result.output],{windowsHide:true,stdio:'ignore',detached:true});
  child.on('error',()=>console.error('无法自动打开文件夹，请手动打开上面的目录。'));
  child.unref();
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
