import {runDiscovery} from '../design/parallel-tasks/02-regulation-query/prototype/online-sources.mjs';
export function regulationDiscoveryApi(discover=runDiscovery){
  return {name:'integrated-regulation-discovery',configureServer:register,configurePreviewServer:register};
  function register(server){server.middlewares.use('/api/regulation-discovery',async(req,res)=>{
    const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    try{
      if(req.method!=='POST')return send(405,{error:'仅支持主动查询'});
      if(req.headers['x-workbench-request']!=='regulation-discovery'||req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return send(403,{error:'仅允许工作台同源查询'});
      const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>12000)return send(413,{error:'查询内容过长'});chunks.push(c);}
      const {province,asOf,keywords}=JSON.parse(Buffer.concat(chunks).toString());
      if(!['天津','上海','北京','广东','江苏','浙江','云南'].includes(province))return send(400,{error:'该地区尚无已接入的权威网站查询器'});
      if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||!Number.isFinite(Date.parse(asOf)))return send(400,{error:'核查日期无效'});
      if(typeof keywords!=='string'||!keywords.trim()||keywords.length>500)return send(400,{error:'请填写500字以内的规范名称或编号'});
      send(200,await discover({province,asOf,keywords}));
    }catch(e){send(502,{error:e.message||'权威网站查询失败'});}
  });}
}
