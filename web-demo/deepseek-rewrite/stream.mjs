// Consume the provider stream, forwarding only answer text, never reasoning content.
export async function readAnswerStream(response,onDelta=()=>{}){
 if(!response.body)throw Error('DeepSeek 未返回内容');
 const reader=response.body.getReader(),decoder=new TextDecoder();
 let buffer='',text='',finish='',model='';
 function line(line){
  if(!line.startsWith('data:'))return;
  const data=line.slice(5).trim();if(!data||data==='[DONE]')return;
  const chunk=JSON.parse(data);if(chunk.error)throw Error('DeepSeek 生成中断，请重试');
  model=chunk.model||model;const choice=chunk.choices?.[0];
  if(choice?.finish_reason)finish=choice.finish_reason;
  const delta=choice?.delta?.content;
  if(typeof delta==='string'&&delta){text+=delta;if(text.length>12000)throw Error('回复过长，请缩小改写范围');onDelta(delta);}
 }
 try{while(true){const {done,value}=await reader.read();buffer+=decoder.decode(value,{stream:!done});let n;while((n=buffer.indexOf('\n'))>=0){line(buffer.slice(0,n).replace(/\r$/,''));buffer=buffer.slice(n+1);}if(finish)break;if(done){line(buffer);break;}}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 if(finish!=='stop'||!text.trim())throw Error('回复未完整返回，原文未改动，请重试');
 return {text,model};
}
