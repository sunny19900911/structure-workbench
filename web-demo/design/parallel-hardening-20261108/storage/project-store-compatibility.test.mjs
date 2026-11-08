import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {Document,Packer,Paragraph} from 'docx';
import {readPart,writePart} from '../../../server/project-store.mjs';
import {createProjectArchive,importProjectArchive,portableProjectPaths} from '../../../server/portable-projects.mjs';
import {createOfficeDocumentStore} from '../../../server/office-document-store.mjs';

const base=fileURLToPath(new URL('../../../qa/parallel-hardening/storage/compatibility/',import.meta.url));
await mkdir(base,{recursive:true});
const root=await mkdtemp(join(base,'run-'));
const project=randomUUID().replaceAll('-','');
const env={WORKBENCH_DATABASE_ROOT:join(root,'source'),WORKBENCH_PROJECT_STORE:join(root,'source','projects'),CALCBOOK_SOURCE_DIR:join(root,'empty-templates')};
const paths=portableProjectPaths(env);

test('原生项目包带Word人工稿和全部历史跨项目导入，导入后修订与删除恢复正常',async()=>{
 await mkdir(env.CALCBOOK_SOURCE_DIR,{recursive:true});
 await writePart(paths.store,project,'main',{parameters:{project_name:'隔离兼容测试'},projectId:project},0);
 await writePart(paths.store,project,'main',{parameters:{project_name:'更名后'},projectId:project},1);
 await writePart(paths.store,project,'expansion-unit',{identity:{project_id:project,unit:'一号楼'},body:'人工扩初稿',signed:{body:'签发快照'}},0);
 const office=createOfficeDocumentStore(env);
 const bytes=await Packer.toBuffer(new Document({sections:[{children:[new Paragraph('合成的人工Word稿')]}]}));
 const document=await office.create({projectId:project,unit:'一号楼',type:'docx',title:'合成验收',bytes,origin:'manual'});
 const archive=await createProjectArchive(project,env);
 // Keep the synthetic archive in this isolated QA root for inspection.
 const destination={WORKBENCH_DATABASE_ROOT:join(root,'destination'),WORKBENCH_PROJECT_STORE:join(root,'destination','projects')};
 const imported=await importProjectArchive(archive.file,destination),target=portableProjectPaths(destination);
 const main=await readPart(target.store,imported.projectId,'main');
 assert.equal(main.revision,2);assert.equal(main.data.projectId,imported.projectId);
 assert.equal((await readdir(join(target.store,imported.projectId,'main'))).length,2);
 const expansion=await readPart(target.store,imported.projectId,'expansion-unit');
 assert.equal(expansion.data.identity.project_id,imported.projectId);assert.equal(expansion.data.body,'人工扩初稿');assert.equal(expansion.data.signed.body,'签发快照');
 assert.deepEqual((await createOfficeDocumentStore(destination).read(imported.projectId,document.documentId)).bytes,bytes);
 assert.equal((await writePart(target.store,imported.projectId,'main',{...main.data,note:'导入后保存'},2)).revision,3);
 await writePart(target.store,imported.projectId,'lifecycle',{deleted:true},0);
 await assert.rejects(writePart(target.store,imported.projectId,'main',{text:'旧窗口'},3),{status:410});
 await writePart(target.store,imported.projectId,'lifecycle',{deleted:false},1);
 assert.equal((await writePart(target.store,imported.projectId,'main',{text:'恢复后'},3)).revision,4);
 assert.equal((await readPart(paths.store,project,'main')).revision,2);
});

test('保留损坏历史时旧项目包导出明确失败，不把不完整包称作完整备份',async()=>{
 const directory=join(paths.store,project,'main'),names=(await readdir(directory)).filter(n=>n.endsWith('.json')).sort();
 const broken=join(directory,names.at(-1));await writeFile(broken,'{');
 const recovered=await readPart(paths.store,project,'main');assert.equal(recovered.revision,3);
 await writePart(paths.store,project,'main',{...recovered.data,note:'恢复后'},3);
 await assert.rejects(createProjectArchive(project,env),SyntaxError);
 assert.equal(await readFile(broken,'utf8'),'{');
});
