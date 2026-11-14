"""Bounded native OOXML operations. Unchanged ZIP parts remain byte-identical.

This is a deliberately small editing contract, not an Office rendering engine.
Never evaluates formulas, macros, links or embedded objects.
"""
from __future__ import annotations
import base64
import copy
import importlib.util
import io
import json
import math
import posixpath
import re
import sys
import zipfile
from pathlib import Path
from lxml import etree as E

S='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
P='http://schemas.openxmlformats.org/presentationml/2006/main'
A='http://schemas.openxmlformats.org/drawingml/2006/main'
R='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
NS={'s':S,'p':P,'a':A,'r':R}
MAX_CELLS=40000
MAX_TEXT=100000

class OfficeError(ValueError):
    def __init__(self,message,code='UNSUPPORTED_EDIT'):
        super().__init__(message); self.code=code

def xml(data):
    if len(data)>24*1024*1024 or re.search(br'<!\s*(?:DOCTYPE|ENTITY)',data,re.I):
        raise OfficeError('XML 含不支持的实体或超过大小限制','INVALID_OFFICE_PACKAGE')
    return E.fromstring(data,E.XMLParser(resolve_entities=False,no_network=True,huge_tree=False))

def serial(root):
    return E.tostring(root,encoding='UTF-8',xml_declaration=True,standalone=True)

def load_package(data,kind):
    module_spec=importlib.util.spec_from_file_location('workbench_document_format',Path(__file__).with_name('document-format.py'))
    module=importlib.util.module_from_spec(module_spec); module_spec.loader.exec_module(module)
    detected=module.inspect_zip(data)
    if detected['format']!=kind or kind not in ('xlsx','pptx'):
        raise OfficeError('当前编辑仅支持原生 XLSX / PPTX 文件','FORMAT_MISMATCH')
    if detected.get('macros') or 'Strict' in detected.get('formatVersion',''):
        raise OfficeError('含宏或 Strict 格式暂不提供直接编辑，请另存标准副本','UNSUPPORTED_FORMAT')
    z=zipfile.ZipFile(io.BytesIO(data))
    if any(n.startswith('_xmlsignatures/') for n in z.namelist()):
        raise OfficeError('带数字签名的文件请先另存未签名副本','SIGNED_DOCUMENT')
    return z

def relations(z,part):
    path=posixpath.join(posixpath.dirname(part),'_rels',posixpath.basename(part)+'.rels')
    if path not in z.namelist(): return {}
    result={}
    for r in xml(z.read(path)):
        if r.get('TargetMode')=='External': continue
        target=r.get('Target','')
        dest=posixpath.normpath(target.lstrip('/') if target.startswith('/') else posixpath.join(posixpath.dirname(part),target))
        if dest.startswith('../') or '\\' in dest or ':' in dest: continue
        result[r.get('Id')]=dest
    return result

def write_package(z,changes,removed=()):
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w') as result:
        result.comment=z.comment
        for info in z.infolist():
            if info.filename not in removed: result.writestr(info,changes.get(info.filename,z.read(info.filename)))
    return out.getvalue()

def address(value):
    if not isinstance(value,str) or not re.fullmatch(r'[A-Z]{1,3}[1-9][0-9]{0,6}',value):
        raise OfficeError('单元格地址无效','INVALID_INPUT')
    col=0
    for c in re.match(r'[A-Z]+',value).group(): col=col*26+ord(c)-64
    row=int(re.search(r'[0-9]+',value).group())
    if col>16384 or row>1048576: raise OfficeError('单元格地址超出 Excel 范围','INVALID_INPUT')
    return row,col

def sheets(z):
    book=xml(z.read('xl/workbook.xml')); rels=relations(z,'xl/workbook.xml')
    result=[]
    for sheet in book.findall('s:sheets/s:sheet',NS):
        part=rels.get(sheet.get('{'+R+'}id'))
        if part not in z.namelist(): raise OfficeError('工作表关系缺失','INVALID_OFFICE_PACKAGE')
        result.append((sheet,part,xml(z.read(part))))
    return book,result

def strings(z):
    if 'xl/sharedStrings.xml' not in z.namelist(): return []
    return [''.join(item.xpath('s:t/text()|s:r/s:t/text()',namespaces=NS)) for item in xml(z.read('xl/sharedStrings.xml')).findall('s:si',NS)]

