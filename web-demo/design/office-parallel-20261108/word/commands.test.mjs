import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import {spacingAttributes,WORD_COMMAND_ARGUMENTS} from '../../../office-word-commands.js';
import {normalizeNumberingNamespace} from '../../../office-word-export.js';

test('list export namespace repair is narrow and idempotent',()=>{
 const source='<w:numbering xmlns:w="w"><w:abstractNum w15:restartNumberingAfterBreak="0"/></w:numbering>';
 const fixed=normalizeNumberingNamespace(source);
 assert.match(fixed,/xmlns:w15="http:\/\/schemas.microsoft.com\/office\/word\/2012\/wordml"/);
 assert.equal(normalizeNumberingNamespace(fixed),fixed);
 const ordinary='<w:numbering xmlns:w="w"/>';
 assert.equal(normalizeNumberingNamespace(ordinary),ordinary);
});

test('partial spacing edits preserve unrelated attributes and convert points/multiples to OOXML units',()=>{
 assert.deepEqual(spacingAttributes({before:6,after:0,line:1.5}),{
  'paragraphProperties.spacing.before':120,'paragraphProperties.spacing.beforeAutospacing':false,
  'paragraphProperties.spacing.after':0,'paragraphProperties.spacing.afterAutospacing':false,
  'paragraphProperties.spacing.line':360,'paragraphProperties.spacing.lineRule':'auto'
 });
 assert.equal(Object.hasOwn(spacingAttributes({before:12}),'paragraphProperties.spacing.after'),false);
});
test('invalid spacing cannot silently become zero or nonfinite XML values',()=>{
 for(const args of [{},{before:-1},{after:73},{line:0},{line:4},{line:NaN},{before:Infinity},{before:'6'},{before:null}])assert.throws(()=>spacingAttributes(args));
});
test('MCP extension requires a unique target and validates spacing arguments',()=>{
 const ajv=new Ajv({strict:false});
 for(const [name,schema] of Object.entries(WORD_COMMAND_ARGUMENTS)){
  const validate=ajv.compile(schema),args={targetText:'原文',...(name==='paragraph.spacing'?{before:6}:name==='paragraph.style'?{style:'Normal'}:['format.color','format.highlight'].includes(name)?{color:'#112233'}:{})};
  assert.equal(validate(args),true,name);
  assert.equal(validate({...args,targetText:''}),false,name);
  assert.equal(validate({...args,arbitraryScript:'no'}),false,name);
 }
 const validate=ajv.compile(WORD_COMMAND_ARGUMENTS['paragraph.spacing']);
 for(const args of [{targetText:'原文'},{targetText:'原文',line:4},{targetText:'原文',after:-1}])assert.equal(validate(args),false);
});
