// Windows may reserve an otherwise unused TCP port (EACCES).
// Keep the service lock while trying alternatives; never disturb another listener.
export async function listenLocal(server,preferred,{range=20}={}){
 const ports=Array.from({length:Math.min(range,65536-preferred)},(_,i)=>preferred+i);
 ports.push(0); // Ask the OS for an available loopback port if the whole range is unavailable.
 for(const port of ports){
  try{
   await new Promise((resolve,reject)=>{
    const failed=error=>{server.removeListener('listening',ready);reject(error);};
    const ready=()=>{server.removeListener('error',failed);resolve();};
    server.once('error',failed);server.once('listening',ready);
    server.listen(port,'127.0.0.1');
   });
   return server.address().port;
  }catch(error){if(port===0||!['EADDRINUSE','EACCES'].includes(error.code))throw error;}
 }
}
