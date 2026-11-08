"""Native PPTX extension. Only explicitly edited ZIP parts are rewritten."""
import base64
import copy
import importlib.util
import io
import json
import math
import posixpath
import re
import sys
import uuid
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location('office_base', Path(__file__).with_name('office-package.py'))
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)
E, NS, P, A, R = b.E, b.NS, b.P, b.A, b.R
REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
CT = 'http://schemas.openxmlformats.org/package/2006/content-types'

def fail(message, code='INVALID_INPUT'):
    raise b.OfficeError(message, code)

def number(value, minimum=-100000000, maximum=100000000):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not minimum <= value <= maximum:
        fail('数值超出允许范围')
    return round(value)

def integer(value, minimum, maximum):
    if type(value) is not int or not minimum <= value <= maximum:
        fail('页码或位置无效')
    return value

def relpath(part):
    return posixpath.join(posixpath.dirname(part), '_rels', posixpath.basename(part)+'.rels')

def write(z, changes):
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as dest:
        dest.comment = z.comment
        for info in z.infolist():
            dest.writestr(info, changes.get(info.filename, z.read(info.filename)))
        for name, data in changes.items():
            if name not in z.namelist():
                dest.writestr(name, data)
    return out.getvalue()

def child(root, tag):
    node = root.find(tag, NS)
    if node is not None: return node
    node=E.Element('{'+NS[tag.split(':')[0]]+'}'+tag.split(':')[1])
    ext=root.find('a:extLst',NS)
    root.insert(list(root).index(ext) if ext is not None else len(root),node)
    return node

def inspect(z):
    view = b.inspect_pptx(z)
    _, _, slides = b.presentation_slides(z)
    for slide, (part, root) in zip(view['slides'], slides):
        slide['part'] = part
        tree = root.find('p:cSld/p:spTree', NS)
        nodes = [s for s in tree if s.find('.//p:cNvPr', NS) is not None]
        for shape in slide['shapes']:
            node = next((s for s in nodes if s.find('.//p:cNvPr', NS).get('id') == shape['id']), None)
            if node is None: continue
            ppr = node.find('p:txBody/a:p/a:pPr', NS)
            shape['align'] = ppr.get('algn', 'l') if ppr is not None else 'l'
            props = node.find('.//a:rPr', NS)
            if props is None: props = node.find('.//a:defRPr', NS)
            if props is not None:
                shape.update(fontSize=float(props.get('sz', '1800'))/100, bold=props.get('b') == '1', italic=props.get('i') == '1', underline=props.get('u','none')!='none')
                face=props.find('a:ea',NS)
                if face is None: face=props.find('a:latin',NS)
                if face is not None: shape['fontFace']=face.get('typeface','')
                color = props.find('a:solidFill/a:srgbClr', NS)
                if color is not None: shape['color'] = '#'+color.get('val', '000000')
            # Inherited placeholders and grouped transforms must not be guessed.
            shape['editable'] = shape['editable'] and node.find('p:txBody', NS) is not None and node.find('.//a:fld',NS) is None and node.find('.//a:br',NS) is None
    return view

