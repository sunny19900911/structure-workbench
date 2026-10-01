from pathlib import Path
import json,re,html
ROOT=Path(__file__).resolve().parents[2]
source=json.loads((Path(__file__).parent/'measures-source.json').read_text(encoding='utf-8'))
blocks=source['blocks']
page=ROOT/'workbuddy-integrated-studio.html'
current=page.read_text(encoding='utf-8')
start=current.index('<div class="ptitle">结构计算统一措施</div>')
end=current.index('</section>',start)
old=current[start:end].rsplit('</div>',1)[0]
old_sections={m[1]:m[0] for m in re.findall(r'(<h[12] id="([^"]+)"[\s\S]*?)(?=<h[12] id=|$)',old)}
sections=[('s1ch1','1 总则',1,7),('s1ch2','2 建筑结构分类等级',8,9),('s1ch3','3 建筑荷载及作用',0,0),('s1ch3_1','3.1 永久荷载',11,14),('s1ch3_2','3.2 建筑隔墙自重',15,29),('s1ch3_3','3.3 楼面均布活荷载',30,32),('s1ch3_4','3.4 屋面均布活荷载',33,36),('s1ch3_5','3.5 机电设备楼屋面均布活荷载',37,40),('s1ch3_6','3.6 雪荷载',41,43),('s1ch3_7','3.7 风荷载',44,47),('s1ch3_8','3.8 地震作用',48,54),('s1ch4','4 结构材料',0,0),('s1ch4_1','4.1 混凝土',56,62),('s1ch4_2','4.2 钢筋',63,65),('s1ch4_3','4.3 钢材',66,67),('s1ch4_4','4.4 非承重砌体墙',68,69),('s1ch5','5 结构布置统一措施',0,0),('s1ch5_1','5.1 结构布置及通用设置',71,73),('s1ch5_2','5.2 竖向构件截面尺寸及材料强度',74,77),('s1ch5_3','5.3 次梁布置原则及梁截面尺寸',78,95),('s1ch5_4','5.4 楼（屋）面板',95,102),('s1ch5_5','5.5 指标控制',103,104),('s1ch6','6 结构计算',0,0),('s1ch6_1','6.1 周期折减系数',105,106),('s1ch6_2','6.2 活荷载折减',107,113),('s1ch6_3','6.3 竖向地震作用',114,119),('s1ch7','7 结构配筋',0,0),('s1ch7_1','7.1 梁（优先采用 TSSD，也可采用 YJK）',121,133),('s1ch7_2','7.2 柱（YJK）',134,138),('s1ch7_3','7.3 板（优先采用 TSSD，也可采用 YJK）',139,166),('s1ch8','8 楼梯',167,168)]
def pvalue(k):return '<span class="pv" data-p="'+k+'">【待确认】</span>'
def block(b,i):
 if 'text' in b:
  text=html.escape(b['text'].strip())
  if i==94:text=text.replace('5.4 楼（屋）面板','')
  if i==12:text='楼（屋）面附加恒载按建筑专业的各子项做法选用表逐项计算，取值汇总见本项目荷载表；建筑做法调整时同步更新。'
  if i==16:text=text.replace('650',pvalue('wall_drydensity')).replace('1.4',pvalue('wall_abs'))
  if 17<=i<=21:
   w=[100,150,200,250,300][i-17];text=f'{w}厚墙体：'+pvalue('wall_dd_t')+'×'+pvalue('wall_abs')+f'×{w/1000:.2f}+0.02×20×2 = '+pvalue('w'+str(w)+'_raw')+' kN/m²，取 '+pvalue('w'+str(w))+' kN/m²。'
  return '<p class="ce" contenteditable="true" data-template-block="'+str(i)+'">'+text+'</p>'
 rows=b['rows']
 if i==57:rows=[['构件','适用位置','混凝土强度等级','备注']]+[row if len(row)==4 else [row[0],'',row[1],row[2]] for row in rows[1:]]
 n=max(map(len,rows));result='<div class="itbl" data-cols="'+str(n)+'"><table><tbody>'
 for ri,row in enumerate(rows):
  if i==68 and ri==0:row=['适用范围','墙体位置','砌体类型','强度等级','密度等级']
  result+='<tr>'+''.join('<'+('th' if ri==0 else 'td')+' class="ce" contenteditable="true">'+html.escape(v)+'</'+('th' if ri==0 else 'td')+'>' for v in row+['']*(n-len(row)))+('<th class="op">操作</th>' if ri==0 else '<td class="op"><button class="delbtn" onclick="delRow(this)">删除</button></td>')+'</tr>'
 return result+'</tbody></table><button class="addbtn" onclick="addRow(this)">＋ 添加一行</button></div>'
result=[]
for sid,title,a,b in sections:
 level='h2' if '_' in sid else 'h1'
 body=''.join(block(blocks[i],i) for i in range(a,b))
 if sid in ['s1ch2','s1ch3_6','s1ch3_7','s1ch3_8']:
  body=re.sub(r'^<h[12][^>]*>.*?</h[12]>','',old_sections[sid],count=1)
  body=re.sub(r'<p[^>]*data-empty-section[^>]*>.*?</p>','',body)
 if sid=='s1ch1':body='<p>项目名称：'+pvalue('project_name')+'　项目编号：'+pvalue('project_code')+'</p>'+body
 result.append('<'+level+' id="'+sid+'">'+title+'</'+level+'>'+body)
paper='<div class="ptitle">结构计算统一措施</div><div class="psub">'+pvalue('project_name')+'</div><p class="ptip">默认采用小香金猪指定的《结构计算统一措施 V1.2》。通用条款可直接编辑，地区及专项适用条件按项目调整。</p>'+''.join(result)
current=current[:start]+paper+'\n</div>\n'+current[end:]
if './measure-template.js' not in current:current=current.replace('<script src="./project-legacy-adapter.js">','<script src="./measure-template.js"></script>\n<script src="./project-legacy-adapter.js">')
page.write_text(current,encoding='utf-8')
defaults={'wall_drydensity':'650','wall_abs':'1.4','wind_shape':'1.3','waterproof':'同建筑设计说明','fire':'同建筑设计说明'}
data={'version':3,'source_id':'MEASURES-V1.2-20250912','path':source['path'],'defaults':defaults,'sections':result,'paper':paper,'blocks':blocks}
(ROOT/'data'/'measure-template.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
(ROOT/'measure-template.js').write_text('window.MeasureTemplate='+json.dumps({k:data[k] for k in ['version','source_id','defaults','sections','paper']},ensure_ascii=False)+';\n',encoding='utf-8')
# Shared excerpts are references to this approved default, not historical project facts.
excerpts={'permanent':blocks[11]['text'],'wall':blocks[16]['text'],'reinforcement':'\n'.join(blocks[i]['text'] for i in [63,64]),'steel':blocks[66]['text'],'masonry':'地上外围护墙采用蒸压加气混凝土砌块 A5.0、B06；地上内隔墙采用 A3.5、B06；地下室内隔墙采用 A5.0、B06；室外地面以下与水土接触范围采用混凝土普通砖。'}
tables={'floor':blocks[30]['rows'],'roof':blocks[33]['rows'],'equipment':blocks[37]['rows']}
(ROOT/'approved-template.js').write_text('export const TEMPLATE_SOURCE="MEASURES-V1.2-20250912";\nexport const TEMPLATE_TEXT='+json.dumps(excerpts,ensure_ascii=False)+';\nexport const TEMPLATE_TABLES='+json.dumps(tables,ensure_ascii=False)+';\n',encoding='utf-8')
print('Restored',len(result),'sections from approved source')
