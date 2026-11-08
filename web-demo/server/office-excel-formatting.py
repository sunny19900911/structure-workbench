"""Bounded native XLSX formatting commands; no workbook reserialization by openpyxl.

handle(w, command, base) mutates the existing Workbook's XML and returns whether
the command belongs to this module. decorate(view, w, base) adds display metadata.
"""
import copy
import math
import re
from openpyxl.utils import get_column_letter


COMMANDS = {'range.style', 'range.clearStyle', 'range.copyStyle', 'range.merge',
            'range.unmerge', 'range.tableStyle', 'range.conditional', 'range.clearConditional'}
STYLE_KEYS = {'font', 'fontSize', 'bold', 'italic', 'underline', 'strike', 'fontColor',
              'fillColor', 'horizontal', 'vertical', 'wrapText', 'rotation', 'border'}
SHEET_ORDER = ['sheetPr', 'dimension', 'sheetViews', 'sheetFormatPr', 'cols', 'sheetData',
               'sheetCalcPr', 'sheetProtection', 'protectedRanges', 'scenarios', 'autoFilter',
               'sortState', 'dataConsolidate', 'customSheetViews', 'mergeCells', 'phoneticPr',
               'conditionalFormatting', 'dataValidations', 'hyperlinks', 'printOptions',
               'pageMargins', 'pageSetup', 'headerFooter', 'rowBreaks', 'colBreaks',
               'customProperties', 'cellWatches', 'ignoredErrors', 'smartTags', 'drawing',
               'legacyDrawing', 'legacyDrawingHF', 'picture', 'oleObjects', 'controls',
               'webPublishItems', 'tableParts', 'extLst']
STYLE_ORDER = ['numFmts', 'fonts', 'fills', 'borders', 'cellStyleXfs', 'cellXfs',
               'cellStyles', 'dxfs', 'tableStyles', 'colors', 'extLst']


def _area(text, base):
    if not isinstance(text, str) or not re.fullmatch(r'[A-Z]{1,3}[1-9][0-9]*(?::[A-Z]{1,3}[1-9][0-9]*)?', text):
        raise base.OfficeError('选区无效', 'INVALID_INPUT')
    points = text.split(':'); r1,c1 = base.address(points[0]); r2,c2 = base.address(points[-1])
    area = (min(r1,r2), min(c1,c2), max(r1,r2), max(c1,c2))
    if (area[2]-area[0]+1)*(area[3]-area[1]+1) > 10000:
        raise base.OfficeError('单次格式选区不能超过 10000 格', 'RESOURCE_LIMIT')
    return area


def _refs(area):
    r1,c1,r2,c2 = area
    return [f'{get_column_letter(c)}{r}' for r in range(r1,r2+1) for c in range(c1,c2+1)]


def _ref(area):
    r1,c1,r2,c2=area
    return f'{get_column_letter(c1)}{r1}:{get_column_letter(c2)}{r2}'


def _intersects(a,b):
    return a[0] <= b[2] and b[0] <= a[2] and a[1] <= b[3] and b[1] <= a[3]


def _contains(a,b):
    return a[0] <= b[0] <= b[2] <= a[2] and a[1] <= b[1] <= b[3] <= a[3]


def _insert(parent, node, order, base):
    rank = order.index(base.E.QName(node).localname)
    for index, child in enumerate(parent):
        name=base.E.QName(child).localname
        if name in order and order.index(name) > rank:
            parent.insert(index,node); return node
    parent.append(node); return node


def _part(parent,name,order,base):
    found=parent.find('s:'+name,base.NS)
    if found is None: found=_insert(parent,base.E.Element('{'+base.S+'}'+name),order,base)
    return found


def _signature(node):
    # Style component child order carries no formatting meaning. Normalize for
    # deduplication so changing one font property cannot grow styles repeatedly.
    return (node.tag,tuple(sorted(node.attrib.items())),node.text,tuple(sorted((_signature(c) for c in node),key=repr)))


def _intern(collection,node):
    signature=_signature(node)
    for i,existing in enumerate(collection):
        if _signature(existing)==signature: return i
    collection.append(node); collection.set('count',str(len(collection))); return len(collection)-1