def page_edit(z, cmd, slides):
    op = cmd['op']; count = len(slides)
    index = integer(cmd.get('slide'), 1, count)-1
    if op in ('slide.add', 'slide.duplicate') and count >= 200: fail('最多支持 200 页')
    root = b.xml(z.read('ppt/presentation.xml'))
    ids = root.find('p:sldIdLst', NS)
    rels = b.xml(z.read('ppt/_rels/presentation.xml.rels'))
    changes = {}
    if op == 'slide.move':
        target = integer(cmd.get('to'), 1, count)-1
        item = ids[index]; ids.remove(item); ids.insert(target, item)
    elif op == 'slide.delete':
        if count <= 1: fail('至少保留一页幻灯片')
        item = ids[index]; rid = item.get('{'+R+'}id'); sid = item.get('id'); ids.remove(item)
        for item in list(rels):
            if item.get('Id') == rid: rels.remove(item)
        for item in root.xpath('.//p:custShow/p:sldLst/p:sld', namespaces=NS):
            if item.get('{'+R+'}id') == rid: item.getparent().remove(item)
        # Section lists use numeric slide IDs (p14 namespace).
        for item in root.xpath('.//*[local-name()="sectionLst"]//*[local-name()="sldId"]'):
            if item.get('id') == sid: item.getparent().remove(item)
        # Orphan parts stay intact; history and undo can recover the original file.
    elif op in ('slide.add', 'slide.duplicate'):
        source, source_root = slides[index]
        new = 'ppt/slides/slide-'+uuid.uuid4().hex+'.xml'
        duplicate = copy.deepcopy(source_root)
        links = b.xml(z.read(relpath(source))) if relpath(source) in z.namelist() else E.Element('{'+REL+'}Relationships')
        ct = b.xml(z.read('[Content_Types].xml'))
        if op == 'slide.add':
            duplicate = E.Element('{'+P+'}sld', nsmap={'p':P, 'a':A, 'r':R})
            cs = E.SubElement(duplicate, '{'+P+'}cSld'); tree = E.SubElement(cs, '{'+P+'}spTree')
            original_tree = source_root.find('p:cSld/p:spTree', NS)
            for item in original_tree:
                if E.QName(item).localname in ('nvGrpSpPr', 'grpSpPr'): tree.append(copy.deepcopy(item))
            E.SubElement(duplicate, '{'+P+'}clrMapOvr').append(E.Element('{'+A+'}masterClrMapping'))
            for link in list(links):
                if not link.get('Type', '').endswith('/slideLayout'): links.remove(link)
        else:
            # Clone notes and their back-reference; all media/layout parts remain shared.
            for link in links:
                if link.get('Type', '').endswith('/notesSlide') and link.get('TargetMode') != 'External':
                    old_notes = b.relations(z, source).get(link.get('Id'))
                    if old_notes not in z.namelist(): fail('备注关系缺失', 'INVALID_OFFICE_PACKAGE')
                    new_notes = 'ppt/notesSlides/notesSlide-'+uuid.uuid4().hex+'.xml'
                    changes[new_notes] = z.read(old_notes)
                    if relpath(old_notes) in z.namelist():
                        nr = b.xml(z.read(relpath(old_notes)))
                        for relation in nr:
                            if relation.get('Type', '').endswith('/slide'):
                                relation.set('Target', posixpath.relpath(new, 'ppt/notesSlides'))
                        changes[relpath(new_notes)] = b.serial(nr)
                    link.set('Target', posixpath.relpath(new_notes, 'ppt/slides'))
                    E.SubElement(ct, '{'+CT+'}Override', PartName='/'+new_notes, ContentType='application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml')
        rid = 'rId'+uuid.uuid4().hex
        E.SubElement(rels, '{'+REL+'}Relationship', Id=rid, Type=R+'/slide', Target=posixpath.relpath(new, 'ppt'))
        item = E.Element('{'+P+'}sldId', id=str(max(int(n.get('id')) for n in ids)+1)); item.set('{'+R+'}id', rid)
        ids.insert(index+1, item)
        changes[new] = b.serial(duplicate); changes[relpath(new)] = b.serial(links)
        E.SubElement(ct, '{'+CT+'}Override', PartName='/'+new, ContentType='application/vnd.openxmlformats-officedocument.presentationml.slide+xml')
        changes['[Content_Types].xml'] = b.serial(ct)
    else: fail('不支持的幻灯片操作')
    changes['ppt/presentation.xml'] = b.serial(root)
    changes['ppt/_rels/presentation.xml.rels'] = b.serial(rels)
    return write(z, changes)

def geometry(shape, cmd):
    props = child(shape, 'p:spPr'); transform = child(props, 'a:xfrm')
    off = child(transform, 'a:off'); extent = child(transform, 'a:ext')
    for key, node, attr in [('x',off,'x'), ('y',off,'y'), ('width',extent,'cx'), ('height',extent,'cy')]:
        if key in cmd: node.set(attr, str(number(cmd[key], 1 if key in ('width','height') else -100000000)))

def new_shape(tree, picture=False):
    ident = max([int(s.get('id', '0')) for s in tree.findall('.//p:cNvPr', NS)]+[1])+1
    shape = E.Element('{'+P+'}'+('pic' if picture else 'sp'))
    ext=tree.find('p:extLst',NS)
    tree.insert(list(tree).index(ext) if ext is not None else len(tree),shape)
    nv = E.SubElement(shape, '{'+P+'}'+('nvPicPr' if picture else 'nvSpPr'))
    E.SubElement(nv, '{'+P+'}cNvPr', id=str(ident), name=('图片 ' if picture else '文本框 ')+str(ident))
    E.SubElement(nv, '{'+P+'}'+('cNvPicPr' if picture else 'cNvSpPr'))
    E.SubElement(nv, '{'+P+'}nvPr')
    return shape

