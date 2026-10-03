// Source transcription: local GB 50011 (2016) pp48–50 + 2024 amendment; JGJ3 pp9–10,21–23.
export const GRADE_VERSION='2026-10-03.1';
export const GRADE_SOURCES={gb:'GB-T50011-2024-6.1.2',jgj:'JGJ3-2010-3.9.3'};
export const SYSTEMS=['混凝土框架结构','混凝土框架-剪力墙结构','混凝土剪力墙结构','部分框支剪力墙结构','框架-核心筒结构','筒中筒结构','板柱-剪力墙结构'];
const levels=['特一级','一级','二级','三级','四级'];
const number=x=>String(x??'').trim()!==''&&/^\d+(?:\.\d+)?$/.test(String(x).trim())?Number(x):null;
export function structureKind(text){const s=String(text||'').replace(/抗震墙/g,'剪力墙').replace(/[—－–]/g,'-');if(/钢框架|钢结构|异形柱|装配|砌体|木结构|型钢/.test(s))return '';if(/部分框支/.test(s))return 'transfer';if(/框架.*核心筒/.test(s))return 'core';if(/筒中筒/.test(s))return 'tube';if(/板柱.*剪力墙/.test(s))return 'slab';if(/框架.*剪力墙|框剪/.test(s))return 'dual';if(/剪力墙/.test(s))return 'wall';if(/框架/.test(s))return 'frame';return '';}
const limits={frame:[60,50,40,35,24],dual:[130,120,100,80,50],wall:[140,120,100,80,60],transfer:[120,100,80,50,0],core:[150,130,100,90,70],tube:[180,150,120,100,80],slab:[80,70,55,40,0]};
function maxHeight(kind,intensity,pga,basis){if(basis==='jgj'&&kind==='frame'&&intensity===9)return 0;return limits[kind][intensity===6?0:intensity===7?1:intensity===8?(pga===.3?3:2):4];}
// Values are table cells (numeric grade; 1 is stronger than 2). Do not infer material/system from height.
export function tableGrades(kind,h,i,basis='gb',large=false){
 const low=basis==='gb'&&h<=24;let frame=null,wall=null,wallBase=null;
 if(kind==='frame')frame=large?({6:3,7:2,8:1,9:1})[i]:({6:low?4:3,7:low?3:2,8:low?2:1,9:1})[i];
 if(kind==='dual'){frame=({6:h<=60?4:3,7:low?4:h<=60?3:2,8:low?3:h<=60?2:1,9:low?2:1})[i];wall=({6:3,7:low?3:2,8:low?2:1,9:1})[i];}
 if(kind==='wall')wall=({6:h<=80?4:3,7:low?4:h<=80?3:2,8:low?3:h<=80?2:1,9:low?2:1})[i];
 if(kind==='transfer'&&i!==9){frame=({6:2,7:h<=80?2:1,8:1})[i];wall=({6:h<=80?4:3,7:low?4:h<=80?3:2,8:low?3:2})[i];wallBase=({6:h<=80?3:2,7:low?3:h<=80?2:1,8:low?2:1})[i];}
 if(kind==='core'){frame=({6:3,7:2,8:1,9:1})[i];wall=({6:2,7:2,8:1,9:1})[i];}
 if(kind==='tube')wall=({6:3,7:2,8:1,9:1})[i];
 if(kind==='slab'&&i!==9){frame=({6:h<=35?3:2,7:2,8:1})[i];wall=({6:2,7:h<=35?2:1,8:1})[i];}
 return {frame,wall,wallBase};
}
const stronger=(a,b)=>a==null?b:b==null?a:Math.min(a,b);
const words=g=>g==null?'':levels[g];
export function seismicGrade(input={}){
 const h=number(input.height),i=number(input.intensity),pga=number(String(input.pga||'').replace(/g$/i,'')),span=number(input.span);
 const cat=/乙|重点/.test(input.category)?'B':/丙|标准/.test(input.category)?'C':/甲|特殊/.test(input.category)?'A':/丁|适度/.test(input.category)?'D':'';
 let kind=structureKind(input.structure),basis=input.basis||'auto';
 const notices=[],missing=[];if(h===null||h<=0)missing.push('房屋高度');if(!kind)missing.push('支持的现浇混凝土结构形式');if(![6,7,8,9].includes(i))missing.push('设防烈度');if(!cat)missing.push('设防类别');
 const result={version:GRADE_VERSION,status:'incomplete',basis,source_id:'',frame:'',wall:'',frameDetail:'',wallDetail:'',wallBase:'',largeFrame:'',notices,missing,basement:[]};
 if(missing.length)return result;
 if(basis==='auto'){if(input.buildingUse==='residential'){const floors=number(input.floors);if(h<=28&&floors===null){missing.push('住宅地上层数');return result;}basis=h>28||floors>=10?'jgj':'gb';}else basis=h>24?'jgj':'gb';}
 if(!['gb','jgj'].includes(basis)){missing.push('查表依据');return result;}
 Object.assign(result,{basis,source_id:GRADE_SOURCES[basis]});
 const stop=msg=>{result.status='special';notices.push(msg);return result;};
 if(cat==='A'||cat==='D')return stop('甲、丁类按专项设防要求确定，本表不自动套用丙类结果。');
 if(input.special==='isolation'||input.isolated===true)return stop('减隔震结构按专项设计确定，本表不自动降低抗震等级。');
 if(input.heightClass==='B')return stop('B级高度应另查表3.9.4，本次不套用A级表。');
 if(i===8&&pga===null){missing.push('8度设计基本地震加速度（0.20g或0.30g）');return result;}
 if(pga!==null&&!({6:[.05],7:[.1,.15],8:[.2,.3],9:[.4]})[i].includes(pga))return stop('设防烈度与设计基本地震加速度不一致。');
 let effectiveKind=kind;
 if(input.special==='fewWalls'){
  const ratio=number(input.frameMomentPercent);if(ratio===null||ratio<0||ratio>100){missing.push('底层框架地震倾覆力矩百分比');return result;}
  if(!['frame','dual'].includes(kind))return stop('少墙框架条件仅用于框架与框架-剪力墙体系。');
  if(ratio>50){effectiveKind='frame';notices.push('底层框架地震倾覆力矩占比>50%，框架按框架结构查表，墙采用同等级。');}
 }
 if(input.coreAsDual==='yes'&&kind==='core'){if(h>60)return stop('框架-核心筒按框剪查表仅适用于高度不超过60m且按框剪要求设计。');effectiveKind='dual';notices.push('已选择按框架-剪力墙要求设计（高度≤60m）。');}
 const maximum=maxHeight(effectiveKind,i,pga,basis);
 if(maximum===0||h>maximum)return stop(maximum?`高度超过当前体系${maximum}m适用上限，应专项确定；高层可能涉及B级高度。`:'当前烈度下该体系不在本次表格适用范围。');
 const raised=cat==='B'?i+1:i,lookup=Math.min(9,raised);
 let calc=tableGrades(effectiveKind,h,lookup,basis,span!==null&&span>=18);
 if(effectiveKind==='frame'&&input.special==='fewWalls')calc.wall=calc.frame;
 if(raised>9){if(basis!=='jgj')return stop('9度乙类须采用高于9度的措施，不能直接套一级。');calc=Object.fromEntries(Object.entries(calc).map(([k,v])=>[k,v==null?null:0]));notices.push('A级高度9度乙类按特一级采用（JGJ3第3.9.3条）。');}
 if(calc.frame==null&&calc.wall==null)return stop('提高一度后的结构类型无表内等级，需专项确定。');
 const site=String(input.site||'').replace(/\s|类/g,'').replace(/Ⅳ/g,'IV').replace(/Ⅲ/g,'III').replace(/Ⅱ/g,'II').replace(/Ⅰ/g,'I');
 let detailIntensity=lookup,detailAboveNine=false;
 if(['III','IV'].includes(site)&&[.15,.3].includes(pga)){detailAboveNine=i+1+(cat==='B'?1:0)>9;detailIntensity=Math.min(9,i+1+(cat==='B'?1:0));notices.push('Ⅲ、Ⅳ类场地0.15g/0.30g按提高一度的构造要求查表，计算等级不因此降低。');}
 // I-class reduction is permitted, not automatic. Only apply on explicit choice.
 if(input.reduceSiteI==='yes'){
  if(!['I','I0','I1'].includes(site))return stop('仅Ⅰ类场地允许选择构造措施降低一度。');
  detailIntensity=Math.max(6,raised-1);notices.push('Ⅰ类场地仅构造措施降低一度，计算等级保持。');
 }
 let detailing=tableGrades(effectiveKind,h,detailIntensity,basis,span!==null&&span>=18);
 if(effectiveKind==='frame'&&input.special==='fewWalls')detailing.wall=detailing.frame;
 if(raised>9&&input.reduceSiteI!=='yes')detailing={...calc};
 if(detailAboveNine&&basis==='jgj')detailing=Object.fromEntries(Object.entries(detailing).map(([k,v])=>[k,v==null?null:0]));
 let strongerDetail=detailAboveNine&&basis==='gb';if(strongerDetail)notices.push('场地与乙类要求叠加超过9度，构造措施须高于9度要求，不能直接以一级视为充分。');
 if(cat==='B'&&i<9&&h>maxHeight(effectiveKind,lookup,lookup===8?.2:null,basis)){strongerDetail=true;notices.push(basis==='gb'?'提高一度后超过表内高度上界，须采取比一级更有效的抗震构造措施。':'提高一度后超过对应适用高度，须采取比对应等级更有效的抗震构造措施（3.9.7）。');}
 if(detailIntensity>i&&h>maxHeight(effectiveKind,detailIntensity,detailIntensity===8?.2:null,basis))strongerDetail=true;
 if(input.special==='podium'){
  for(const key of ['frame','wall'])if(calc[key]!=null){const g=levels.indexOf(input[key==='frame'?'mainFrame':'mainWall']);if(g<0){missing.push('相连主楼'+(key==='frame'?'框架':'墙')+'等级');return result;}calc[key]=stronger(calc[key],g);detailing[key]=stronger(detailing[key],g);}
  notices.push('裙房相关范围取自身与主楼较高等级；主楼在裙房顶板上下各一层另加强构造。');
 }
 Object.assign(result,{status:'ready',effectiveIntensity:lookup,frame:words(calc.frame),wall:words(calc.wall),wallBase:words(calc.wallBase),frameDetail:words(detailing.frame),wallDetail:words(detailing.wall),largeFrame:effectiveKind==='frame'&&span>=18?words(calc.frame):''});
 if(!['I','I0','I1','II','III','IV'].includes(site)){result.frameDetail='';result.wallDetail='';notices.push('场地类别未定，构造措施等级留空。');}
 if(['III','IV'].includes(site)&&pga===null){result.frameDetail='';result.wallDetail='';notices.push('Ⅲ、Ⅳ类场地须补充基本地震加速度后确定构造措施。');}
 if(strongerDetail){if(result.frameDetail)result.frameDetail+='；需更有效构造措施';if(result.wallDetail)result.wallDetail+='；需更有效构造措施';}
 if([24,35,60,80].includes(h))notices.push('位于高度分界，当前显示表内≤分支；需结合不规则程度、场地及地基确定边界取值。');
 if(basis==='gb'&&h>24&&h<25)notices.push('24m与25m之间按较高高度分支生成草案。');
 if(span===null&&effectiveKind==='frame')notices.push('当前按普通框架；存在跨度≥18m的框架时填入跨度。');
 const count=number(input.basements);
 if(input.basementFixed==='yes'&&Number.isInteger(count)&&count>0&&count<=20){for(let n=1;n<=count;n++)result.basement.push({floor:'地下'+n+'层',frame:n===1?result.frame:'',wall:n===1?result.wall:'',frameDetail:strongerDetail?'专项确定':result.frameDetail?words(Math.min(4,detailing.frame+n-1)):'',wallDetail:strongerDetail?'专项确定':result.wallDetail?words(Math.min(4,detailing.wall+n-1)):''});notices.push('地下二层及以下仅列可采用的构造等级；计算等级不自动逐层降低。');}
 return result;
}
export const gradeParameterValues=r=>({g_frame:r.frame||'',g_wall:r.wall||'',g_frame_m:r.frameDetail||'',g_wall_m:r.wallDetail||'',g_bigspan:r.largeFrame||'',seismic_grade_basis:r.source_id,seismic_grade_note:r.notices.join('；')});
export function gradeInput(config={},parameters={}){return {...config,intensity:config.intensity||parameters.intensity,pga:config.pga||parameters.pga,category:config.category||parameters.seismic_cat,site:config.site||parameters.site_class,isolated:config.special==='ordinary'?false:config.special==='isolation'||['是','有','采用','1','true'].includes(String(parameters.has_iso))||['是','有','采用','1','true'].includes(String(parameters.has_damp))};}
export function gradeParameters(config,parameters={}){if(!config)return {};const r=seismicGrade(gradeInput(config,parameters));return {...gradeParameterValues(r),...(config.structure?{struct_sys:config.structure}:{})};}
