import test from 'node:test';
import assert from 'node:assert/strict';
import {documentKind,isModelFile} from './intake-routing.js';
test('匿名建筑地勘按正文标题归类；明确正文优先于错误文件名',()=>{
 assert.equal(documentKind('001.docx','岩土工程勘察报告\n场地概况'),'geo');
 assert.equal(documentKind('建筑.docx','岩土工程勘察报告\n场地概况'),'geo');
 assert.equal(documentKind('002.pdf','建筑设计总说明\n本工程地下水条件详地勘'),'bldg');
 assert.equal(documentKind('地勘.docx','建筑设计总说明\n项目概况'),'bldg');
});
test('无正文标题复用明确文件名；未知与混合文件不默认归建筑',()=>{
 assert.equal(documentKind('场地岩土资料.doc','工程概况'),'geo');
 assert.equal(documentKind('建施设计资料.pdf','工程概况'),'bldg');
 assert.equal(documentKind('资料.docx','工程概况\n地下水位\n建筑面积'),null);
 assert.equal(documentKind('综合说明.docx','建筑设计总说明\n岩土工程勘察报告'),null);
});
test('OUT、DAT及已知模型TXT归模型；建筑正文提及模型不误归类',()=>{
 for(const name of ['WMASS.OUT','WDISP.dat','WZQ.txt'])assert.equal(isModelFile(name),true);
 assert.equal(isModelFile('结果.txt','结构总质量 1250'),true);
 assert.equal(isModelFile('建筑.txt','建筑设计总说明：结构模型由结构专业提供'),false);
 assert.equal(isModelFile('报告.docx','结构总质量'),false);
});
