import {writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fixture,root} from './fixture.mjs';

const preview=await fixture();
const url=preview.origin+'/qa.html?id='+preview.record.documentId;
const directory=join(root,'qa/portable-release/mcp/office-ppt-preview');
await mkdir(directory,{recursive:true});
await writeFile(join(directory,'ready.json'),JSON.stringify({url,port:Number(new URL(url).port),pid:process.pid,data:preview.directory},null,2));
console.log(url);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await preview.close();process.exit(0);});
