import {REFERENCE_TABLES} from './reference-template-data.js';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function ensureDurabilityMeasures(){
 const root=document.querySelector('#paper1');if(!root||root.querySelector('#s1durability')||!root.querySelector('#s1ch2'))return;
 const heading=document.createElement('h2');heading.id='s1durability';heading.textContent='2.1 混凝土结构耐久性';
 const body=document.createElement('div');body.className='itbl';
 body.innerHTML='<table><tbody>'+REFERENCE_TABLES[5].rows.map((r,i)=>'<tr>'+r.map(c=>`<${i?'td':'th'} class="ce" contenteditable="true">${esc(c.text==='待定'?'':c.text)}</${i?'td':'th'}>`).join('')+'</tr>').join('')+'</tbody></table>';
 const anchor=root.querySelector('#s1ch3');if(anchor)anchor.before(heading,body);
}
