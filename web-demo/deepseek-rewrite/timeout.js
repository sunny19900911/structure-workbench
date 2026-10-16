export async function bounded(task,{signal,timeoutMs,message='请求超时'}={}){
 const controller=new AbortController();
 const combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
 let timer,abort;
 try{
  return await Promise.race([
   Promise.resolve().then(()=>{combined.throwIfAborted();return task(combined);}),
   new Promise((_,reject)=>{
    abort=()=>reject(combined.reason||Error('已停止'));
    combined.addEventListener('abort',abort,{once:true});
    if(combined.aborted)abort();
    timer=setTimeout(()=>controller.abort(Error(message)),timeoutMs);
   })
  ]);
 }finally{clearTimeout(timer);combined.removeEventListener('abort',abort);}
}