def _color(value, base):
    if not isinstance(value,str) or not re.fullmatch(r'#[0-9a-fA-F]{6}',value):
        raise base.OfficeError('颜色须为 #RRGGBB', 'INVALID_INPUT')
    return 'FF'+value[1:].upper()


def _validate_style(style,base):
    if not isinstance(style,dict) or not style or set(style)-STYLE_KEYS:
        raise base.OfficeError('格式参数为空或含未知属性','INVALID_INPUT')
    for key in ('bold','italic','underline','strike','wrapText'):
        if key in style and type(style[key]) is not bool: raise base.OfficeError(key+' 必须为布尔值','INVALID_INPUT')
    if 'font' in style and (not isinstance(style['font'],str) or not style['font'].strip() or len(style['font'])>80 or re.search(r'[\x00-\x1f]',style['font'])):
        raise base.OfficeError('字体名称无效','INVALID_INPUT')
    if 'fontSize' in style and (type(style['fontSize']) not in (int,float) or not math.isfinite(style['fontSize']) or not 6<=style['fontSize']<=96):
        raise base.OfficeError('字号应在 6–96 之间','INVALID_INPUT')
    if 'rotation' in style and (type(style['rotation']) is not int or not -90<=style['rotation']<=90):
        raise base.OfficeError('文字角度应为 -90–90 的整数','INVALID_INPUT')
    for key,options in {'horizontal':('left','center','right','general'), 'vertical':('top','center','bottom'), 'border':('all','outside','none')}.items():
        if key in style and style[key] not in options: raise base.OfficeError(key+' 无效','INVALID_INPUT')
    for key in ('fontColor','fillColor'):
        if key in style: _color(style[key],base)


def _editable_range(w,item,area,base):
    w.editable(item)
    # Formatting a whole merged region is allowed; partial selections are rejected.
    merges=[]
    for merge in item[2].findall('s:mergeCells/s:mergeCell',base.NS):
        region=_area(merge.get('ref'),base)
        if _intersects(area,region):
            if not _contains(area,region): raise base.OfficeError('请选中完整的合并区域','UNSUPPORTED_EDIT')
            merges.append(region)
    for address in _refs(area):
        r,c=base.address(address)
        if any(x[0]<=r<=x[2] and x[1]<=c<=x[3] and (r,c)!=(x[0],x[1]) for x in merges): continue
        w.editable(item,address)


def _style_index(w,old,style,sides,base):
    if w.styles is None: raise base.OfficeError('工作簿缺少样式表','UNSUPPORTED_EDIT')
    E,S,NS=base.E,base.S,base.NS
    xfs=w.styles.find('s:cellXfs',NS)
    if xfs is None or not 0<=old<len(xfs): raise base.OfficeError('单元格样式索引无效','INVALID_XLSX')
    xf=copy.deepcopy(xfs[old])
    if any(k in style for k in ('font','fontSize','bold','italic','underline','strike','fontColor')):
        fonts=_part(w.styles,'fonts',STYLE_ORDER,base); index=int(xf.get('fontId','0'))
        if not 0<=index<len(fonts): raise base.OfficeError('字体索引无效','INVALID_XLSX')
        font=copy.deepcopy(fonts[index])
        def set_font(name,value=None,enabled=True):
            for old_node in font.findall('s:'+name,NS): font.remove(old_node)
            if enabled:
                node=E.SubElement(font,'{'+S+'}'+name)
                if value is not None: node.set('val',str(value))
        if 'font' in style:
            set_font('name',style['font']); set_font('scheme',enabled=False)
        if 'fontSize' in style: set_font('sz',style['fontSize'])
        for key,name in [('bold','b'),('italic','i'),('underline','u'),('strike','strike')]:
            if key in style: set_font(name,'single' if name=='u' else None,style[key])
        if 'fontColor' in style:
            for color in font.findall('s:color',NS): font.remove(color)
            E.SubElement(font,'{'+S+'}color',rgb=_color(style['fontColor'],base))
        xf.set('fontId',str(_intern(fonts,font))); xf.set('applyFont','1')
    if 'fillColor' in style:
        fills=_part(w.styles,'fills',STYLE_ORDER,base); fill=E.Element('{'+S+'}fill')
        pattern=E.SubElement(fill,'{'+S+'}patternFill',patternType='solid')
        E.SubElement(pattern,'{'+S+'}fgColor',rgb=_color(style['fillColor'],base)); E.SubElement(pattern,'{'+S+'}bgColor',indexed='64')
        xf.set('fillId',str(_intern(fills,fill))); xf.set('applyFill','1')
    if 'border' in style:
        borders=_part(w.styles,'borders',STYLE_ORDER,base); index=int(xf.get('borderId','0'))
        if not 0<=index<len(borders): raise base.OfficeError('边框索引无效','INVALID_XLSX')
        border=copy.deepcopy(borders[index])
        if style['border']=='none':
            border=E.Element('{'+S+'}border')
            for side in ('left','right','top','bottom','diagonal'): E.SubElement(border,'{'+S+'}'+side)
        else:
            order=['start','end','left','right','top','bottom','diagonal','vertical','horizontal']
            for side in sides:
                old_side=border.find('s:'+side,NS)
                if old_side is not None: border.remove(old_side)
                node=E.Element('{'+S+'}'+side,style='thin'); E.SubElement(node,'{'+S+'}color',rgb='FF667085')
                _insert(border,node,order,base)
        xf.set('borderId',str(_intern(borders,border))); xf.set('applyBorder','1')
    if any(k in style for k in ('horizontal','vertical','wrapText','rotation')):
        align=xf.find('s:alignment',NS)
        if align is None:
            align=E.Element('{'+S+'}alignment'); xf.insert(0,align)
        for key in ('horizontal','vertical'):
            if key in style: align.set(key,style[key])
        if 'wrapText' in style: align.set('wrapText','1' if style['wrapText'] else '0')
        if 'rotation' in style: align.set('textRotation',str(style['rotation'] if style['rotation']>=0 else 90-style['rotation']))
        xf.set('applyAlignment','1')
    return _intern(xfs,xf)


