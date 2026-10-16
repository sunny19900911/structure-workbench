export const clone=value=>JSON.parse(JSON.stringify(value));
export const newProjectId=()=>crypto.randomUUID().replaceAll('-','');
export async function projectRequest(path,data){const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),60000);try{const r=await fetch('/api/workbench-projects'+path,{method:data===undefined?'GET':'POST',signal:controller.signal,headers:{'Content-Type':'application/json','X-Workbench-Request':'project-store'},...(data===undefined?{}:{body:JSON.stringify(data)})});if(r.status===401){const error=Error('登录已过期，请刷新页面重新登录；未保存稿仍保留在本机。');error.status=401;throw error;}const result=await r.json();if(!r.ok){const error=Error(result.error||'项目服务不可用');error.status=r.status;throw error;}return result;}catch(e){if(e.name==='AbortError')throw Error('项目服务60秒内未响应；本机恢复稿已保留，请重试。');throw e;}finally{clearTimeout(timeout);}}
export function projectPart(id,part,onStatus=()=>{}){
 const key='wb:recovery:v1:'+id+':'+part;let revision=0,blocked=false,queue=Promise.resolve(),last='',generation=0,pending=0;
 const recovery=()=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}};
 const cache=value=>{try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{onStatus('浏览器恢复空间不足，请保持页面打开并保存到603。');return false;}};
 return {key,get revision(){return revision},get blocked(){return blocked},async load({remoteOnly=false,fresh=false}={}){
   if(fresh){revision=0;blocked=false;last='';return null;}
   const cached=recovery();try{const {record}=await projectRequest('/'+id+'/'+part);revision=record?.revision||0;blocked=false;
    if(!remoteOnly&&cached?.dirty){if(cached.revision!==revision){blocked=true;onStatus('恢复稿与603版本冲突；请导出恢复稿后载入最新版本。');}else onStatus('已恢复未保存草稿，请保存版本。');return clone(cached.data);}
    last=record?JSON.stringify(record.data):'';if(record)cache({data:record.data,revision,dirty:false});return record?.data||null;
   }catch(e){if(e.status===410)throw e;if(cached&&!remoteOnly){revision=cached.revision||0;onStatus('603未连接，使用本机恢复稿：'+e.message);return cached.data;}throw e;}
  },initializeEmpty(data){if(revision===0&&!pending&&!blocked&&!last)last=JSON.stringify(data);},save(data){const serialized=JSON.stringify(data);if(!pending&&!blocked&&serialized===last)return Promise.resolve(revision);const snapshot=JSON.parse(serialized);const ticket=++generation;pending++;cache({revision,data:snapshot,dirty:true});queue=queue.catch(()=>{}).then(async()=>{
    if(blocked){const error=Error('保存冲突未解决，请先导出备份并载入最新版本。');error.status=409;throw error;}if(serialized===last){if(ticket===generation)cache({revision,data:snapshot,dirty:false});onStatus('已保存至603 · 修订 '+revision);return revision;}
    try{const {record}=await projectRequest('/'+id+'/'+part+'?ack=1',{data:snapshot,expectedRevision:revision});revision=record.revision;last=serialized;if(ticket===generation)cache({revision,data:snapshot,dirty:false});else{const current=recovery();if(current?.dirty)cache({...current,revision});}onStatus('已保存至603 · 修订 '+revision);return revision;}catch(e){if(e.status===409)blocked=true;onStatus('未保存到603：'+e.message);throw e;}
   }).finally(()=>{pending--;});return queue;},flush(){return queue},recovery};
}