def set_text(shape, text):
    body = shape.find('p:txBody', NS)
    if body is None: fail('该对象没有可编辑文本', 'UNSUPPORTED_EDIT')
    if shape.find('.//a:fld', NS) is not None or shape.find('.//a:br',NS) is not None: fail('含动态字段或软换行的文本请在 PowerPoint 中编辑', 'UNSUPPORTED_EDIT')
    old = body.findall('a:p', NS)
    for paragraph in old: body.remove(paragraph)
    for i, value in enumerate(text.split('\n')):
        template = old[min(i,len(old)-1)] if old else None
        paragraph = E.SubElement(body, '{'+A+'}p')
        if template is not None and template.find('a:pPr',NS) is not None: paragraph.append(copy.deepcopy(template.find('a:pPr',NS)))
        runs = template.findall('a:r',NS) if template is not None else []
        offset = 0
        for j in range(max(1,len(runs))):
            run = E.SubElement(paragraph, '{'+A+'}r')
            if runs and runs[j].find('a:rPr',NS) is not None: run.append(copy.deepcopy(runs[j].find('a:rPr',NS)))
            length = len(runs[j].findtext('a:t','',NS)) if j < len(runs)-1 else len(value)-offset
            t = E.SubElement(run, '{'+A+'}t'); t.text = value[offset:offset+length]; offset += length
            t.set('{http://www.w3.org/XML/1998/namespace}space','preserve')
        if template is not None and template.find('a:endParaRPr',NS) is not None: paragraph.append(copy.deepcopy(template.find('a:endParaRPr',NS)))