def _apply_style(w,item,area,style,base):
    _validate_style(style,base); _editable_range(w,item,area,base); cache={}
    for address in _refs(area):
        cell=w.ensure(item,address); r,c=base.address(address); sides=('left','right','top','bottom')
        if style.get('border')=='outside':
            sides=tuple(k for k,yes in [('left',c==area[1]),('right',c==area[3]),('top',r==area[0]),('bottom',r==area[2])] if yes)
        key=(int(cell.get('s','0')),sides)
        if key not in cache: cache[key]=_style_index(w,key[0],style,sides,base)
        cell.set('s',str(cache[key]))
    w.changes['xl/styles.xml']=base.serial(w.styles)


def _conditional_ranges(node,base):
    return [_area(text,base) for text in node.get('sqref','').split()]


def handle(w,cmd,base):
    op=cmd.get('op')
    if op not in COMMANDS: return False
    item=w.sheet(cmd.get('sheet')); area=_area(cmd.get('range'),base); w.editable(item)
    E,S,NS=base.E,base.S,base.NS
    if op=='range.style': _apply_style(w,item,area,cmd.get('style'),base)
    elif op=='range.clearStyle':
        _editable_range(w,item,area,base)
        for addr in _refs(area): w.ensure(item,addr).attrib.pop('s',None)
    elif op=='range.copyStyle':
        source=cmd.get('source'); base.address(source); _editable_range(w,item,area,base)
        cell=w.cells(item).get(source); index=cell.get('s','0') if cell is not None else '0'
        for addr in _refs(area): w.ensure(item,addr).set('s',index)
    elif op in ('range.merge','range.unmerge'):
        merges=item[2].find('s:mergeCells',NS)
        intersections=[]
        if merges is not None:
            for node in merges:
                region=_area(node.get('ref'),base)
                if _intersects(area,region): intersections.append((node,region))
        if op=='range.unmerge':
            for node,region in intersections:
                if not _contains(area,region): raise base.OfficeError('不能只拆分合并区域的一部分','UNSUPPORTED_EDIT')
            for node,_ in intersections: merges.remove(node)
            if merges is not None:
                if len(merges): merges.set('count',str(len(merges)))
                else: item[2].remove(merges)
        else:
            if area[0]==area[2] and area[1]==area[3]: raise base.OfficeError('请选择两个或更多单元格','INVALID_INPUT')
            if len(intersections)==1 and intersections[0][1]==area: return True
            if intersections: raise base.OfficeError('选区与已有合并区域相交，请先取消合并','UNSUPPORTED_EDIT')
            _editable_range(w,item,area,base); cells=w.cells(item)
            for addr in _refs(area)[1:]:
                cell=cells.get(addr)
                if cell is not None and (cell.find('s:f',NS) is not None or base.cell_info(cell,w.shared)['text']!=''):
                    raise base.OfficeError('合并会丢失其他单元格内容，请先保留内容或清空后合并','MERGE_CONTENT_CONFLICT')
            merges=_part(item[2],'mergeCells',SHEET_ORDER,base)
            E.SubElement(merges,'{'+S+'}mergeCell',ref=_ref(area)); merges.set('count',str(len(merges)))
    elif op=='range.tableStyle':
        themes={'blue':('#305E9A','#EAF1FB'),'green':('#397865','#EAF4EF'),'gray':('#596575','#EFF1F4')}
        if cmd.get('theme') not in themes: raise base.OfficeError('表格样式无效','INVALID_INPUT')
        header,body=themes[cmd['theme']]; _editable_range(w,item,area,base)
        _apply_style(w,item,(area[0],area[1],area[0],area[3]),{'fillColor':header,'fontColor':'#FFFFFF','bold':True},base)
        for row in range(area[0]+1,area[2]+1):
            _apply_style(w,item,(row,area[1],row,area[3]),{'fillColor':body if (row-area[0])%2 else '#FFFFFF'},base)
    elif op=='range.conditional':
        _editable_range(w,item,area,base)
        operator=cmd.get('operator'); value=cmd.get('value'); second=cmd.get('value2')
        if operator not in ('greaterThan','lessThan','equal','between') or type(value) not in (int,float) or not math.isfinite(value):
            raise base.OfficeError('条件格式比较规则或数值无效','INVALID_INPUT')
        if operator=='between' and (type(second) not in (int,float) or not math.isfinite(second) or second<value):
            raise base.OfficeError('条件格式上限应不小于下限','INVALID_INPUT')
        rgb=_color(cmd.get('color'),base)
        if w.styles is None: raise base.OfficeError('工作簿缺少样式表','UNSUPPORTED_EDIT')
        dxfs=_part(w.styles,'dxfs',STYLE_ORDER,base); dxf=E.Element('{'+S+'}dxf'); fill=E.SubElement(dxf,'{'+S+'}fill'); pattern=E.SubElement(fill,'{'+S+'}patternFill',patternType='solid'); E.SubElement(pattern,'{'+S+'}fgColor',rgb=rgb)
        index=_intern(dxfs,dxf)
        priorities=[int(n.get('priority','0')) for n in item[2].findall('s:conditionalFormatting/s:cfRule',NS)]
        if len(priorities)>=1000: raise base.OfficeError('条件格式规则超过 1000 条','RESOURCE_LIMIT')
        node=E.Element('{'+S+'}conditionalFormatting',sqref=_ref(area)); rule=E.SubElement(node,'{'+S+'}cfRule',type='cellIs',operator=operator,dxfId=str(index),priority=str(max(priorities,default=0)+1))
        E.SubElement(rule,'{'+S+'}formula').text=str(value)
        if operator=='between': E.SubElement(rule,'{'+S+'}formula').text=str(second)
        _insert(item[2],node,SHEET_ORDER,base); w.changes['xl/styles.xml']=base.serial(w.styles)
    else:
        # Clear only complete selected rules; never silently broaden a partial selection.
        pending=[]
        for node in item[2].findall('s:conditionalFormatting',NS):
            ranges=_conditional_ranges(node,base)
            if any(_intersects(area,region) for region in ranges):
                if not all(_contains(area,region) for region in ranges):
                    raise base.OfficeError('请选中条件格式覆盖的完整区域再清除','UNSUPPORTED_EDIT')
                pending.append(node)
        for node in pending: item[2].remove(node)
    return True


