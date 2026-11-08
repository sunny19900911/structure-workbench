import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import {EXTENDED_COMMAND_ARGUMENTS} from '../../../office-word-extended-schema.js';
import {runExtended,checked} from '../../../office-word-extended.js';
test('unsafe link protocols and unsupported endnotes fail before any mutation',()=>{
 for(const url of ['javascript:alert(1)','file:///secret','data:text/html,x'])assert.throws(()=>runExtended({},'link.set',{url}));
 assert.throws(()=>runExtended({},'note.insert',{type:'endnote',content:'test'}),/尾注/);
 assert.throws(()=>checked({success:false,failure:{message:'没有可编辑范围'}}),/没有可编辑范围/);
});
test('page schemas require explicit section and bounded real dimensions',()=>{
 const ajv=new Ajv({strict:false});const margin=ajv.compile(EXTENDED_COMMAND_ARGUMENTS['page.margins']);
 assert.equal(margin({sectionId:'section-0',top:20,bottom:20,left:20,right:20}),true);
 for(const input of [{top:20},{sectionId:'section-0',top:-1,bottom:20,left:20,right:20},{sectionId:'section-0',top:20,bottom:20,left:20,right:Infinity}])assert.equal(margin(input),false);
 const note=ajv.compile(EXTENDED_COMMAND_ARGUMENTS['note.insert']);assert.equal(note({targetText:'原文',type:'endnote',content:'尾注'}),false);
 assert.equal(note({targetText:'原文',type:'footnote',content:'脚注'}),true);
});
