import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../parallel-tasks/06-ppt-report/cafeteria-export.js',import.meta.url),'utf8');
function setup(hasButton=true,parentMode='none'){
  const links=[],revoked=[],listeners={};let next=0;
  const attach=link=>{link.attached=true;links.push(link);};
  const makeLink=owner=>({owner,style:{},attached:false,clicks:0,setAttribute(name,value){this[name]=value;},click(){assert.equal(this.attached,true,'the anchor must be attached before automatic click');this.clicks++;},remove(){this.attached=false;}});
  const context={URL:{createObjectURL:()=>`blob:test-${++next}`,revokeObjectURL:url=>revoked.push(url)},window:{addEventListener:(name,fn)=>{listeners[name]=fn;}},document:{
    createElement(tag){assert.equal(tag,'a');return makeLink('iframe');},
    querySelector(selector){assert.equal(selector,'#generate-btn');return hasButton?{after:attach}:null;},body:{append:attach}
  }};
  if(parentMode==='same-origin'||parentMode==='same-origin-no-host')context.window.parent={URL:{createObjectURL:()=>`blob:parent-${++next}`,revokeObjectURL:url=>revoked.push('parent:'+url)},document:{
    createElement(tag){assert.equal(tag,'a');return makeLink('parent');},
    querySelector(selector){assert.equal(selector,'#im-ppt-host');return parentMode==='same-origin'?{before:attach}:null;},body:{prepend:attach}
  }};
  if(parentMode==='cross-origin')context.window.parent={get document(){throw new Error('SecurityError');}};
  vm.createContext(context);
  vm.runInContext(source.replace(/\bexport /g,'').replace(/import\.meta\.url/g,'"file:///test/cafeteria-export.js"'),context);
  return {context,links,revoked,listeners};
}

test('PPT export keeps one attached, explicitly clickable download until replaced or page closed',()=>{
  const {context,links,revoked,listeners}=setup();
  const first=context.offerCafeteriaDownload({},'验收/项目:*?');
  assert.equal(first.filename,'验收_项目____扩初汇报.pptx');
  assert.equal(links[0].textContent,'保存已生成的 PPT');
  assert.equal(links[0].clicks,1);
  assert.equal(links[0].attached,true);
  assert.deepEqual(revoked,[],'do not revoke while WebView or user is starting the download');
  links[0].click();assert.equal(links[0].clicks,2,'direct user click remains available');
  context.offerCafeteriaDownload({},'第二次');
  assert.equal(links[0].attached,false);assert.equal(links[1].attached,true);
  assert.deepEqual(revoked,['blob:test-1']);
  listeners.pagehide();
  assert.equal(links[1].attached,false);assert.deepEqual(revoked,['blob:test-1','blob:test-2']);
  listeners.pagehide();assert.equal(revoked.length,2);
});

test('download fallback attaches to body if the editor button is absent',()=>{
  const {context,links}=setup(false);
  assert.equal(context.offerCafeteriaDownload({},'').filename,'结构设计_扩初汇报.pptx');
  assert.equal(links[0].attached,true);assert.equal(links[0].clicks,1);
});

test('same-origin iframe delegates the link and blob URL to the parent and releases through that owner',()=>{
  for(const mode of ['same-origin','same-origin-no-host']){
    const {context,links,revoked,listeners}=setup(true,mode);
    context.offerCafeteriaDownload({},'父页面验收');
    assert.equal(links[0].owner,'parent');assert.equal(links[0].href,'blob:parent-1');
    assert.equal(links[0].attached,true);assert.equal(links[0].clicks,1);
    assert.ok(links[0].style.cssText.includes('display:inline-block'));
    links[0].click();assert.equal(links[0].clicks,2);
    context.offerCafeteriaDownload({},'再次生成');
    assert.equal(links[0].attached,false);assert.deepEqual(revoked,['parent:blob:parent-1']);
    listeners.pagehide();assert.deepEqual(revoked,['parent:blob:parent-1','parent:blob:parent-2']);
  }
});

test('cross-origin iframe stays within its own document without exposing a messaging interface',()=>{
  const {context,links,revoked,listeners}=setup(true,'cross-origin');
  context.offerCafeteriaDownload({},'跨源验收');
  assert.equal(links[0].owner,'iframe');assert.equal(links[0].href,'blob:test-1');
  listeners.pagehide();assert.deepEqual(revoked,['blob:test-1']);
});
