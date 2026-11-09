import {writeFile} from 'node:fs/promises';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createWorkbenchMCP} from '../../../server/mcp-server.mjs';
import {combinedParameters} from '../../../intake-core.js';

// Read only the isolated fixture through the actual local project API.
const projectId='157abdbcdfdf429ab491452838163099';
const path='/api/workbench-projects/'+projectId;
const response=await fetch('http://127.0.0.1:5445'+path);
if(!response.ok)throw Error('Isolated project API unavailable');
const saved=await response.json();
const data=record=>record?.data??record;
const intake=data(saved.records.intake),main=data(saved.records.main);
if(main.parameters.project_name!=='合成高度联动验收')throw Error('Wrong fixture');
const [a,b]=InMemoryTransport.createLinkedPair();
// Real MCP handler/schema/serialization; transport and service adapter are injected.
let records=saved.records;
const server=createWorkbenchMCP({client:{request:async requested=>{
 if(requested!==path)throw Error('Only fixture reads are allowed');
 return {records};
}}});
const client=new Client({name:'architecture-read-only-audit',version:'1.0'});
await server.connect(b);await client.connect(a);
const result={source_id:'QA-ARCH-MCP-20261109',transport:'SDK in-memory; real MCP server handler',liveClientsTested:false,writes:false,units:[],automaticSourceProbe:{}};
try{
 await client.listTools();
 for(const name of ['workflow','sources','parameters'])await client.readResource({uri:'workbench://engineering/'+name});
 const check=async unit=>{
  const reply=await client.callTool({name:'workbench_engineering_check',arguments:{projectId,unit}});
  if(reply.isError)throw Error(JSON.stringify(reply));
  return JSON.parse(reply.content.find(x=>x.type==='text').text);
 };
 for(const unit of ['甲楼','乙楼']){
  const effective=combinedParameters(intake,unit,main.parameters),mcp=await check(unit);
  result.units.push({unit,storedManualHeight:intake.seismicGrades[unit].height,effectiveHeight:effective.seismic_height_m,mcpExposesHeight:Object.hasOwn(mcp.parameters,'seismic_height_m'),mcpGradeStatus:mcp.seismicGrade?.status??null});
 }
 // Synthetic variation in memory only: remove manual configuration, retain source.
 records=structuredClone(saved.records);
 const automatic=data(records.intake);automatic.seismicGrades={};
 const effective=combinedParameters(automatic,'甲楼',main.parameters),mcp=await check('甲楼');
 result.automaticSourceProbe={effectiveHeight:effective.seismic_height_m,mcpExposesHeight:Object.hasOwn(mcp.parameters,'seismic_height_m'),mcpGrade:mcp.seismicGrade};
 await writeFile(new URL('../../../qa/parallel-review-20261109/architecture/mcp-read-audit.json',import.meta.url),JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
}finally{await client.close();await server.close();}
