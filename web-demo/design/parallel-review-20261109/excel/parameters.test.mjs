import test from 'node:test';
import assert from 'node:assert/strict';
import {workbookParameters,parameterInput} from '../../../office-excel-parameters.js';
test('parameter picker requires generated parameter headers and preserves unavailable results',()=>{
 const cells=[['A2','参数'],['B2','取值'],['A3','高度'],['B3','24'],['C3','m'],['A10','待计算'],['B10','=UNKNOWN(1)']].map(([address,text])=>({address,text,value:text}));
 cells.at(-1).calculationStatus='unsupported';cells.at(-1).value=null;
 const view={sheets:[{name:'项目参数',cells}]},parameters=workbookParameters(view);
 assert.equal(parameters.length,2);assert.deepEqual(parameters[0],{id:'A3',name:'高度',value:'24',unit:'m',available:true});assert.equal(parameters[1].available,false);
 cells[0].text='任意表头';assert.deepEqual(workbookParameters(view),[]);
});
test('parameter insertion keeps formula-like literals and leading-zero identifiers without adding a quote to text-formatted cells',()=>{
 for(const v of ['=保留原文',"'原文",'0012','TRUE']){assert.equal(parameterInput(v),"'"+v);assert.equal(parameterInput(v,true),v);}
 assert.equal(parameterInput('24'),'24');assert.equal(parameterInput('0.25'),'0.25');assert.equal(parameterInput(24),'24');assert.equal(parameterInput(false),'FALSE');
});
