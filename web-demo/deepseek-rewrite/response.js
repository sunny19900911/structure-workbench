export async function readRewriteResponse(response,onProgress=()=>{},onDelta=()=>{}){
 if(response.status===401)throw Error('登录已失效，请刷新工作台重新登录后再发送');
 if(response.status===502||response.status===504)throw Error('网站改写服务连接超时，请重试；原文未改动');
 if(!response.headers.get('content-type')?.includes('application/x-ndjson')){
  let data;try{data=await response.json();}catch{throw Error('改写接口未就绪，请重启工作台服务后重试');}
  if(!response.ok)throw Error(data.error||'改写未完成');return data;
 }
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',result;
 const line=text=>{if(!text.trim())return;const event=JSON.parse(text);if(event.type==='error')throw Error(event.error);if(event.type==='progress')onProgress(event.message);if(event.type==='delta')onDelta(event.text);if(event.type==='result')result=event.data;};
 try{while(true){const {done,value}=await reader.read();buffer+=decoder.decode(value,{stream:!done});let split;while((split=buffer.indexOf('\n'))>=0){line(buffer.slice(0,split));buffer=buffer.slice(split+1);}if(result)break;if(done){line(buffer);break;}}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 if(!result)throw Error('连接已结束，但未收到改写正文。原文未改动，请重试');return result;
}