def cell_info(cell,shared):
    kind=cell.get('t','n'); raw=cell.findtext('s:v',default='',namespaces=NS)
    formula=cell.find('s:f',NS)
    if kind=='s':
        try: value=shared[int(raw)]
        except (ValueError,IndexError): raise OfficeError('共享文本索引无效','INVALID_OFFICE_PACKAGE')
    elif kind=='inlineStr': value=''.join(cell.xpath('s:is//s:t/text()',namespaces=NS))
    elif kind=='b': value=raw=='1'
    else: value=raw
    text=('='+''.join(formula.itertext())) if formula is not None else ('TRUE' if value is True else 'FALSE' if value is False else str(value))
    return {'address':cell.get('r'),'text':text,'value':value,'formula':''.join(formula.itertext()) if formula is not None else None,
            'cachedValue':raw if formula is not None and raw!='' else None,'style':int(cell.get('s','0')),'valueType':kind,
            'editable':formula is None or not formula.attrib}

def style_list(z):
    if 'xl/styles.xml' not in z.namelist(): return []
    root=xml(z.read('xl/styles.xml')); fonts=root.findall('s:fonts/s:font',NS); fills=root.findall('s:fills/s:fill',NS)
    formats={e.get('numFmtId'):e.get('formatCode') for e in root.findall('s:numFmts/s:numFmt',NS)}
    from openpyxl.styles.numbers import BUILTIN_FORMATS
    styles=[]
    for item in root.findall('s:cellXfs/s:xf',NS):
        idx=int(item.get('fontId','0')); font=fonts[idx] if idx<len(fonts) else E.Element('font')
        color=font.find('s:color',NS); align=item.find('s:alignment',NS)
        fill_idx=int(item.get('fillId','0')); fill=fills[fill_idx].find('s:patternFill/s:fgColor',NS) if fill_idx<len(fills) else None
        styles.append({'font':font.find('s:name',NS).get('val') if font.find('s:name',NS) is not None else None,
          'fontSize':font.find('s:sz',NS).get('val') if font.find('s:sz',NS) is not None else None,
          'bold':font.find('s:b',NS) is not None,'color':color.get('rgb') if color is not None else None,
          'fontColor':color.get('rgb') if color is not None else None,'fillColor':fill.get('rgb') if fill is not None else None,
          'numberFormat':formats.get(item.get('numFmtId'),BUILTIN_FORMATS.get(int(item.get('numFmtId','0')),'General')),
          'horizontal':align.get('horizontal') if align is not None else None,
          'numberFormatId':item.get('numFmtId','0'),'alignment':dict(align.attrib) if align is not None else {}})
    return styles

def inspect_xlsx(z):
    book,items=sheets(z); shared=strings(z); output=[]; count=0; formulas=0
    for info,part,root in items:
        cells=[]
        for cell in root.findall('s:sheetData/s:row/s:c',NS):
            count+=1
            if count>MAX_CELLS: raise OfficeError('表格超过基础编辑器的 40000 个单元格限制','RESOURCE_LIMIT')
            item=cell_info(cell,shared); cells.append(item); formulas+=item['formula'] is not None
        output.append({'name':info.get('name'),'state':info.get('state','visible'),'cells':cells,
          'merges':[e.get('ref') for e in root.findall('s:mergeCells/s:mergeCell',NS)],
          'columns':[dict(e.attrib) for e in root.findall('s:cols/s:col',NS)],'protected':root.find('s:sheetProtection',NS) is not None})
    return {'type':'xlsx','sheets':output,'styles':style_list(z),'formulaCount':formulas,'calculation':'not-evaluated',
            'warnings':['公式未在工作台重算；修改后缓存失效，使用 Excel 打开时重算。'] if formulas else []}

def valid_text(command):
    value=command.get('text')
    if not isinstance(value,str) or len(value)>MAX_TEXT or any(ord(c)<32 and c not in '\n\r\t' for c in value):
        raise OfficeError('文字无效或过长','INVALID_INPUT')
    return value

