import test from 'node:test';
import assert from 'node:assert/strict';
import {officeConversionArgs} from '../../server/linux-office.mjs';

test('HTML以Writer模式导入并明确选择DOCX过滤器',()=>{
 const args=officeConversionArgs('/tmp/document.html','/tmp/out','docx','/tmp/profile');
 assert.ok(args.includes('--infilter=HTML (StarWriter)'));
 assert.equal(args[args.indexOf('--convert-to')+1],'docx:Office Open XML Text');
 assert.equal(args.at(-1),'/tmp/document.html');
});
test('DOCX转PDF不强制HTML导入，既有显式过滤器保留',()=>{
 const args=officeConversionArgs('/tmp/document.docx','/tmp/out','pdf','/tmp/profile');
 assert.ok(!args.some(a=>a.startsWith('--infilter')));
 assert.equal(args[args.indexOf('--convert-to')+1],'pdf');
 const custom=officeConversionArgs('/tmp/document.doc','/tmp/out','docx:Office Open XML Text','/tmp/profile');
 assert.equal(custom[custom.indexOf('--convert-to')+1],'docx:Office Open XML Text');
});
