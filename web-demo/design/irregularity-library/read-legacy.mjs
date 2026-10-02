import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import {extractLegacyDoc} from '../../server/legacy-doc.mjs';
const root='E:/600-工作台数据库/610-待处理/001-历史项目的设计说明';
await mkdir('qa/irregularity-library',{recursive:true});
for(const name of await readdir(root)){if(!/^\d/.test(name)||!name.endsWith('.doc'))continue;const xml=await extractLegacyDoc(await readFile(root+'/'+name));await writeFile('qa/irregularity-library/'+name+'.xml',xml);console.log(name);}