def decorate(view,w,base):
    """Expose formatting separately from formula/calculation state.

    styles gains italic/underline/strike/vertical/wrapText/rotation/borders. A
    matching supported native conditional rule adds cell.conditionalStyle.fillColor.
    All conditional rule descriptors are exposed with supported/unsupported status.
    """
    if w.styles is None: return
    NS=base.NS
    fonts=w.styles.findall('s:fonts/s:font',NS); borders=w.styles.findall('s:borders/s:border',NS)
    def enabled(parent,name):
        node=parent.find('s:'+name,NS)
        return node is not None and node.get('val','1') not in ('0','false','none')
    def color(node):
        if node is None: return None
        rgb=node.get('rgb')
        return '#'+rgb[-6:] if rgb and re.fullmatch(r'(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})',rgb) else None
    for i,xf in enumerate(w.styles.findall('s:cellXfs/s:xf',NS)):
        if i>=len(view.get('styles',[])): break
        style=view['styles'][i]; index=int(xf.get('fontId','0')); font=fonts[index] if 0<=index<len(fonts) else base.E.Element('font')
        align=xf.find('s:alignment',NS); rotation=int(align.get('textRotation','0')) if align is not None else 0
        style.update(bold=enabled(font,'b'),italic=enabled(font,'i'),underline=enabled(font,'u'),strike=enabled(font,'strike'),vertical=align.get('vertical','bottom') if align is not None else 'bottom',wrapText=align is not None and align.get('wrapText') in ('1','true'),rotation=90-rotation if 90<rotation<=180 else rotation)
        index=int(xf.get('borderId','0')); border=borders[index] if 0<=index<len(borders) else None; side_styles={}
        if border is not None:
            for side in ('left','right','top','bottom'):
                edge=border.find('s:'+side,NS)
                if edge is not None and edge.get('style'):
                    side_styles[side]={'style':edge.get('style'),'color':color(edge.find('s:color',NS)) or '#667085'}
        style['borders']=side_styles
    dxfs=w.styles.findall('s:dxfs/s:dxf',NS)
    for sheet in view.get('sheets',[]):
        root=w.sheet(sheet['name'])[2]; rules=[]
        for node in root.findall('s:conditionalFormatting',NS):
            for rule in node.findall('s:cfRule',NS):
                operator=rule.get('operator'); formulas=[x.text or '' for x in rule.findall('s:formula',NS)]; values=[]
                supported=rule.get('type')=='cellIs' and operator in ('greaterThan','lessThan','equal','between')
                try: regions=_conditional_ranges(node,base)
                except base.OfficeError: regions=[]; supported=False
                try:
                    values=[float(x) for x in formulas]
                    supported=supported and len(values)==(2 if operator=='between' else 1) and all(math.isfinite(x) for x in values)
                except ValueError: supported=False
                ident=int(rule.get('dxfId','-1')); fill=dxfs[ident].find('s:fill/s:patternFill/s:fgColor',NS) if 0<=ident<len(dxfs) else None
                fill_color=color(fill); supported=supported and bool(fill_color)
                rules.append({'range':node.get('sqref'),'operator':operator,'values':values,'fillColor':fill_color,'priority':int(rule.get('priority','0')),'supported':supported,'stopIfTrue':rule.get('stopIfTrue') in ('1','true'),'regions':regions})
        sheet['conditionalFormats']=[{k:v for k,v in rule.items() if k!='regions'} for rule in rules]
        for cell in sheet.get('cells',[]):
            value=cell.get('value')
            if cell.get('valueType')=='b' or isinstance(value,bool) or cell.get('calculationStatus') in ('unsupported','error'): continue
            if cell.get('formula') is None and cell.get('valueType')!='n': continue
            try:
                if value is None or value=='': continue
                value=float(value);r,c=base.address(cell['address'])
            except (TypeError,ValueError,base.OfficeError): continue
            if not math.isfinite(value): continue
            for rule in sorted(rules,key=lambda r:r['priority']):
                if not any(a<=r<=z and b<=c<=d for a,b,z,d in rule['regions']): continue
                # An unknown higher-priority rule may supply a fill or stop lower rules.
                if not rule['supported']: break
                threshold=rule['values'][0];operator=rule['operator']
                match=value>threshold if operator=='greaterThan' else value<threshold if operator=='lessThan' else value==threshold if operator=='equal' else threshold<=value<=rule['values'][1]
                if match:
                    cell['conditionalStyle']={'fillColor':rule['fillColor']};break
