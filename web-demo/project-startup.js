export async function openInitialProject(active,{load,list,create}){
 if(!/^[a-f0-9]{32}$/.test(active||''))return create();
 try{return await load(active);}catch(e){
  if(e.status!==410&&e.status!==404)throw e;
  const {projects}=await list();
  if(projects.length)return load(projects[0].id);
  return create();
 }
}
