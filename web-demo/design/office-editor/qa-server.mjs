import {randomUUID} from 'node:crypto';
const instanceId=randomUUID();
import {officePptHistoryApi} from '../../server/office-ppt-document-api.mjs';
import {createServer} from 'node:http';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
import {mkdir,readFile,stat} from 'node:fs/promises';
import {createApplication} from '../../deploy/baota/http-app.mjs';
import {portableHTML,RELEASE} from '../../deploy/portable/runtime.mjs';
import {deepSeekLocalApi,calculationBookLocalApi} from '../../vite.config.js';
import {projectStoreApi} from '../../server/project-store.mjs';
import {expansionApi} from '../../server/expansion-api.mjs';
import {intakeApi} from '../../server/intake-api.mjs';
import {calculationPdfApi} from '../../server/calculation-pdf-api.mjs';
import {documentFormatApi} from '../../server/document-format-api.mjs';
import {portableProjectApi} from '../../server/portable-projects.mjs';
import {officeDocumentApi} from '../../server/office-document-api.mjs';
import {createBrowserBridge} from '../../server/mcp-browser-bridge.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),data=resolve(root,'qa/portable-release/mcp/office-integration'),runtime=join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies');
const env={WORKBENCH_PORTABLE:'1',WORKBENCH_DATABASE_ROOT:data,WORKBENCH_PROJECT_STORE:join(data,'projects'),WORKBENCH_CACHE_ROOT:join(data,'cache'),WORKBENCH_PYTHON:join(runtime,'python/python.exe'),CALCBOOK_PYTHON:join(runtime,'python/python.exe'),WORKBENCH_PDFINFO:join(runtime,'native/poppler/Library/bin/pdfinfo.exe'),WORKBENCH_PDFTOPPM:join(runtime,'native/poppler/Library/bin/pdftoppm.exe'),CALCBOOK_SOURCE_DIR:join(data,'sources'),CALCBOOK_UPLOAD_DIR:join(data,'uploads'),IMA_BRIDGE_MODULE:join(data,'not-configured.mjs'),EXPANSION_STORE_DIR:join(data,'legacy'),PYTHONUTF8:'1'};
await mkdir(env.WORKBENCH_PROJECT_STORE,{recursive:true});Object.assign(process.env,env);
const original=join(root,'outputs/portable/结构工作台离线MCP版-20261108-build-091128/app/dist');
const safeAssets={configurePreviewServer(server){server.middlewares.use(async(req,res,next)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/api/portable/health'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({app:'structure-workbench-portable',version:RELEASE,pid:process.pid,instanceId,dataRoot:data,local:true}));}
 if(path==='/api/portable/preferences'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({aiConfigured:false,dataRoot:data,version:RELEASE}));}
 if(path.includes('..')||path.startsWith('/api/')||!/^\/(?:[\w\-./]|%[A-Fa-f0-9]{2})+$/.test(path))return next();
 if(await stat(join(root,'dist',path)).catch(()=>null))return next();
 const legacy=join(original,path);if(!(await stat(legacy).catch(()=>null))?.isFile())return next();
 const ext=path.split('.').at(-1);res.setHeader('Content-Type',({js:'text/javascript',css:'text/css',json:'application/json',svg:'image/svg+xml',png:'image/png'})[ext]||'application/octet-stream');return res.end(await readFile(legacy));
 });}};
const bridge=createBrowserBridge();
const app=createApplication({publicDir:join(root,'dist'),localOnly:true,transformHTML:portableHTML,plugins:[safeAssets,bridge.plugin,officeDocumentApi(env),officePptHistoryApi(env),documentFormatApi(env),portableProjectApi(env),deepSeekLocalApi(env),calculationBookLocalApi(env),expansionApi(env),projectStoreApi(env),intakeApi(env),calculationPdfApi(env)]});
const port=Number(process.env.WORKBENCH_QA_PORT||58842);
createServer(app).listen(port,'127.0.0.1',()=>console.log('QA http://127.0.0.1:'+port+' · '+data));