def edit_xlsx(z,command):
    if command.get('op')!='cell.set': raise OfficeError('不支持的 Excel 操作','INVALID_INPUT')
    row_idx,col_idx=address(command.get('address')); text=valid_text(command)
    book,items=sheets(z); selected=next((item for item in items if item[0].get('name')==command.get('sheet')),None)
    if selected is None: raise OfficeError('工作表不存在','TARGET_NOT_FOUND')
    _,part,root=selected
    if root.find('s:sheetProtection',NS) is not None: raise OfficeError('当前工作表受保护，不能直接修改','PROTECTED_DOCUMENT')
    for merged in root.findall('s:mergeCells/s:mergeCell',NS):
        start,end=(merged.get('ref','')+':'+merged.get('ref','')).split(':')[:2]
        r1,c1=address(start); r2,c2=address(end)
        if r1<=row_idx<=r2 and c1<=col_idx<=c2 and command['address']!=start:
            raise OfficeError('请编辑合并区域左上角单元格','UNSUPPORTED_EDIT')
    for f in root.findall('s:sheetData/s:row/s:c/s:f',NS):
        if f.get('t') in ('array','dataTable') and f.get('ref'):
            bounds=f.get('ref').split(':'); start=bounds[0]; end=bounds[-1]
            r1,c1=address(start);r2,c2=address(end)
            if r1<=row_idx<=r2 and c1<=col_idx<=c2:
                raise OfficeError('数组或数据表公式范围请在 Excel 中编辑','UNSUPPORTED_EDIT')
    data=root.find('s:sheetData',NS)
    if data is None: raise OfficeError('工作表没有单元格数据区','INVALID_OFFICE_PACKAGE')
    row=next((e for e in data if int(e.get('r','0'))==row_idx),None)
    cell=next((e for e in row if e.get('r')==command['address']),None) if row is not None else None
    old=cell_info(cell,strings(z))['text'] if cell is not None else ''
    if command.get('expectedText')!=old: raise OfficeError('单元格已改变，请重新读取后修改','CONFLICT')
    if cell is not None and cell.find('s:f',NS) is not None and cell.find('s:f',NS).attrib:
        raise OfficeError('共享或数组公式请在 Excel 中编辑','UNSUPPORTED_EDIT')
    if old==text: return write_package(z,{})
    if row is None:
        row=E.Element('{'+S+'}row',r=str(row_idx)); data.insert(next((i for i,e in enumerate(data) if int(e.get('r','0'))>row_idx),len(data)),row)
    if cell is None:
        cell=E.Element('{'+S+'}c',r=command['address']); row.insert(next((i for i,e in enumerate(row) if address(e.get('r'))[1]>col_idx),len(row)),cell)
    for e in list(cell):
        if E.QName(e).localname in ('v','f','is'): cell.remove(e)
    cell.attrib.pop('t',None)
    if text.startswith('='):
        if len(text)==1: raise OfficeError('公式不能为空','INVALID_INPUT')
        E.SubElement(cell,'{'+S+'}f').text=text[1:]
    elif re.fullmatch(r'-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?',text) and len(text.replace('-','').replace('.',''))<=15:
        E.SubElement(cell,'{'+S+'}v').text=text
    elif text in ('TRUE','FALSE'):
        cell.set('t','b'); E.SubElement(cell,'{'+S+'}v').text='1' if text=='TRUE' else '0'
    elif text:
        cell.set('t','inlineStr'); t=E.SubElement(E.SubElement(cell,'{'+S+'}is'),'{'+S+'}t'); t.set('{http://www.w3.org/XML/1998/namespace}space','preserve'); t.text=text
    dimension=root.find('s:dimension',NS)
    if dimension is not None:
        coords=[address(c.get('r')) for c in root.findall('s:sheetData/s:row/s:c',NS)]
        from openpyxl.utils import get_column_letter
        dimension.set('ref',f'{get_column_letter(min(c for r,c in coords))}{min(r for r,c in coords)}:{get_column_letter(max(c for r,c in coords))}{max(r for r,c in coords)}')
    changes={part:serial(root)}
    for _,sheet_part,sheet_root in items:
        current=root if sheet_part==part else sheet_root; changed=False
        for c in current.findall('s:sheetData/s:row/s:c',NS):
            if c.find('s:f',NS) is not None:
                for cached in c.findall('s:v',NS): c.remove(cached); changed=True
        if changed or sheet_part==part: changes[sheet_part]=serial(current)
    calc=book.find('s:calcPr',NS)
    if calc is None: calc=E.SubElement(book,'{'+S+'}calcPr')
    for key,value in {'calcMode':'auto','fullCalcOnLoad':'1','forceFullCalc':'1','calcId':'0'}.items(): calc.set(key,value)
    changes['xl/workbook.xml']=serial(book); removed=[]
    relpath='xl/_rels/workbook.xml.rels'
    if relpath in z.namelist():
        rel=xml(z.read(relpath))
        for r in list(rel):
            if r.get('Type','').endswith('/calcChain'):
                target=relations(z,'xl/workbook.xml').get(r.get('Id')); rel.remove(r)
                if target: removed.append(target)
        if removed: changes[relpath]=serial(rel)
    if removed:
        ct=xml(z.read('[Content_Types].xml'))
        for node in list(ct):
            if node.get('PartName','').lstrip('/') in removed: ct.remove(node)
        changes['[Content_Types].xml']=serial(ct)
    return write_package(z,changes,removed)

