"""Derive an empty native template. Source PPTX is always read-only."""
from pathlib import Path
from copy import deepcopy
import zipfile, json, sys, re, hashlib
from lxml import etree as E

NS={'p':'http://schemas.openxmlformats.org/presentationml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
ROOT=Path(__file__).resolve().parent
def text(node): return ''.join(node.xpath('.//a:t/text()',namespaces=NS))
def set_text(node,value):
    body=node.find('p:txBody',NS) if node.tag.endswith('}sp') else node.find('a:txBody',NS)
    if body is None:return
    old=body.find('a:p',NS); proto=deepcopy(old) if old is not None else E.Element('{'+NS['a']+'}p')
    rp=proto.find('.//a:rPr',NS)
    for p in body.findall('a:p',NS):body.remove(p)
    for line in str(value).split('\n'):
        p=deepcopy(proto)
        for c in list(p):
            if c.tag!='{'+NS['a']+'}pPr':p.remove(c)
        r=E.SubElement(p,'{'+NS['a']+'}r')
        if rp is not None:r.append(deepcopy(rp))
        E.SubElement(r,'{'+NS['a']+'}t').text=line
        body.append(p)
def box(sp):
    x=sp.find('p:xfrm',NS) if sp.tag.endswith('}graphicFrame') else sp.find('.//a:xfrm',NS)
    if x is None:return None
    o=x.find('a:off',NS);e=x.find('a:ext',NS)
    return [round(int(o.get('x'))/9525,3),round(int(o.get('y'))/9525,3),round(int(e.get('cx'))/9525,3),round(int(e.get('cy'))/9525,3)]
def style(node):
    rp=node.find('.//a:rPr',NS); pp=node.find('.//a:pPr',NS)
    font=node.find('.//a:ea',NS);color=node.find('.//a:rPr/a:solidFill/a:srgbClr',NS)
    return {'size':round(int(rp.get('sz','1800') if rp is not None else '1800')/100*4/3,2),'bold':rp is not None and rp.get('b')=='1','font':font.get('typeface') if font is not None else '宋体','color':'#'+(color.get('val') if color is not None else '000000'),'align':{'ctr':'center','r':'right'}.get(pp.get('algn') if pp is not None else '', 'left')}

titles=['封面','总体','鸟瞰图','东侧鸟瞰图','西侧鸟瞰图','总平面图','结构设计概况','结构设计参数','结构体系及抗震等级','结构注意事项','混凝土强度及材料','地下室顶板结构布置','一层结构布置','一层结构大样','二层结构布置','三层结构布置','四层结构布置','特殊转换','小屋面结构布置','结构模型与构件','一层结构平面','二层结构平面','三层结构平面','屋面结构平面','小屋面结构平面']
source=Path(sys.argv[1]);data={};pages=[]
with zipfile.ZipFile(source) as z:
    for name in z.namelist():
        if name.startswith('ppt/media/') or name.startswith('docProps/thumbnail'):continue
        raw=z.read(name)
        if name.endswith('.rels'):
            root=E.fromstring(raw)
            for rel in list(root):
                if rel.get('Type','').endswith(('/image','/hyperlink','/oleObject')) or rel.get('TargetMode')=='External':root.remove(rel)
            raw=E.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True)
        elif name.startswith(('ppt/notesSlides/','docProps/')) and name.endswith('.xml'):
            root=E.fromstring(raw)
            for t in root.iter():
                if t.text and (t.tag=='{'+NS['a']+'}t' or E.QName(t).localname in ['title','subject','creator','lastModifiedBy','description','keywords','lpstr']):t.text=''
            raw=E.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True)
        data[name]=raw
    for n in range(1,26):
        name=f'ppt/slides/slide{n}.xml';root=E.fromstring(data[name]);tree=root.find('p:cSld/p:spTree',NS);items=[];pic=0
        for sp in list(tree):
            kind=E.QName(sp).localname;cn=sp.find('.//p:cNvPr',NS);sid=cn.get('id') if cn is not None else '';b=box(sp)
            if kind=='pic':
                pic+=1;label=next((x.text for x in root.findall('.//a:t',NS) if x.text and '平面布置图' in x.text),'')
                label=f'{titles[n-1]} · 图{pic}'
                if n==18:label=['特殊转换平面图','特殊转换模型'][min(pic-1,1)]
                if n==20:label='盈建科模型'
                items.append({'kind':'image','id':sid,'box':b,'name':label})
                tree.remove(sp);continue
            if kind=='cxnSp' and n>=12:tree.remove(sp);continue
            tbl=sp.find('.//a:tbl',NS)
            if tbl is not None:
                rows=tbl.findall('a:tr',NS)
                for i,row in enumerate(rows):
                    for j,cell in enumerate(row.findall('a:tc',NS)):
                        keep=(n in [7,15] and i==0) or (n==9 and i<2) or (n==8 and (i==0 or j==0)) or (n==11 and (i==0 or j<2))
                        if not keep:set_text(cell,'')
                cols=[int(x.get('w'))/9525 for x in tbl.findall('a:tblGrid/a:gridCol',NS)]
                items.append({'kind':'table','id':sid,'box':b,'cols':cols,'rows':[[{'text':text(c),'style':style(c),'colSpan':int(c.get('gridSpan','1')),'rowSpan':int(c.get('rowSpan','1')),'skip':c.get('hMerge')=='1' or c.get('vMerge')=='1','fill':c.find('a:tcPr/a:solidFill/a:srgbClr',NS).get('val') if c.find('a:tcPr/a:solidFill/a:srgbClr',NS) is not None else None} for c in r.findall('a:tc',NS)] for r in rows],'heights':[int(r.get('h'))/9525 for r in rows]});continue
            if kind!='sp':continue
            txt=text(sp)
            if not txt:
                if n>=12:tree.remove(sp)
                continue
            field=None
            if n==1:txt='';field='project'
            elif sid=='4' and b is None:txt=str(n-1)
            elif n==7 and sid=='11':txt='';field='overview'
            elif n==10 and sid=='6':txt='';field='notes'
            elif n==11 and sid=='5':txt='';field='materials'
            elif n>=12 and sid=='9':txt=('03  特殊转换' if n==18 else '02  结构设计')
            elif n==18 and sid=='10':txt='阳台柱转换：';field='conversion'
            elif n==20 and sid=='5':txt='框架柱：\n框架梁：\n次梁：\n板厚：\n超限判断：';field='components'
            elif n in [15,16] and sid!='12':txt=''
            elif n==13 and sid=='17':txt=''
            elif n==12 and sid=='12':txt='地下室顶板结构平面布置图'
            if not txt and not field:tree.remove(sp);continue
            if not b:b=[1210,685,50,20]
            set_text(sp,txt);items.append({'kind':'text','id':sid,'box':b,'text':txt,'field':field,'style':style(sp)})
        data[name]=E.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True)
        pages.append({'number':n,'title':titles[n-1],'type':'cafeteria','shapes':items,'slots':[x['name'] for x in items if x['kind']=='image']})
    # Native table geometry, masters, themes and paragraph styling remain in the empty base.
with zipfile.ZipFile(ROOT/'cafeteria-base.pptx','w',zipfile.ZIP_DEFLATED) as z:
    for name,raw in data.items():z.writestr(name,raw)
(ROOT/'cafeteria-template.js').write_text('export const cafeteriaTemplate = '+json.dumps({'version':'cafeteria-v1','width':1280,'height':720,'pages':pages},ensure_ascii=False,indent=2)+';\n',encoding='utf-8')
(ROOT/'cafeteria-source.json').write_text(json.dumps({'source_id':'USER-20261003-CAFETERIA-PPT','path':str(source),'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'slides':25,'statement':'原文事实（模板版式）'},ensure_ascii=False,indent=2),encoding='utf-8')
