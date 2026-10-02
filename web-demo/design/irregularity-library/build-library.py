from pathlib import Path
import json
root=Path(__file__).resolve().parents[2];folder=root/'design/irregularity-library';docs=json.loads((root/'qa/irregularity-library/extracted.json').read_text(encoding='utf-8'));by={d['file'][:2]:d for d in docs}
# Ranges are one-based extraction block positions, reviewed against each named section.
ranges={
 'torsion':[('11','10.2',5259,5259),('13','9.2',2136,2136),('14','9.2.1',819,821),('21','10.2.1',327,329),('31','12.1',766,769),('32','不规则结构的加强措施 1',482,485),('42','针对扭转不规则的应对措施',229,232)],
 'reentrant':[('11','10.2',5260,5260),('12','4.1 分析说明 凹凸不规则',117,119),('13','9.2',2137,2137),('14','9.2.2',823,826),('21','10.2.2',331,334),('31','12.2',771,775),('32','不规则结构的加强措施 2',487,491)],
 'diaphragm':[('11','10.2',5261,5261),('13','9.2',2138,2138),('14','9.2.3',828,831),('21','10.2.3',336,339),('31','12.3',777,781),('32','不规则结构的加强措施 2',487,491),('42','针对楼板不连续的应对措施',234,236)],
 'stiffness':[('13','9.2',2139,2139),('32','不规则结构的加强措施 5',500,501)],
 'vertical':[('13','9.2',2140,2140),('21','10.2.6 局部梁托柱',351,354),('31','12.5 转换梁、转换柱',788,791),('32','不规则结构的加强措施 3',493,495)],
 'capacity':[]}
ranges['torsion'] += [('44','6.4.1',652,654),('45','15.1',1172,1175)]
ranges['reentrant'] += [('44','6.4.2',656,659),('45','15.2',1177,1181)]
ranges['diaphragm'] += [('44','6.4.3',661,664),('45','15.3',1183,1187)]
ranges['vertical'] += [('44','6.4.6 局部梁托柱',676,681)]
names=['扭转不规则','凹凸不规则','楼板不连续','侧向刚度不规则','竖向抗侧力构件不连续','楼层承载力突变']
common={
 'torsion':'（1）适当加强结构周边抗侧力结构的刚度，提高整体结构的抗扭刚度，尽量降低结构扭转反应。\n（2）采用考虑平扭耦联的振型分解反应谱法进行结构计算。\n（3）地震作用计算考虑双向地震作用和偶然偏心。',
 'reentrant':'（1）相关范围的楼板采用弹性膜单元模拟，分析楼板实际刚度对结构内力分配的影响。\n（2）凹口处连接薄弱部位及局部凸出部位根部楼板适当加厚，配筋双层双向拉通并加强。\n（3）凹口处梁按拉弯、压弯构件设计，加强拉通筋、腰筋、锚固及箍筋。\n（4）对凹凸处及薄弱部位楼板进行应力分析，并据此进行配筋设计。',
 'diaphragm':'（1）大开洞周边及连接薄弱部位楼板采用弹性膜单元模拟，并进行楼板应力分析。\n（2）相关范围楼板适当加厚，配筋双层双向拉通并加强。\n（3）大洞口周边梁或连接薄弱部位的侧梁按拉弯、压弯构件设计，并加强相应构造。',
 'stiffness':'（1）对侧向刚度不规则楼层的地震作用进行调整，调整系数采用本项目适用标准及计算要求。\n（2）补充动力弹性时程分析。',
 'vertical':'（1）对转换构件进行地震作用调整，并考虑竖向地震作用。\n（2）转换柱根部两个方向设置梁约束，复核转换梁截面及配筋。\n（3）支撑柱、转换梁按转换构件采取加强措施，抗震等级及性能目标采用本项目设计要求。',
 'capacity':''}
cats=[]
for i,(key,rs) in enumerate(ranges.items()):
 cases=[]
 for prefix,section,a,b in rs:
  d=by[prefix];sid='HISTORY-IRREG-'+prefix+'-'+key
  cases.append({'id':sid,'source_id':sid,'statement':'原文事实','file':d['file'],'path':d['path'],'sha256':d['sha256'],'section':section,'locator':f'提取块 {a}–{b}','scope':'高层超限历史案例' if prefix in ['31','45'] else '历史项目案例（原项目参数）','text':'\n'.join(d['rows'][a-1:b])})
 cats.append({'id':key,'rowSource':i+1,'name':names[i],'common':{'text':common[key],'statement':'AI推断','source_ids':[c['source_id'] for c in cases],'note':'历史措施归纳稿；具体限值和性能目标不沿用历史数值。'},'cases':cases,'missing':not bool(cases)})
lib={'version':1,'source_id':'USER-20261002-IRREGULARITY-LIBRARY','categories':cats}
(root/'irregularity-library-data.js').write_text('export const IRREGULARITY_LIBRARY='+json.dumps(lib,ensure_ascii=False,indent=2)+';\n',encoding='utf-8')
manifest=[{'file':d['file'],'path':d['path'],'sha256':d['sha256'],'blocks':len(d['rows']),'adopted_sections':sum(1 for c in cats for item in c['cases'] if item['file']==d['file'])} for d in docs]
(folder/'sources.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
md=['# 历史不规则应对措施库','', 'source_id: USER-20261002-IRREGULARITY-LIBRARY。历史摘录为原文事实；通用整理稿为 AI 推断，不等于当前工程已执行措施。','']
for c in cats:
 md += ['## '+c['name'],'',c['common']['text'] or '已检索判定记录，未找到可单独归属于本类的历史措施段落。','']
 for x in c['cases']:md += ['### '+x['file'],'',f"来源：{x['source_id']}；{x['section']}；{x['locator']}。{x['scope']}。",'',x['text'],'']
(folder/'措施分类与来源.md').write_text('\n'.join(md),encoding='utf-8')
print('Categories:',len(cats),'historical sections:',sum(len(c['cases']) for c in cats),'documents inspected:',len(docs))