def shape_text(shape):
    paragraphs=shape.findall('p:txBody/a:p',NS)
    return '\n'.join(''.join(p.xpath('.//a:t/text()',namespaces=NS)) for p in paragraphs)

def presentation_slides(z):
    root=xml(z.read('ppt/presentation.xml')); rels=relations(z,'ppt/presentation.xml')
    size=root.find('p:sldSz',NS); width=int(size.get('cx','12192000')) if size is not None else 12192000; height=int(size.get('cy','6858000')) if size is not None else 6858000
    result=[]
    for s in root.findall('p:sldIdLst/p:sldId',NS):
        part=rels.get(s.get('{'+R+'}id'))
        if part not in z.namelist(): raise OfficeError('幻灯片关系缺失','INVALID_OFFICE_PACKAGE')
        result.append((part,xml(z.read(part))))
    return width,height,result

def geometry(shape):
    t=shape.find('p:spPr/a:xfrm',NS)
    if t is None: t=shape.find('p:xfrm',NS)
    if t is None: return {'x':None,'y':None,'width':None,'height':None}
    off=t.find('a:off',NS); ext=t.find('a:ext',NS)
    return {'x':int(off.get('x','0')) if off is not None else None,'y':int(off.get('y','0')) if off is not None else None,
            'width':int(ext.get('cx','0')) if ext is not None else None,'height':int(ext.get('cy','0')) if ext is not None else None,'rotation':int(t.get('rot','0'))/60000}

def inspect_pptx(z):
    width,height,slides=presentation_slides(z); output=[]; images_total=0
    if len(slides)>200: raise OfficeError('基础编辑最多读取 200 页幻灯片','RESOURCE_LIMIT')
    for index,(part,root) in enumerate(slides,1):
        rels=relations(z,part); shapes=[]; tree=root.find('p:cSld/p:spTree',NS)
        for item in tree if tree is not None else []:
            kind=E.QName(item).localname
            if kind not in ('sp','pic','graphicFrame','grpSp','cxnSp'): continue
            ident=item.find('.//p:cNvPr',NS); shape_id=ident.get('id') if ident is not None else ''
            record={'id':shape_id,'name':ident.get('name','') if ident is not None else '', 'type':kind,**geometry(item),'text':shape_text(item),'editable':kind=='sp','movable':kind in ('sp','pic') and geometry(item)['x'] is not None}
            props=item.find('.//a:rPr',NS)
            if props is not None:
                record.update(fontSize=float(props.get('sz','1800'))/100,bold=props.get('b')=='1')
                color=props.find('a:solidFill/a:srgbClr',NS)
                if color is not None: record['color']='#'+color.get('val','000000')
            if kind=='graphicFrame':
                record['text']='\n'.join(item.xpath('.//a:t/text()',namespaces=NS)); record['editable']=False
            if kind=='pic':
                blip=item.find('.//a:blip',NS); target=rels.get(blip.get('{'+R+'}embed')) if blip is not None else None
                if target and target in z.namelist():
                    payload=z.read(target); suffix=posixpath.splitext(target)[1].lower(); mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif'}.get(suffix)
                    if mime and len(payload)<=2*1024*1024 and images_total+len(payload)<=6*1024*1024:
                        record['imageDataUrl']='data:'+mime+';base64,'+base64.b64encode(payload).decode(); images_total+=len(payload)
            shapes.append(record)
        color=root.find('p:cSld/p:bg/p:bgPr/a:solidFill/a:srgbClr',NS)
        output.append({'number':index,'width':width,'height':height,'background':'#'+color.get('val') if color is not None else '#FFFFFF','shapes':shapes})
    return {'type':'pptx','slides':output,'warnings':['网页展示可编辑的文字与图片；母版、主题、图表等原件内容保留，预览不保证与 PowerPoint 完全一致。']}

