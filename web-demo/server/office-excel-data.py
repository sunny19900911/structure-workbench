"""Native sheet view/data commands; managed filters retain manual row visibility.

Filter baselines live in a customXml part related from the package root. This
part is deliberately independent of worksheet extensions Excel may discard.
An unmanaged filter or changed managed filter is never silently cleared.
"""
import copy
import math
from openpyxl.utils import get_column_letter

META = 'customXml/workbench-excel-filter.xml'
MNS = 'urn:structure-workbench:excel-filter:v1'
PNS = 'http://schemas.openxmlformats.org/package/2006/relationships'
CNS = 'http://schemas.openxmlformats.org/package/2006/content-types'
OPS = {'range.sort', 'sheet.filter', 'sheet.clearFilter', 'sheet.freeze', 'sheet.protect', 'row.height', 'column.width'}
ORDER = 'sheetPr dimension sheetViews sheetFormatPr cols sheetData sheetCalcPr sheetProtection protectedRanges scenarios autoFilter sortState dataConsolidate customSheetViews mergeCells phoneticPr conditionalFormatting dataValidations hyperlinks printOptions pageMargins pageSetup headerFooter rowBreaks colBreaks customProperties cellWatches ignoredErrors smartTags drawing legacyDrawing legacyDrawingHF picture oleObjects controls webPublishItems tableParts extLst'.split()


def put(root, node, b):
    rank = ORDER.index(b.E.QName(node).localname)
    for i, child in enumerate(root):
        name = b.E.QName(child).localname
        if name in ORDER and ORDER.index(name) > rank:
            root.insert(i, node)
            return
    root.append(node)


def number(value, low, high, b, integer=False):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high or (integer and int(value) != value):
        raise b.OfficeError('数值超出允许范围', 'INVALID_INPUT')
    return int(value) if integer else value


def region(text, b):
    if not isinstance(text, str): raise b.OfficeError('选区无效', 'INVALID_INPUT')
    bits = text.upper().split(':')
    if len(bits) > 2: raise b.OfficeError('选区无效', 'INVALID_INPUT')
    r1, c1 = b.address(bits[0]); r2, c2 = b.address(bits[-1])
    r1, r2 = sorted((r1, r2)); c1, c2 = sorted((c1, c2))
    if (r2-r1+1)*(c2-c1+1) > 10000: raise b.OfficeError('选区超过 10000 格', 'RESOURCE_LIMIT')
    return r1, c1, r2, c2


def readpart(w, path, b):
    return b.xml(w.changes[path] if path in w.changes else w.z.read(path))


def metadata(w, b):
    return readpart(w, META, b) if META in w.changes or META in w.z.namelist() else b.E.Element('{'+MNS+'}filters')


def savemeta(w, data, b):
    w.changes[META] = b.serial(data)
    ct = readpart(w, '[Content_Types].xml', b)
    if not any(x.get('PartName') == '/'+META for x in ct):
        b.E.SubElement(ct, '{'+CNS+'}Override', PartName='/'+META, ContentType='application/xml')
    w.changes['[Content_Types].xml'] = b.serial(ct)
    rel = readpart(w, '_rels/.rels', b)
    if not any(x.get('Target') == '/'+META for x in rel):
        rid = 'workbenchExcelFilter'
        while any(x.get('Id') == rid for x in rel): rid += 'x'
        b.E.SubElement(rel, '{'+PNS+'}Relationship', Id=rid, Type=b.R+'/customXml', Target='/'+META)
    w.changes['_rels/.rels'] = b.serial(rel)


def rows(root, b):
    return {int(x.get('r')): x for x in root.findall('s:sheetData/s:row', b.NS)}


def hidden(row):
    return row.get('hidden', '') if row is not None else ''


