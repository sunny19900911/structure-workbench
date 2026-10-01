export const clone=value=>JSON.parse(JSON.stringify(value));
export const newProjectId=()=>crypto.randomUUID().replaceAll('-','');
export async function projectRequest(path,data){const r=await fetch('/api/workbench-projects'+path,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Workbench-Request':'project-store'},...(data===undefined?{}:{body:JSON.stringify(data)})});const result=await r.json();if(!r.ok){const error=Error(result.error||'项目服务不可用');error.status=r.status;throw error;}return result;}
export function projectPart(id,part,onStatus=()=>{}){
 const key='wb:recovery:v1:'+id+':'+part;let revision=0,blocked=false,queue=Promise.resolve(),last='',generation=0;
 const recovery=()=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}};
 const cache=value=>{try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{onStatus('浏览器恢复空间不足，请保持页面打开并保存到603。');return false;}};
 return {key,get revision(){return revision},get blocked(){return blocked},async load({remoteOnly=false}={}){
   const cached=recovery();try{const {record}=await projectRequest('/'+id+'/'+part);revision=record?.revision||0;blocked=false;
    if(!remoteOnly&&cached?.dirty){if(cached.revision!==revision){blocked=true;onStatus('恢复稿与603版本冲突；请导出恢复稿后载入最新版本。');}else onStatus('已恢复未保存草稿，请保存版本。');return clone(cached.data);}
    last=record?JSON.stringify(record.data):'';if(record)cache({data:record.data,revision,dirty:false});return record?.data||null;
   }catch(e){if(cached&&!remoteOnly){revision=cached.revision||0;onStatus('603未连接，使用本机恢复稿：'+e.message);return cached.data;}throw e;}
  },save(data){const snapshot=clone(data),serialized=JSON.stringify(snapshot),ticket=++generation;cache({revision,data:snapshot,dirty:true});queue=queue.catch(()=>{}).then(async()=>{
    if(blocked)throw Error('保存冲突未解决，请先导出备份并载入最新版本。');if(serialized===last){if(ticket===generation)cache({revision,data:snapshot,dirty:false});onStatus('已保存至603 · 修订 '+revision);return revision;}
    try{const {record}=await projectRequest('/'+id+'/'+part,{data:snapshot,expectedRevision:revision});revision=record.revision;last=serialized;if(ticket===generation)cache({revision,data:snapshot,dirty:false});else{const current=recovery();if(current?.dirty)cache({...current,revision});}onStatus('已保存至603 · 修订 '+revision);return revision;}catch(e){if(e.status===409)blocked=true;onStatus('未保存到603：'+e.message);throw e;}
   });return queue;},flush(){return queue},recovery};
}