def edit_pptx(z,command):
    _,_,slides=presentation_slides(z); index=command.get('slide')
    if not isinstance(index,int) or isinstance(index,bool) or not 1<=index<=len(slides): raise OfficeError('幻灯片页码无效','TARGET_NOT_FOUND')
    part,root=slides[index-1]; tree=root.find('p:cSld/p:spTree',NS)
    candidates=[]
    for s in tree if tree is not None else []:
        node=s.find('.//p:cNvPr',NS)
        if node is not None and node.get('id')==str(command.get('shapeId')): candidates.append(s)
    if len(candidates)!=1: raise OfficeError('未找到唯一的文字或图片对象','TARGET_NOT_FOUND')
    shape=candidates[0]; kind=E.QName(shape).localname
    if command.get('op')=='shape.text':
        if kind!='sp': raise OfficeError('仅支持普通文本框文字修改','UNSUPPORTED_EDIT')
        if command.get('expectedText')!=shape_text(shape): raise OfficeError('文本框已改变，请重新读取','CONFLICT')
        text=valid_text(command)
        if text==shape_text(shape): return write_package(z,{})
        if shape.find('.//a:fld',NS) is not None or shape.find('.//a:br',NS) is not None: raise OfficeError('含字段或软换行的文本框请在 PowerPoint 中编辑','UNSUPPORTED_EDIT')
        paragraphs=shape.findall('p:txBody/a:p',NS); values=text.split('\n')
        if len(values)!=len(paragraphs): raise OfficeError('当前文字修改保留段落数量，请逐段修改','UNSUPPORTED_EDIT')
        for p,value in zip(paragraphs,values):
            runs=p.findall('a:r/a:t',NS)
            if not runs: runs=[E.SubElement(E.SubElement(p,'{'+A+'}r'),'{'+A+'}t')]
            offset=0
            for n,t in enumerate(runs):
                length=len(t.text or '') if n<len(runs)-1 else len(value)-offset
                t.text=value[offset:offset+length]; t.set('{http://www.w3.org/XML/1998/namespace}space','preserve'); offset+=length
    elif command.get('op')=='shape.move':
        current=geometry(shape)
        if kind not in ('sp','pic') or current['x'] is None: raise OfficeError('仅支持具有明确坐标的普通文字框和图片移动','UNSUPPORTED_EDIT')
        if command.get('expectedX')!=current['x'] or command.get('expectedY')!=current['y']: raise OfficeError('对象位置已改变，请重新读取','CONFLICT')
        values=[command.get('x'),command.get('y')]
        if any(not isinstance(v,(int,float)) or isinstance(v,bool) or not math.isfinite(v) or abs(v)>100000000 for v in values): raise OfficeError('对象位置无效（单位为 EMU）','INVALID_INPUT')
        off=shape.find('p:spPr/a:xfrm/a:off',NS)
        if off is None: raise OfficeError('对象没有可修改的位置','UNSUPPORTED_EDIT')
        off.set('x',str(round(values[0]))); off.set('y',str(round(values[1])))
    else: raise OfficeError('不支持的 PPT 操作','INVALID_INPUT')
    return write_package(z,{part:serial(root)})

