import {readdir,readFile,writeFile,stat} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const files={};
async function scan(directory,recursive){
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const path=join(directory,entry.name);
  if(entry.isDirectory()&&recursive&&!['node_modules','qa','outputs','.git'].includes(entry.name))await scan(path,true);
  if(!entry.isFile()||! /\.(?:m?js|css|html|py|ps1|cmd)$/.test(entry.name))continue;
  files[relative(root,path).replaceAll('\\','/')]={sha256:createHash('sha256').update(await readFile(path)).digest('hex'),modified:(await stat(path)).mtime.toISOString()};
 }
}
await scan(root,false);
for(const name of ['server','deploy','deepseek-rewrite','design'])await scan(join(root,name),true);
const hashes=Object.fromEntries(Object.keys(files).sort().map(key=>[key,files[key].sha256]));
const result={captured:new Date().toISOString(),head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),signature:createHash('sha256').update(JSON.stringify(hashes)).digest('hex'),files};
await writeFile(process.argv[2],JSON.stringify(result,null,2));console.log(result.signature);