def edit(z, cmd):
    if not isinstance(cmd,dict): fail('编辑命令无效')
    if cmd.get('op')=='ppt.image.insert': cmd={**cmd,'op':'image.insert'}
    op = cmd.get('op',''); _, _, slides = b.presentation_slides(z)
    if op.startswith('slide.'): return page_edit(z,cmd,slides)
    index = integer(cmd.get('slide'),1,len(slides))-1
    part, root = slides[index]; tree = root.find('p:cSld/p:spTree',NS); changes = {}
    if tree is None: fail('幻灯片对象树缺失','INVALID_OFFICE_PACKAGE')
    if op in ('shape.addText','image.insert'):
        shape = new_shape(tree,op=='image.insert')
        if op=='image.insert':
            value=cmd.get('data','')
            if not isinstance(value,str) or len(value)>1800000: fail('图片须小于 1.3 MB')
            match=re.fullmatch(r'data:image/(png|jpeg);base64,([A-Za-z0-9+/=]+)',value)
            if not match: fail('仅支持 PNG / JPEG 图片')
            try: payload=base64.b64decode(match[2],validate=True)
            except Exception: fail('图片编码无效')
            from PIL import Image
            try:
                with Image.open(io.BytesIO(payload)) as image:
                    if image.width*image.height>25000000 or image.format!=('PNG' if match[1]=='png' else 'JPEG'): fail('图片内容与格式不一致或过大')
                    image.verify()
            except b.OfficeError: raise
            except Exception: fail('图片内容损坏')
            imagepart='ppt/media/image-'+uuid.uuid4().hex+('.png' if match[1]=='png' else '.jpg')
            changes[imagepart]=payload
            links=b.xml(z.read(relpath(part))) if relpath(part) in z.namelist() else E.Element('{'+REL+'}Relationships')
            rid='rId'+uuid.uuid4().hex
            E.SubElement(links,'{'+REL+'}Relationship',Id=rid,Type=R+'/image',Target=posixpath.relpath(imagepart,'ppt/slides'))
            changes[relpath(part)]=b.serial(links)
            ct=b.xml(z.read('[Content_Types].xml')); E.SubElement(ct,'{'+CT+'}Override',PartName='/'+imagepart,ContentType='image/'+match[1]);changes['[Content_Types].xml']=b.serial(ct)
            fill=E.SubElement(shape,'{'+P+'}blipFill'); E.SubElement(fill,'{'+A+'}blip').set('{'+R+'}embed',rid)
            E.SubElement(E.SubElement(fill,'{'+A+'}stretch'),'{'+A+'}fillRect')
        geometry(shape,{k:cmd.get(k,v) for k,v in {'x':914400,'y':914400,'width':3657600,'height':1828800 if op=='image.insert' else 914400}.items()})
        geom=E.SubElement(shape.find('p:spPr',NS),'{'+A+'}prstGeom',prst='rect');E.SubElement(geom,'{'+A+'}avLst')
        if op=='shape.addText':
            E.SubElement(shape.find('p:spPr',NS),'{'+A+'}noFill')
            body=E.SubElement(shape,'{'+P+'}txBody');E.SubElement(body,'{'+A+'}bodyPr');E.SubElement(body,'{'+A+'}lstStyle')
            set_text(shape,b.valid_text(cmd))
    else:
        found=[s for s in tree if s.find('.//p:cNvPr',NS) is not None and s.find('.//p:cNvPr',NS).get('id')==str(cmd.get('shapeId'))]
        if len(found)!=1: fail('未找到唯一对象','TARGET_NOT_FOUND')
        shape=found[0];kind=E.QName(shape).localname
        if kind not in ('sp','pic'): fail('该对象请在 PowerPoint 中编辑','UNSUPPORTED_EDIT')
        if op=='shape.text':
            if cmd.get('expectedText')!=b.shape_text(shape): fail('文字已变化，请重新读取','CONFLICT')
            set_text(shape,b.valid_text(cmd))
        elif op in ('shape.geometry','shape.move'):
            current=b.geometry(shape)
            if current['x'] is None: fail('继承母版位置的对象暂不支持移动','UNSUPPORTED_EDIT')
            expected=cmd.get('expectedGeometry') if op=='shape.geometry' else {'x':cmd.get('expectedX'),'y':cmd.get('expectedY')}
            keys=('x','y','width','height') if op=='shape.geometry' else ('x','y')
            if not isinstance(expected,dict) or any(expected.get(k)!=current[k] for k in keys): fail('对象位置或尺寸已变化','CONFLICT')
            if not any(k in cmd for k in keys): fail('缺少新位置或尺寸')
            geometry(shape,cmd)
        elif op=='shape.format':
            if kind!='sp' or shape.find('p:txBody',NS) is None: fail('请选择文本框')
            if not any(k in cmd for k in ('fontSize','fontFace','bold','italic','underline','color','align')): fail('缺少格式参数')
            for key in ('bold','italic','underline'):
                if key in cmd and type(cmd[key]) is not bool: fail('格式开关须为布尔值')
            if 'fontFace' in cmd and (not isinstance(cmd['fontFace'],str) or not 1<=len(cmd['fontFace'])<=80 or re.search(r'[\x00-\x1f]',cmd['fontFace'])): fail('字体名称无效')
            if 'color' in cmd and (not isinstance(cmd['color'],str) or not re.fullmatch(r'#[0-9A-Fa-f]{6}',cmd['color'])): fail('颜色格式无效')
            if 'align' in cmd and cmd['align'] not in ('l','ctr','r','just'): fail('对齐方式无效')
            for paragraph in shape.findall('p:txBody/a:p',NS):
                ppr=paragraph.find('a:pPr',NS)
                if ppr is None: ppr=E.Element('{'+A+'}pPr');paragraph.insert(0,ppr)
                if 'align' in cmd: ppr.set('algn',cmd['align'])
                props=[child(ppr,'a:defRPr')]
                for run in paragraph.findall('a:r',NS):
                    prop=run.find('a:rPr',NS)
                    if prop is None: prop=E.Element('{'+A+'}rPr');run.insert(0,prop)
                    props.append(prop)
                for prop in props:
                    if 'underline' in cmd: prop.set('u','sng' if cmd['underline'] else 'none')
                    if 'fontFace' in cmd:
                        for tag in ('latin','ea','cs'):
                            face=prop.find('a:'+tag,NS)
                            if face is None:
                                face=E.Element('{'+A+'}'+tag)
                                later=next((n for n in prop if E.QName(n).localname in {'latin':('ea','cs','sym','hlinkClick','hlinkMouseOver','rtl','extLst'),'ea':('cs','sym','hlinkClick','hlinkMouseOver','rtl','extLst'),'cs':('sym','hlinkClick','hlinkMouseOver','rtl','extLst')}[tag]),None)
                                prop.insert(list(prop).index(later) if later is not None else len(prop),face)
                            face.set('typeface',cmd['fontFace'])
                    if 'fontSize' in cmd:
                        value=cmd['fontSize']
                        if isinstance(value,bool) or not isinstance(value,(int,float)): fail('字号无效')
                        prop.set('sz',str(number(value*100,600,9600)))
                    for key, attr in [('bold','b'),('italic','i')]:
                        if key in cmd: prop.set(attr,'1' if cmd[key] else '0')
                    if 'color' in cmd:
                        for item in list(prop):
                            if E.QName(item).localname in ('solidFill','gradFill','noFill','pattFill','blipFill','grpFill'): prop.remove(item)
                        fill=E.Element('{'+A+'}solidFill'); prop.insert(1 if prop.find('a:ln',NS) is not None else 0,fill);E.SubElement(fill,'{'+A+'}srgbClr',val=cmd['color'][1:].upper())
        elif op=='shape.delete': tree.remove(shape)
        else: fail('不支持的 PPT 操作')
    changes[part]=b.serial(root)
    return write(z,changes)

def main():
    folder=Path(sys.argv[1]); request=json.loads((folder/'request.json').read_text(encoding='utf-8'))
    with b.load_package((folder/'input.bin').read_bytes(),'pptx') as z:
        if request['action']=='inspect': return inspect(z)
        if request['action']!='edit': fail('操作无效')
        result=edit(z,request.get('command'));(folder/'output.bin').write_bytes(result)
    return {'ok':True}

if __name__=='__main__':
    try: result=main()
    except Exception as exc: result={'error':str(exc),'code':getattr(exc,'code','INVALID_OFFICE_PACKAGE')}
    print(json.dumps(result,ensure_ascii=True,allow_nan=False))