def generate_workbook(spec):
    from openpyxl import Workbook
    from openpyxl.styles import Font,PatternFill,Alignment,Border,Side
    if not isinstance(spec,dict): raise OfficeError('工作簿生成参数无效','INVALID_INPUT')
    parameters=spec.get('parameters',[]); units=spec.get('units',[]); tables=spec.get('tables',[])
    if not isinstance(parameters,list) or not isinstance(units,list) or len(parameters)>1000 or len(units)>1000:
        raise OfficeError('工作簿生成行数超出范围','INVALID_INPUT')
    wb=Workbook(); ws=wb.active; ws.title='项目参数'
    title=str(spec.get('title') or '结构设计项目参数')[:200]
    ws.append([title]); ws.merge_cells('A1:D1'); ws.append(['参数','取值','单位','来源'])
    for p in parameters:
        if not isinstance(p,dict): raise OfficeError('参数记录无效','INVALID_INPUT')
        ws.append([p.get('name',''),p.get('value',''),p.get('unit',''),p.get('source','')])
    units_sheet=wb.create_sheet('结构单体'); units_sheet.append(['名称','面积（m²）','高度（m）','层数','主要功能'])
    for unit in units:
        if not isinstance(unit,dict): raise OfficeError('单体记录无效','INVALID_INPUT')
        units_sheet.append([unit.get('name',''),unit.get('area',''),unit.get('height',''),unit.get('floors',''),unit.get('function','')])
    if not isinstance(tables,list) or len(tables)>20: raise OfficeError('附表数量超出范围','INVALID_INPUT')
    steel_only=spec.get('reportType')=='steel'
    if steel_only:
        if not tables: raise OfficeError('用钢量资料为空','INVALID_INPUT')
        wb.remove(ws);wb.remove(units_sheet)
    for table in tables:
        if not isinstance(table,dict) or not isinstance(table.get('rows'),list) or len(table['rows'])>2000:
            raise OfficeError('附表内容无效','INVALID_INPUT')
        name=re.sub(r'[\\/*?:\[\]]','',str(table.get('name') or '附表'))[:31] or '附表'
        sheet=wb.create_sheet(name)
        for row in table['rows']:
            if not isinstance(row,list) or len(row)>100: raise OfficeError('附表列数超出范围','INVALID_INPUT')
            sheet.append(['' if v is None else v if isinstance(v,(bool,int,float)) else str(v) for v in row])
    for sheet in wb:
        sheet.freeze_panes='A3' if sheet==ws else 'A2'; sheet.sheet_view.showGridLines=False
        header=2 if sheet==ws else 1
        for row in sheet:
            for cell in row:
                # Generated project inputs are literals; formulas require an explicit cell.set.
                if cell.value is not None:
                    if isinstance(cell.value,bool): cell.data_type='b'
                    elif isinstance(cell.value,(int,float)):
                        if not math.isfinite(cell.value): raise OfficeError('生成数值必须为有限数字','INVALID_INPUT')
                        cell.data_type='n'
                    else: cell.value=str(cell.value);cell.data_type='s'
                cell.font=Font(name='微软雅黑',size=11,color='183F35')
                cell.alignment=Alignment(vertical='center',wrap_text=True)
                if cell.row==header:
                    cell.fill=PatternFill('solid',fgColor='E3F0EB'); cell.font=Font(name='微软雅黑',size=11,bold=True,color='183F35')
        for key,width in {'A':28,'B':24,'C':18,'D':42,'E':28}.items(): sheet.column_dimensions[key].width=width
        sheet.row_dimensions[header].height=28
    if not steel_only:
        ws['A1'].font=Font(name='微软雅黑',size=16,bold=True,color='183F35'); ws.row_dimensions[1].height=34
    out=io.BytesIO(); wb.save(out); return out.getvalue()

def main():
    folder=Path(sys.argv[1]); request=json.loads((folder/'request.json').read_text(encoding='utf-8')); kind=request.get('type'); action=request.get('action')
    if action=='generate':
        output=generate_workbook(request.get('command')); (folder/'output.bin').write_bytes(output); return {'ok':True}
    with load_package((folder/'input.bin').read_bytes(),kind) as z:
        if action=='inspect': return inspect_xlsx(z) if kind=='xlsx' else inspect_pptx(z)
        if action!='edit': raise OfficeError('文档操作无效','INVALID_INPUT')
        command=request.get('command')
        if not isinstance(command,dict): raise OfficeError('编辑命令无效','INVALID_INPUT')
        output=edit_xlsx(z,command) if kind=='xlsx' else edit_pptx(z,command)
        (folder/'output.bin').write_bytes(output); return {'ok':True}

if __name__=='__main__':
    try: result=main()
    except Exception as exc: result={'error':str(exc) or '文档解析失败','code':getattr(exc,'code','INVALID_OFFICE_PACKAGE')}
    print(json.dumps(result,ensure_ascii=True,allow_nan=False))