def clear_filter(w, item, data, b):
    root = item[2]
    saved = next((x for x in data if x.get('part') == item[1]), None)
    af = root.find('s:autoFilter', b.NS)
    if saved is None:
        if af is not None: raise b.OfficeError('已有筛选不由本编辑器管理，不能安全还原行状态', 'UNSUPPORTED_STRUCTURE')
        return
    expected = saved.find('{'+MNS+'}native')
    if af is None or b.E.tostring(af, method='c14n') != b.E.tostring(expected[0], method='c14n'):
        # Namespace context can differ after serialization: compare normalized attributes/tree.
        def shape(n): return (b.E.QName(n).localname, sorted(n.attrib.items()), [shape(c) for c in n])
        if af is None or shape(af) != shape(expected[0]): raise b.OfficeError('筛选已被其他编辑器修改', 'REVISION_CONFLICT')
    rs = rows(root, b)
    entries = saved.findall('{'+MNS+'}row')
    if any(hidden(rs.get(int(x.get('r')))) != x.get('applied') for x in entries):
        raise b.OfficeError('行隐藏状态已改变，无法安全清除筛选', 'REVISION_CONFLICT')
    for entry in entries:
        row = rs.get(int(entry.get('r')))
        if row is not None:
            if entry.get('before'): row.set('hidden', entry.get('before'))
            else: row.attrib.pop('hidden', None)
            if entry.get('created') == '1' and len(row) == 0 and set(row.attrib) == {'r'}: row.getparent().remove(row)
    root.remove(af); data.remove(saved)


