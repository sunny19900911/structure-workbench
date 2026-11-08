import {createHash,timingSafeEqual} from 'node:crypto';
import {readFile,stat,realpath} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';

const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.ico':'image/x-icon','.wasm':'application/wasm','.pdf':'application/pdf','.gz':'application/gzip'};
const digest=s=>createHash('sha256').update(s).digest();
export function createApplication({publicDir,user,password,plugins=[],basePath='/',localOnly=false,transformHTML=null}){
 if(!localOnly&&(!user||!password||password.length<16))throw Error('请设置 WORKBENCH_USER 和至少16位的 WORKBENCH_PASSWORD');
 if(!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(basePath))throw Error('工作台路径必须以 / 开始和结束');
 const mount=basePath==='/'?'':basePath.slice(0,-1);
 const expected=digest(user+':'+password),routes=[];
 const adapter={middlewares:{use(prefix,handler){if(typeof prefix==='function'){handler=prefix;prefix='/';}routes.push({prefix,handler});}}};
 for(const plugin of plugins.flat(Infinity))plugin?.configurePreviewServer?.(adapter);
 return async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
  res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','SAMEORIGIN');
  const auth=req.headers.authorization||'';
  const decoded=auth.startsWith('Basic ')?Buffer.from(auth.slice(6),'base64').toString('utf8'):'';
  if(localOnly){
   res.setHeader('Content-Security-Policy',"connect-src 'self' blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; worker-src 'self' blob:; img-src 'self' data: blob:; font-src 'self' data: blob:");
   const peer=req.socket.remoteAddress;
   if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer)||!/^127\.0\.0\.1:\d+$/.test(req.headers.host||'')||req.headers['sec-fetch-site']==='cross-site'){
    res.writeHead(403,{'Content-Type':'application/json; charset=utf-8'});return res.end(JSON.stringify({error:'本地版只允许当前电脑的工作台页面访问'}));
   }
  }else if(!timingSafeEqual(digest(decoded),expected)){res.writeHead(401,{'WWW-Authenticate':'Basic realm="Workbench", charset="UTF-8"'});return res.end('Login required');}
  const send=(status,message)=>{if(!res.headersSent){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:message}));}else res.end();};
  try{
   if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return send(403,'仅允许同源请求');
   const requested=new URL(req.url,'http://localhost');
   if(mount){
    if(requested.pathname===mount){res.writeHead(308,{Location:basePath+requested.search});return res.end();}
    if(!requested.pathname.startsWith(basePath))return send(404,'Not Found');
    req.url=requested.pathname.slice(mount.length)+requested.search;
   }
   let index=0;
   const next=async(error)=>{
    if(error)return send(500,'请求未完成');
    const pathname=new URL(req.url,'http://localhost').pathname;
    while(index<routes.length){const {prefix,handler}=routes[index++];if(prefix!=='/'&&pathname!==prefix&&!pathname.startsWith(prefix+'/'))continue;
     const original=req.url;if(prefix!=='/')req.url=req.url.slice(prefix.length)||'/';
     try{return await handler(req,res,(err)=>{req.url=original;return next(err);});}catch{return send(500,'请求未完成');}
    }
    if(pathname.startsWith('/api/'))return send(404,'接口不存在');
    if(!['GET','HEAD'].includes(req.method))return send(405,'Method Not Allowed');
    const decodedPath=decodeURIComponent(pathname);
    if(decodedPath.split(/[\\/]/).some(p=>p.startsWith('.')))return send(404,'Not Found');
    const root=await realpath(publicDir),file=resolve(root,decodedPath==='/'?'workbuddy-integrated-studio.html':'.'+decodedPath);
    if(!file.startsWith(root+sep))return send(404,'Not Found');
    let actual,info;try{actual=await realpath(file);info=await stat(actual);}catch{return send(404,'Not Found');}
    if(!actual.startsWith(root+sep)||!info.isFile())return send(404,'Not Found');
    res.setHeader('Content-Type',types[extname(actual)]||'application/octet-stream');
    if(transformHTML&&extname(actual)==='.html'){
     const bytes=Buffer.from(transformHTML(await readFile(actual,'utf8'),pathname));res.setHeader('Content-Length',bytes.length);res.end(req.method==='HEAD'?undefined:bytes);
    }else{res.setHeader('Content-Length',info.size);res.end(req.method==='HEAD'?undefined:await readFile(actual));}
   };
   await next();
  }catch{send(400,'请求无效');}
 };
}
