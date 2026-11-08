import test from 'node:test';
import assert from 'node:assert/strict';
import {importedSourceCount} from '../../source-inventory.js';
test('counts imported documents even when no engineering fact was extracted',()=>{
  const inventory={projectId:'project-a',sources:[{source_id:'doc-a',hash:'sha-a',slot:'bldg'}]};
  assert.equal(importedSourceCount('project-a',inventory,{projectId:'project-a',sources:[],facts:[]}),1);
});
test('does not count location lookups, decisions, mapped copies or other projects',()=>{
  const current={projectId:'a',sources:[{source_id:'a',slot:'bldg',hash:'1'},{source_id:'b',slot:'lookup'},{source_id:'c',slot:'geo',origin:'decisions'}]};
  const expansion={projectId:'a',sources:[{source_id:'a',slot:'bldg',origin:'intake'},{source_id:'model',slot:'yjk',hash:'2'}]};
  assert.equal(importedSourceCount('a',current,expansion,{projectId:'b',sources:[{source_id:'unrelated',slot:'geo'}]}),2);
  assert.equal(importedSourceCount('b',current,expansion),0);
});
test('deduplicates ids and byte hashes without treating identical filenames as one source',()=>{
  const inventory={projectId:'a',sources:[{source_id:'one',hash:'h1',slot:'bldg',name:'说明.docx'},{source_id:'one',slot:'bldg'},{source_id:'copy',hash:'h1',slot:'geo'},{source_id:'two',hash:'h2',slot:'geo',name:'说明.docx'}]};
  assert.equal(importedSourceCount('a',inventory),2);
  assert.equal(inventory.sources.length,4);
});
