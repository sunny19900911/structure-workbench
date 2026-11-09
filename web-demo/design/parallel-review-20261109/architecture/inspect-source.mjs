// Read-only local sample inspection. Raw text stays in the ignored QA directory.
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {readWordSource} from '../../../server/word-source.mjs';
import {fragments,extractLocal} from '../../../intake-core.js';
import {composeDocument} from '../../../document-intake.js';
import {createHash} from 'node:crypto';
const [root,prefix,out]=process.argv.slice(2);
if(!root||!prefix||!out)throw Error('Usage: node inspect-source.mjs INPUT_DIRECTORY PREFIX QA_OUTPUT_DIRECTORY');
await mkdir(out,{recursive:true});
const names=(await readdir(root)).filter(n=>n.startsWith(prefix)&&/\.docx?$/i.test(n));
if(names.length!==1)throw Error('Expected one Word input');
const name=names[0],bytes=await readFile(root+'/'+name),hash=createHash('sha256').update(bytes).digest('hex');
const blocks=await readWordSource(bytes,/\.doc$/i.test(name),name);
const source={name,hash,slot:'bldg',source_id:'ARCH-'+hash.slice(0,16),blocks,fragments:fragments(blocks)};
await writeFile(out+'/source.json',JSON.stringify(source,null,2));
const document=composeDocument([source]);
await writeFile(out+'/result.json',JSON.stringify({document,facts:extractLocal(source)},null,2));
await writeFile(out+'/paragraphs.txt',blocks.paras.map((p,i)=>(i+1)+': '+p).join('\n'));
console.log(JSON.stringify({name,hash,paragraphs:blocks.paras.length,tables:blocks.tables.length,project:document.projectName,location:document.location,units:document.units},null,2));