def handle(w, cmd, b):
    op = cmd.get('op')
    if op not in OPS: return False
    item = w.sheet(cmd.get('sheet')); root = item[2]; tag = lambda name: '{'+b.S+'}'+name
    if op == 'sheet.protect':
        if not isinstance(cmd.get('enabled'), bool): raise b.OfficeError('保护状态无效', 'INVALID_INPUT')
        if w.protected(): raise b.OfficeError('工作簿受保护', 'PROTECTED_DOCUMENT')
        current = root.find('s:sheetProtection', b.NS)
        if current is not None and any(k.lower() in ('password', 'hashvalue', 'saltvalue', 'algorithmname', 'spincount') for k in current.attrib):
            raise b.OfficeError('不能修改有密码的工作表保护', 'PROTECTED_DOCUMENT')
        if cmd['enabled'] and current is None: put(root, b.E.Element(tag('sheetProtection'), sheet='1', objects='1', scenarios='1'), b)
        elif not cmd['enabled'] and current is not None: root.remove(current)
        return True
    w.editable(item)
    if op == 'range.sort':
        w.structural_guard()
        if any(x[2].find('.//s:f', b.NS) is not None for x in w.items): raise b.OfficeError('含公式的工作簿暂不支持排序，避免引用变化', 'UNSUPPORTED_STRUCTURE')
        r1,c1,r2,c2 = region(cmd.get('range'), b)
        col = number(cmd.get('column'), c1, c2, b, True)
        if cmd.get('direction', 'asc') not in ('asc','desc') or not isinstance(cmd.get('header',True),bool): raise b.OfficeError('排序参数无效', 'INVALID_INPUT')
        rs = rows(root,b)
        if any(hidden(rs.get(r)) in ('1','true') for r in range(r1,r2+1)): raise b.OfficeError('隐藏行不能参与排序', 'UNSUPPORTED_STRUCTURE')
        if any(x.get('hidden') in ('1','true') and int(x.get('min')) <= c2 and int(x.get('max')) >= c1 for x in root.findall('s:cols/s:col',b.NS)):
            raise b.OfficeError('隐藏列不能参与排序', 'UNSUPPORTED_STRUCTURE')
        cells = w.cells(item); start = r1 + int(cmd.get('header',True))
        def key(r):
            cell = cells.get(f'{get_column_letter(col)}{r}')
            value = b.cell_info(cell,w.shared)['value'] if cell is not None else None
            if value is None or value == '': return None
            if cell.get('t') not in ('s','inlineStr','str','b','e'):
                try: return (0,float(value))
                except (ValueError,TypeError): pass
            return (1,str(value).casefold())
        keys = {r:key(r) for r in range(start,r2+1)}
        order = sorted((r for r in keys if keys[r] is not None), key=keys.get, reverse=cmd.get('direction')=='desc') + [r for r in keys if keys[r] is None]
        source = {(r,c):copy.deepcopy(cells.get(f'{get_column_letter(c)}{r}')) for r in range(start,r2+1) for c in range(c1,c2+1)}
        for dest,src in zip(range(start,r2+1),order):
            for c in range(c1,c2+1):
                address = f'{get_column_letter(c)}{dest}'; old=cells.get(address)
                if old is not None: old.getparent().remove(old)
                value = source[src,c]
                if value is not None:
                    holder = w.ensure(item,address); value.set('r',address); holder.getparent().replace(holder,value)
    elif op in ('sheet.filter','sheet.clearFilter'):
        data = metadata(w,b)
        if op == 'sheet.clearFilter': clear_filter(w,item,data,b); savemeta(w,data,b); return True
        r1,c1,r2,c2 = region(cmd.get('range'),b); col=number(cmd.get('column'),c1,c2,b,True)
        operator=cmd.get('operator'); value=cmd.get('value')
        if operator not in ('contains','equal','greaterThan','lessThan') or not isinstance(value,str) or len(value)>1000: raise b.OfficeError('筛选参数无效','INVALID_INPUT')
        if operator in ('greaterThan','lessThan'):
            try: numeric=float(value)
            except ValueError: raise b.OfficeError('数值筛选需要有效数字','INVALID_INPUT')
            if not math.isfinite(numeric): raise b.OfficeError('筛选数字无效','INVALID_INPUT')
        if root.find('s:tableParts',b.NS) is not None or root.find('s:mergeCells',b.NS) is not None: raise b.OfficeError('合并单元格或表格对象暂不支持筛选','UNSUPPORTED_STRUCTURE')
        cells=w.cells(item)
        if any(cells.get(f'{get_column_letter(col)}{r}') is not None and cells[f'{get_column_letter(col)}{r}'].find(tag('f')) is not None for r in range(r1+1,r2+1)): raise b.OfficeError('筛选列含公式，暂不使用可能失效的缓存','UNSUPPORTED_STRUCTURE')
        clear_filter(w,item,data,b)
        saved=b.E.SubElement(data,'{'+MNS+'}filter',part=item[1],range=cmd['range'],column=str(col),operator=operator,value=value)
        af=b.E.Element(tag('autoFilter'),ref=f'{get_column_letter(c1)}{r1}:{get_column_letter(c2)}{r2}')
        fc=b.E.SubElement(af,tag('filterColumn'),colId=str(col-c1)); cf=b.E.SubElement(fc,tag('customFilters'))
        native=value.replace('~','~~').replace('*','~*').replace('?','~?') if operator in ('contains','equal') else value
        b.E.SubElement(cf,tag('customFilter'),operator='equal' if operator=='contains' else operator,val='*'+native+'*' if operator=='contains' else native)
        put(root,af,b); b.E.SubElement(saved,'{'+MNS+'}native').append(copy.deepcopy(af))
        rs=rows(root,b); sheetdata=root.find('s:sheetData',b.NS)
        for r in range(r1+1,r2+1):
            cell=cells.get(f'{get_column_letter(col)}{r}'); raw=b.cell_info(cell,w.shared)['value'] if cell is not None else ''
            text='' if raw is None else str(raw)
            if operator=='contains': matches=value.casefold() in text.casefold()
            elif operator=='equal': matches=value.casefold()==text.casefold()
            else:
                try: matches=math.isfinite(float(text)) and (float(text)>numeric if operator=='greaterThan' else float(text)<numeric)
                except ValueError: matches=False
            row=rs.get(r); before=hidden(row); created=row is None
            if row is None: row=b.E.SubElement(sheetdata,tag('row'),r=str(r))
            if not matches: row.set('hidden','1')
            b.E.SubElement(saved,'{'+MNS+'}row',r=str(r),before=before,applied=hidden(row),created='1' if created else '0')
        savemeta(w,data,b)
    elif op == 'sheet.freeze':
        nr=number(cmd.get('rows',0),0,1048575,b,True); nc=number(cmd.get('columns',0),0,16383,b,True)
        views=root.find('s:sheetViews',b.NS)
        if views is None: views=b.E.Element(tag('sheetViews')); put(root,views,b)
        view=views.find('s:sheetView',b.NS)
        if view is None: view=b.E.SubElement(views,tag('sheetView'),workbookViewId='0')
        for x in list(view):
            if b.E.QName(x).localname in ('pane','selection'): view.remove(x)
        if nr or nc:
            active='bottomRight' if nr and nc else 'bottomLeft' if nr else 'topRight'
            pane=b.E.Element(tag('pane'),topLeftCell=f'{get_column_letter(nc+1)}{nr+1}',activePane=active,state='frozen')
            if nr: pane.set('ySplit',str(nr))
            if nc: pane.set('xSplit',str(nc))
            view.insert(0,pane); b.E.SubElement(view,tag('selection'),pane=active,activeCell=pane.get('topLeftCell'),sqref=pane.get('topLeftCell'))
    elif op == 'row.height':
        index=number(cmd.get('index'),1,1048576,b,True); count=number(cmd.get('count',1),1,10000,b,True); height=number(cmd.get('height'),1,409,b)
        number(index+count-1,1,1048576,b,True); rs=rows(root,b)
        for r in range(index,index+count):
            row=rs.get(r)
            if row is None: row=b.E.SubElement(root.find('s:sheetData',b.NS),tag('row'),r=str(r))
            row.set('ht',str(height)); row.set('customHeight','1')
    elif op == 'column.width':
        index=number(cmd.get('index'),1,16384,b,True); count=number(cmd.get('count',1),1,16384,b,True); width=number(cmd.get('width'),1,255,b)
        end=number(index+count-1,1,16384,b,True); cols=root.find('s:cols',b.NS)
        if cols is None: cols=b.E.Element(tag('cols')); put(root,cols,b)
        mapped={}
        for node in cols:
            for c in range(int(node.get('min')),int(node.get('max'))+1):
                if c in mapped: raise b.OfficeError('重叠列定义暂不支持修改','UNSUPPORTED_STRUCTURE')
                mapped[c]=dict(node.attrib)
        for c in range(index,end+1): mapped.setdefault(c,{}).update(width=str(width),customWidth='1')
        for node in list(cols): cols.remove(node)
        for c,attrs in sorted(mapped.items()):
            attrs.update(min=str(c),max=str(c)); b.E.SubElement(cols,tag('col'),**attrs)
    return True


def decorate(view,w,b):
    data=metadata(w,b)
    for output,item in zip(view['sheets'],w.items):
        root=item[2]; rs=rows(root,b); pane=root.find('s:sheetViews/s:sheetView/s:pane',b.NS)
        output['hiddenRows']=[r for r,node in rs.items() if hidden(node) in ('1','true')]
        output['rowHeights']={str(r):float(node.get('ht')) for r,node in rs.items() if node.get('ht') is not None}
        output['columnWidths']=[{'min':int(x.get('min')),'max':int(x.get('max')),'width':float(x.get('width','13')),'hidden':x.get('hidden') in ('1','true')} for x in root.findall('s:cols/s:col',b.NS)]
        output['freeze']={'rows':int(float(pane.get('ySplit','0'))),'columns':int(float(pane.get('xSplit','0')))} if pane is not None and pane.get('state') in ('frozen','frozenSplit') else {'rows':0,'columns':0}
        output['protected']=root.find('s:sheetProtection',b.NS) is not None
        saved=next((x for x in data if x.get('part')==item[1]),None)
        output['filter']=dict(saved.attrib,managed=True) if saved is not None else None
