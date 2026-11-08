import assert from 'node:assert/strict';
import {join,resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const root=fileURLToPath(new URL('../../',import.meta.url)),pkg=resolve(process.argv[2]);
const data=join(root,'qa/portable-release/mcp','自动启动 '+Date.now());await mkdir(data,{recursive:true});
const env={...process.env,WORKBENCH_PORTABLE_DATA:data};delete env.WORKBENCH_MCP_URL;
async function status(){const client=new Client({name:'startup-qa',version:'1.0.0'}),transport=new StdioClientTransport({command:join(pkg,'runtime/node/node.exe'),args:[join(pkg,'app/server/mcp-server.mjs')],env,stderr:'pipe'});try{await client.connect(transport);const reply=await client.callTool({name:'workbench_status',arguments:{}},undefined,{timeout:60000});assert.ok(!reply.isError,JSON.stringify(reply));return JSON.parse(reply.content.find(x=>x.type==='text').text).health;}finally{await client.close();}}
let owned;
try{const a=await status();assert.equal(resolve(a.dataRoot),resolve(data));owned=a.pid;const b=await status();assert.equal(b.pid,a.pid,'another MCP client must reuse the same local service');await writeFile(join(data,'result.json'),JSON.stringify({first:a,second:b,passed:true},null,2));console.log(JSON.stringify({passed:true,sameProcess:true,dataRoot:data}));}
finally{if(owned)process.kill(owned);}
