import test from 'node:test';
import assert from 'node:assert/strict';
import {localDeepSeekConfig} from '../../server/local-deepseek-config.mjs';
const fake='sk-testplaceholder00000000';
const io=text=>({existsSync:()=>true,statSync:()=>({size:100}),readFileSync:()=>Buffer.from(text)});
test('已有配置优先，未配置时从外部文件加载且不更改原对象',()=>{const original={DEEPSEEK_MODEL:'test'};assert.equal(localDeepSeekConfig(original,io('DeepSeek: '+fake)).DEEPSEEK_API_KEY,fake);assert.equal(original.DEEPSEEK_API_KEY,undefined);assert.equal(localDeepSeekConfig({DEEPSEEK_API_KEY:'existing'},{}).DEEPSEEK_API_KEY,'existing');assert.deepEqual(localDeepSeekConfig({}, {existsSync:()=>false}),{});});
test('多密钥和未知格式不猜测，报错不带文件内容',()=>{for(const value of ['private-invalid-text',fake+' sk-otherplaceholder00000'])assert.throws(()=>localDeepSeekConfig({},io(value)),e=>!e.message.includes(value)&&/唯一密钥/.test(e.message));});
test('支持带标注的UTF16文件',()=>{const deps=io('');deps.readFileSync=()=>Buffer.from('\ufeff'+fake,'utf16le');assert.equal(localDeepSeekConfig({},deps).DEEPSEEK_API_KEY,fake);});
