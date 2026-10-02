"""Read-only reference distillation. Keep cell geometry; never publish example project values."""
from pathlib import Path
from copy import deepcopy
from lxml import etree as E
import zipfile,json,hashlib
ROOT=Path(__file__).resolve().parents[2]
REF=Path('E:/11-工作/001-workbuddy spaceV1/001-workbuddy space/301-例子/05-云南旅游学院/输出/！结构初步设计说明-汇总版本.docx')
W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';N={'w':W};q=lambda s:'{'+W+'}'+s
z=zipfile.ZipFile(REF);doc=E.fromstring(z.read('word/document.xml'));body=doc.find('w:body',N)
tables=body.findall('w:tbl',N);out={};native={}
selected=[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,17,18,19]
for idx in selected:
 t=deepcopy(tables[idx-1]);rs=t.findall('w:tr',N);rows=[]
 for ri,r in enumerate(rs):
  cs=[]
  for ci,c in enumerate(r.findall('w:tc',N)):
   txt=''.join(c.itertext()) if False else ''.join(c.xpath('.//w:t/text()',namespaces=N))
   # Only generic labels and explicitly reusable comfort table remain in the catalog.
   keep=idx==10 or (ri<({1:2,9:2,11:2,12:1}.get(idx,1))) or (idx in [4,6,18] and ci==0) or (idx==5) or (idx==17 and ci<2) or (idx==19 and (ci==0 or ri==2 or ri==10 or (3<=ri<=8 and ci==1) or (ri in [12,13,14,21,22] and ci==1)))
   if idx in [2,3] and ri>0:keep=True # Reference list, editable per project, not verified current applicability.
   if idx==19 and ri==0 and ci>0:keep=False
   text=txt if keep else ''
   pr=c.find('w:tcPr',N);span=pr.find('w:gridSpan',N) if pr is not None else None;vm=pr.find('w:vMerge',N) if pr is not None else None
   cs.append({'text':text,'span':int(span.get(q('val'))) if span is not None else 1,'merge':vm.get(q('val'),'continue') if vm is not None else '', 'width':int(pr.find('w:tcW',N).get(q('w'),'0')) if pr is not None and pr.find('w:tcW',N) is not None else 0})
   for node in c.xpath('.//w:t',namespaces=N):node.text=''
   ts=c.xpath('.//w:t',namespaces=N)
   if ts:ts[0].text=text
  rows.append(cs)
 out[str(idx)]={'rows':rows,'grid':[int(n.get(q('w'))) for n in t.findall('w:tblGrid/w:gridCol',N)]}
 native[str(idx)]=E.tostring(t,encoding='unicode')
# Native paragraph patterns, including exact font/spacing/numbering properties.
patterns={k:E.tostring(body[i],encoding='unicode') for k,i in {'title':0,'h1':1,'h2':14,'h3':38,'p':2,'caption':6}.items()}
for k,xml in patterns.items():
 p=E.fromstring(xml)
 for n in p.xpath('.//w:t',namespaces=N):n.text=''
 patterns[k]=E.tostring(p,encoding='unicode')
sect=deepcopy(body.find('w:sectPr',N))
for el in list(sect):
 if el.tag in [q('headerReference'),q('footerReference')]:sect.remove(el)
for el in list(body):body.remove(el)
body.append(sect)
# Use a clean OPC package with the reference's actual style definitions and page geometry.
# The reference settings contain legacy relationships that must not dangle after removing historical content.
from docx import Document
import io
dest=ROOT/'design/reference-expansion'
base=Document();base._element.body.clear_content();base._element.body.replace(base._element.body.sectPr,sect)
buf=io.BytesIO();base.save(buf);blank=zipfile.ZipFile(buf)
with zipfile.ZipFile(dest/'base.docx','w',zipfile.ZIP_DEFLATED) as zz:
 for name in blank.namelist():
  if name in ['word/styles.xml','word/numbering.xml','word/fontTable.xml','word/theme/theme1.xml'] and name in z.namelist():data=z.read(name)
  else:data=blank.read(name)
  zz.writestr(name,data)
(dest/'native-tables.json').write_text(json.dumps({'tables':native,'paragraphs':patterns},ensure_ascii=False),encoding='utf-8')
(ROOT/'reference-template-data.js').write_text('export const REFERENCE_TABLES='+json.dumps(out,ensure_ascii=False)+';\n',encoding='utf-8')
(dest/'artifact.md').write_text(f'''# 扩初说明模板约定
来源：{REF}\nsource_id: USER-REFERENCE-20261002\nSHA256: {hashlib.sha256(REF.read_bytes()).hexdigest()}

按原 Word 章节1～10编排。A3横向23814×16839 twips；上下边距1701，左右1418，装订线567；双栏、间距1050。保留原字体、段落格式、表格列宽、合并单元格、边框及单元格段落格式。

单体信息表1、抗震等级表9按当前单体重复原有完整数据行；规范表2/3可编辑；舒适度表10按用户要求保留。其他工程取值清空并绑定当前项目。地勘章节及图片只用本项目资料；模板历史场地、结构计算值、图片及工程结论不进入输出。标题采用第一章结构设计。

原文件只读；派生base.docx只保存页面与样式，无原工程正文及图片。网页预览和Word导出共用原生DOCX生成器。打包渲染器缺少LibreOffice，采用本机Word只读渲染及Poppler验收。
''',encoding='utf-8')
print('Distilled',len(out),'table patterns; original SHA unchanged.')
