// Materialize the installed dependency graph without symlinks or a package manager.
import {createRequire,builtinModules} from 'node:module';
import {realpathSync,existsSync,readFileSync,mkdirSync,cpSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
const [source,target]=process.argv.slice(2).map(p=>resolve(p));
const chosen=new Map(),done=new Set(),records=[];
function locate(name,from){
 const req=createRequire(join(from,'package.json'));
 for(const search of req.resolve.paths(name)||[]){const path=join(search,name);if(existsSync(join(path,'package.json')))return realpathSync(path);}
 throw Error('Missing installed dependency '+name);
}
function copy(name,from,parent){
 if(builtinModules.includes(name)||name.startsWith('node:'))return;
 const path=locate(name,from),pkg=JSON.parse(readFileSync(join(path,'package.json'),'utf8'));
 let dest;
 if(!chosen.has(name)){chosen.set(name,{path,dest:join(target,'node_modules',name)});dest=chosen.get(name).dest;}
 else if(chosen.get(name).path===path)return;
 else dest=join(parent,'node_modules',name);
 if(done.has(dest))return;done.add(dest);
 mkdirSync(dest,{recursive:true});
 cpSync(path,dest,{recursive:true,dereference:true,filter:p=>p===path||!p.slice(path.length+1).split(/[\\/]/).includes('node_modules')});
 records.push({name,version:pkg.version,destination:dest.slice(target.length+1)});
 for(const dep of Object.keys(pkg.dependencies||{}))copy(dep,path,dest);
 for(const dep of Object.keys(pkg.optionalDependencies||{})){try{copy(dep,path,dest);}catch(e){if(!e.message.startsWith('Missing installed'))throw e;}}
}
for(const name of ['vite','@vitejs/plugin-react','react','react-dom','docx','pptxgenjs','@modelcontextprotocol/sdk','ajv'])copy(name,source,target);
writeFileSync(join(target,'node-runtime-dependencies.json'),JSON.stringify(records,null,2));
console.log(JSON.stringify({packages:records.length}));
