"""Native XLSX extension. Existing package parts survive untouched unless edited."""
import copy
import importlib.util
import io
import json
import math
import re
import sys
import zipfile
from pathlib import Path
from openpyxl.utils import get_column_letter
from openpyxl.formula.tokenizer import Tokenizer
from openpyxl.formula.translate import Translator


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    result = importlib.util.module_from_spec(spec); spec.loader.exec_module(result)
    return result


base = module('excel_base', 'office-package.py')
calc = module('excel_formula', 'office-excel-formulas.py')
data_commands = module('excel_data', 'office-excel-data.py')
formatting_commands = module('excel_formatting', 'office-excel-formatting.py')
E, S, R, NS = base.E, base.S, base.R, base.NS
Error = base.OfficeError
FORMATS = {'general':'General', 'integer':'0', 'decimal':'0.00', 'thousands':'#,##0.00',
           'percent':'0.00%', 'scientific':'0.00E+00', 'date':'yyyy-mm-dd', 'text':'@'}
REF = re.compile(r"^(?:(?P<sheet>'(?:[^']|'')+'|[^!\[\]:]+)!)?(?P<a>\$?[A-Za-z]{1,3}\$?[1-9][0-9]*)(?::(?P<b>\$?[A-Za-z]{1,3}\$?[1-9][0-9]*))?$")


def reference(text, current):
    m = REF.fullmatch(text)
    if not m: raise calc.FormulaError('暂不支持引用：' + text, '#NAME?', True)
    name = m['sheet']
    if name and name.startswith("'"): name = name[1:-1].replace("''", "'")
    a, b = m['a'].replace('$', '').upper(), (m['b'] or m['a']).replace('$', '').upper()
    try: r1, c1 = base.address(a); r2, c2 = base.address(b)
    except Error: raise calc.FormulaError('引用超出工作表范围', '#REF!')
    return name or current, (min(r1,r2), min(c1,c2), max(r1,r2), max(c1,c2)), m


def bounds(text):
    if not isinstance(text, str) or '!' in text or '$' in text: raise Error('选区无效', 'INVALID_INPUT')
    try: return reference(text, '')[1]
    except calc.FormulaError as e: raise Error(str(e), 'INVALID_INPUT')


def addresses(region):
    r1,c1,r2,c2 = region
    if (r2-r1+1)*(c2-c1+1)>10000: raise Error('单次选区不能超过 10000 格', 'RESOURCE_LIMIT')
    return [f'{get_column_letter(c)}{r}' for r in range(r1,r2+1) for c in range(c1,c2+1)]


class Workbook:
    def __init__(self, data):
        self.z = base.load_package(data, 'xlsx')
        self.book, self.items = base.sheets(self.z)
        self.shared = base.strings(self.z)
        self.changes, self.removed = {}, set()
        self.styles = base.xml(self.z.read('xl/styles.xml')) if 'xl/styles.xml' in self.z.namelist() else None
        if sum(len(root.findall('s:sheetData/s:row/s:c',NS)) for _,_,root in self.items)>40000:
            raise Error('工作簿超过 40000 个单元格限制', 'RESOURCE_LIMIT')

    def sheet(self, name):
        for item in self.items:
            if item[0].get('name') == name: return item
        raise Error('工作表不存在', 'TARGET_NOT_FOUND')

    def cells(self, item):
        return {c.get('r'):c for c in item[2].findall('s:sheetData/s:row/s:c',NS)}

    def ensure(self, item, address):
        r,c = base.address(address); root=item[2]; data=root.find('s:sheetData',NS)
        row = next((x for x in data if int(x.get('r','0'))==r),None)
        if row is None:
            row=E.Element('{'+S+'}row',r=str(r)); data.append(row)
        cell=next((x for x in row if x.get('r')==address),None)
        if cell is None: cell=E.SubElement(row,'{'+S+'}c',r=address)
        return cell

    def editable(self, item, address=None):
        if self.protected() or item[2].find('s:sheetProtection',NS) is not None:
            raise Error('工作簿或工作表受保护', 'PROTECTED_DOCUMENT')
        if address:
            r,c=base.address(address)
            for merge in item[2].findall('s:mergeCells/s:mergeCell',NS):
                r1,c1,r2,c2=bounds(merge.get('ref'))
                if r1<=r<=r2 and c1<=c<=c2 and (r,c)!=(r1,c1): raise Error('请编辑合并区域左上角', 'UNSUPPORTED_EDIT')
            for f in item[2].findall('s:sheetData/s:row/s:c/s:f',NS):
                if f.attrib:
                    area=f.get('ref')
                    if area:
                        r1,c1,r2,c2=bounds(area)
                        if r1<=r<=r2 and c1<=c<=c2: raise Error('共享、数组或数据表公式区域暂不支持编辑', 'UNSUPPORTED_EDIT')
                    if f.getparent().get('r')==address: raise Error('共享、数组或数据表公式暂不支持编辑', 'UNSUPPORTED_EDIT')

    def set_text(self,item,address,text,expected=None,check=False):
        self.editable(item,address)
        if not isinstance(text,str) or len(text)>32767 or any(ord(c)<32 and c not in '\r\n\t' for c in text):
            raise Error('单元格文字无效或超过 32767 字', 'INVALID_INPUT')
        cell=self.ensure(item,address)
        if check and base.cell_info(cell,self.shared)['text']!=expected: raise Error('单元格原文已变化', 'CONFLICT')
        text_format=False
        if self.styles is not None:
            xfs=self.styles.find('s:cellXfs',NS); style=int(cell.get('s','0'))
            if xfs is not None and style<len(xfs):
                fmt=xfs[style].get('numFmtId','0')
                text_format=fmt=='49' or any(n.get('numFmtId')==fmt and n.get('formatCode')=='@' for n in self.styles.findall('s:numFmts/s:numFmt',NS))
        for child in list(cell):
            if E.QName(child).localname in ('f','v','is'): cell.remove(child)
        cell.attrib.pop('t',None)
        if text_format and text:
            cell.set('t','inlineStr'); t=E.SubElement(E.SubElement(cell,'{'+S+'}is'),'{'+S+'}t'); t.set('{http://www.w3.org/XML/1998/namespace}space','preserve'); t.text=text
        elif text.startswith('='):
            if len(text)==1: raise Error('公式不能为空', 'INVALID_INPUT')
            E.SubElement(cell,'{'+S+'}f').text=text[1:]
        elif re.fullmatch(r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?',text) and len(re.sub(r'[^0-9]','',text))<=15 and math.isfinite(float(text)):
            E.SubElement(cell,'{'+S+'}v').text=str(float(text))
        elif text in ('TRUE','FALSE'):
            cell.set('t','b'); E.SubElement(cell,'{'+S+'}v').text='1' if text=='TRUE' else '0'
        elif text:
            cell.set('t','inlineStr'); t=E.SubElement(E.SubElement(cell,'{'+S+'}is'),'{'+S+'}t')
            t.set('{http://www.w3.org/XML/1998/namespace}space','preserve'); t.text=text[1:] if text.startswith("'") else text

    def protected(self):
        node=self.book.find('s:workbookProtection',NS)
        return node is not None and any(node.get(k) in ('1','true') for k in ('lockStructure','lockWindows','lockRevision'))

    def structural_guard(self):
        # References in charts, tables, defined names, validations and extensions need
        # their own translators. Reject before mutation rather than corrupting them.
        if self.protected(): raise Error('工作簿受保护','PROTECTED_DOCUMENT')
        names=self.book.find('s:definedNames',NS)
        if names is not None and len(names): raise Error('含命名区域或打印区域，暂不支持结构调整','UNSUPPORTED_STRUCTURE')
        for info,part,root in self.items:
            self.editable((info,part,root))
            allowed={'sheetPr','dimension','sheetViews','sheetFormatPr','cols','sheetData','pageMargins','pageSetup','printOptions','headerFooter'}
            unknown=[E.QName(n).localname for n in root if E.QName(n).localname not in allowed]
            if unknown: raise Error('含 '+','.join(unknown)+'，暂不支持结构调整','UNSUPPORTED_STRUCTURE')
            props=root.find('s:sheetPr',NS)
            if props is not None and props.get('syncRef'): raise Error('含同步引用，暂不支持结构调整','UNSUPPORTED_STRUCTURE')
            if root.find('s:sheetViews/s:sheetView/s:pane',NS) is not None: raise Error('含冻结或拆分窗格，暂不支持结构调整','UNSUPPORTED_STRUCTURE')
            if any(f.attrib for f in root.findall('s:sheetData/s:row/s:c/s:f',NS)):
                raise Error('含共享、数组或数据表公式，暂不支持结构调整','UNSUPPORTED_STRUCTURE')
        if any(n.startswith(('xl/tables/','xl/charts/','xl/pivot','xl/externalLinks/','xl/drawings/')) for n in self.z.namelist()):
            raise Error('含图表、数据表、透视表或外链，暂不支持结构调整','UNSUPPORTED_STRUCTURE')

    def rewrite(self, target, op, axis=None, index=None, count=None, new_name=None):
        for info,_,root in self.items:
            current=info.get('name')
            for f in root.findall('s:sheetData/s:row/s:c/s:f',NS):
                try: tokens=Tokenizer('='+ (f.text or '')).items
                except Exception: raise Error('无法安全调整公式引用','UNSUPPORTED_STRUCTURE')
                for token in tokens:
                    if token.type!='OPERAND' or token.subtype!='RANGE': continue
                    try: name, region, m=reference(token.value,current)
                    except calc.FormulaError: raise Error('结构调整暂不支持引用 '+token.value,'UNSUPPORTED_STRUCTURE')
                    if name.casefold()!=target.casefold(): continue
                    if op=='sheet.delete': token.value='#REF!'; continue
                    prefix=("'"+(new_name if op=='sheet.rename' else name).replace("'","''")+"'!") if m['sheet'] else ''
                    if op=='sheet.rename': token.value=prefix+m['a']+(':'+m['b'] if m['b'] else ''); continue
                    # Expand insertions inside ranges; shrink deletions, use #REF! if empty.
                    lo,hi=(region[0],region[2]) if axis=='row' else (region[1],region[3])
                    if op.endswith('insert'):
                        lo=lo+count if lo>=index else lo; hi=hi+count if hi>=index else hi
                    else:
                        end=index+count-1
                        survivors=[]
                        if lo<index: survivors.append((lo,min(hi,index-1)))
                        if hi>end: survivors.append((max(lo,end+1)-count,hi-count))
                        if not survivors: token.value='#REF!'; continue
                        lo,hi=survivors[0][0],survivors[-1][1]
                    def changed(addr,n):
                        match=re.fullmatch(r'(\$?)([A-Za-z]+)(\$?)([0-9]+)',addr)
                        a,b,c,d=match.groups()
                        if axis=='row': d=str(n)
                        else: b=get_column_letter(n)
                        result=a+b+c+d
                        try: base.address(result.replace('$','').upper())
                        except Error: raise Error('结构调整导致引用越界','INVALID_INPUT')
                        return result
                    token.value=prefix+changed(m['a'],lo)+(':'+changed(m['b'],hi) if m['b'] else '')
                f.text=''.join(t.value for t in tokens)

    def command(self,cmd):
        if data_commands.handle(self,cmd,base) or formatting_commands.handle(self,cmd,base): return
        op=cmd.get('op')
        if op=='workbook.recalculate': return
        if op=='sheet.add':
            if self.protected(): raise Error('工作簿受保护','PROTECTED_DOCUMENT')
            name=self.valid_name(cmd.get('name'))
            if len(self.items)>=64: raise Error('最多 64 个工作表','RESOURCE_LIMIT')
            ids={x[0].get('sheetId') for x in self.items}; n=1
            while str(n) in ids or f'xl/worksheets/sheet{n}.xml' in self.z.namelist() or f'xl/worksheets/sheet{n}.xml' in self.changes: n+=1
            relpath='xl/_rels/workbook.xml.rels'; rel=base.xml(self.z.read(relpath)); used={e.get('Id') for e in rel}; rid='excelSheet'+str(n)
            while rid in used: rid+='x'
            part=f'xl/worksheets/sheet{n}.xml'
            E.SubElement(rel,'{http://schemas.openxmlformats.org/package/2006/relationships}Relationship',Id=rid,Type=R+'/worksheet',Target='worksheets/sheet'+str(n)+'.xml')
            info=E.SubElement(self.book.find('s:sheets',NS),'{'+S+'}sheet',name=name,sheetId=str(n)); info.set('{'+R+'}id',rid)
            root=E.Element('{'+S+'}worksheet',nsmap={None:S}); E.SubElement(root,'{'+S+'}sheetData'); self.items.append((info,part,root))
            ct=base.xml(self.z.read('[Content_Types].xml')); E.SubElement(ct,'{http://schemas.openxmlformats.org/package/2006/content-types}Override',PartName='/'+part,ContentType='application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml')
            self.changes.update({relpath:base.serial(rel),'[Content_Types].xml':base.serial(ct)}); return
        item=self.sheet(cmd.get('sheet')); self.editable(item)
        if op=='cell.set': self.set_text(item,cmd.get('address'),cmd.get('text'),cmd.get('expectedText'),True)
        elif op=='cells.set':
            edits=cmd.get('cells')
            if not isinstance(edits,list) or not 1<=len(edits)<=10000: raise Error('批量输入应为 1–10000 格','INVALID_INPUT')
            if len({x.get('address') for x in edits})!=len(edits): raise Error('批量输入地址重复','INVALID_INPUT')
            for cell in edits: self.set_text(item,cell.get('address'),cell.get('text'),cell.get('expectedText'),True)
        elif op=='range.replace':
            refs=addresses(bounds(cmd.get('range')))
            find=cmd.get('find'); replacement=cmd.get('replacement')
            if not isinstance(find,str) or not find or len(find)>32767 or not isinstance(replacement,str) or len(replacement)>32767 or any(ord(c)<32 and c not in '\r\n\t' for c in find+replacement):
                raise Error('查找文字不能为空，替换文字必须有效且不超过 32767 字','INVALID_INPUT')
            cells=self.cells(item); pending=[]
            for addr in refs:
                cell=cells.get(addr)
                if cell is None or cell.find('s:f',NS) is not None or cell.get('t') not in ('inlineStr','s','str'): continue
                text=str(base.cell_info(cell,self.shared)['value'] or '')
                if find not in text: continue
                self.editable(item,addr)
                value=text.replace(find,replacement)
                if len(value)>32767: raise Error('替换结果超过单元格 32767 字限制','RESOURCE_LIMIT')
                pending.append((cell,value))
            for cell,value in pending:
                for child in list(cell):
                    if E.QName(child).localname in ('f','v','is'): cell.remove(child)
                cell.set('t','inlineStr')
                text=E.SubElement(E.SubElement(cell,'{'+S+'}is'),'{'+S+'}t')
                text.set('{http://www.w3.org/XML/1998/namespace}space','preserve'); text.text=value
        elif op=='range.set':
            matrix=cmd.get('values'); r,c=base.address(cmd.get('address'))
            if not isinstance(matrix,list) or not matrix or not all(isinstance(row,list) and row for row in matrix) or len({len(row) for row in matrix})!=1:
                raise Error('粘贴内容必须为矩形二维文字数组','INVALID_INPUT')
            if sum(map(len,matrix))>10000: raise Error('单次粘贴不能超过 10000 格','RESOURCE_LIMIT')
            for dr,row in enumerate(matrix):
                for dc,text in enumerate(row): self.set_text(item,f'{get_column_letter(c+dc)}{r+dr}',text)
        elif op in ('range.clear','range.format','range.copy'):
            region=bounds(cmd.get('range')); refs=addresses(region)
            if op=='range.clear':
                for addr in refs: self.set_text(item,addr,'')
            elif op=='range.format':
                fmt=FORMATS.get(cmd.get('format'))
                if not fmt or self.styles is None: raise Error('数字格式无效或缺少样式表','INVALID_INPUT')
                xfs=self.styles.find('s:cellXfs',NS); formats=self.styles.find('s:numFmts',NS)
                if formats is None: formats=E.Element('{'+S+'}numFmts'); self.styles.insert(0,formats)
                found=next((x for x in formats if x.get('formatCode')==fmt),None)
                ident=found.get('numFmtId') if found is not None else str(max([163]+[int(x.get('numFmtId')) for x in formats])+1)
                if found is None: E.SubElement(formats,'{'+S+'}numFmt',numFmtId=ident,formatCode=fmt)
                formats.set('count',str(len(formats))); mapped={}
                for addr in refs:
                    self.editable(item,addr); cell=self.ensure(item,addr); old=int(cell.get('s','0'))
                    if old not in mapped:
                        xf=copy.deepcopy(xfs[old]); xf.set('numFmtId',ident); xf.set('applyNumberFormat','1')
                        serialized=E.tostring(xf); found=next((i for i,x in enumerate(xfs) if E.tostring(x)==serialized),None)
                        mapped[old]=found if found is not None else len(xfs)
                        if found is None: xfs.append(xf)
                    cell.set('s',str(mapped[old]))
                xfs.set('count',str(len(xfs))); self.changes['xl/styles.xml']=base.serial(self.styles)
            else:
                dest=self.sheet(cmd.get('targetSheet',cmd.get('sheet'))); r,c=base.address(cmd.get('address')); originals=[]
                for addr in refs:
                    self.editable(item,addr); cell=self.cells(item).get(addr)
                    originals.append((addr,copy.deepcopy(cell) if cell is not None else None))
                for addr,original in originals:
                    sr,sc=base.address(addr); target=f'{get_column_letter(c+sc-region[1])}{r+sr-region[0]}'
                    self.editable(dest,target); cell=self.ensure(dest,target); parent=cell.getparent()
                    if original is None: self.set_text(dest,target,''); cell.attrib.pop('s',None); continue
                    f=original.find('s:f',NS)
                    if f is not None:
                        if f.attrib: raise Error('暂不支持复制共享或数组公式','UNSUPPORTED_EDIT')
                        try: f.text=Translator('='+f.text,origin=addr).translate_formula(target)[1:]
                        except Exception: raise Error('复制公式导致引用越界或不支持','UNSUPPORTED_EDIT')
                    original.set('r',target); parent.replace(cell,original)
        elif op in ('row.insert','row.delete','column.insert','column.delete'):
            self.structural_guard(); index=cmd.get('index'); count=cmd.get('count',1); axis='row' if op.startswith('row.') else 'column'; limit=1048576 if axis=='row' else 16384
            if type(index)!=int or type(count)!=int or not 1<=index<=limit or not 1<=count<=1000 or index+count-1>limit: raise Error('行列位置或数量无效','INVALID_INPUT')
            self.rewrite(cmd['sheet'],op,axis,index,count)
            data=item[2].find('s:sheetData',NS); inserting=op.endswith('insert')
            def moved(n):
                if inserting: return n+count if n>=index else n
                if index<=n<index+count: return None
                return n-count if n>=index+count else n
            if axis=='row':
                for row in list(data):
                    n=moved(int(row.get('r')))
                    if n is None: data.remove(row); continue
                    if n>limit: raise Error('插入会使单元格越界','INVALID_INPUT')
                    row.set('r',str(n)); row.attrib.pop('spans',None)
                    for cell in row: cell.set('r',re.sub(r'\d+$',str(n),cell.get('r')))
            else:
                cols=item[2].find('s:cols',NS)
                if cols is not None:
                    for col in list(cols):
                        lo,hi=int(col.get('min')),int(col.get('max'))
                        if inserting:
                            lo=lo+count if lo>=index else lo; hi=hi+count if hi>=index else hi
                        else:
                            end=index+count-1; survivors=[]
                            if lo<index: survivors.append((lo,min(hi,index-1)))
                            if hi>end: survivors.append((max(lo,end+1)-count,hi-count))
                            if not survivors: cols.remove(col); continue
                            lo,hi=survivors[0][0],survivors[-1][1]
                        if hi>limit: raise Error('列样式范围越界','INVALID_INPUT')
                        col.set('min',str(lo)); col.set('max',str(hi))
                for row in data:
                    row.attrib.pop('spans',None)
                    for cell in list(row):
                        r,c=base.address(cell.get('r')); n=moved(c)
                        if n is None: row.remove(cell); continue
                        if n>limit: raise Error('插入会使单元格越界','INVALID_INPUT')
                        cell.set('r',f'{get_column_letter(n)}{r}')
            for v in item[2].findall('s:sheetViews/s:sheetView',NS):
                v.attrib.pop('topLeftCell',None)
                for selection in v.findall('s:selection',NS): selection.set('activeCell','A1'); selection.set('sqref','A1')
        elif op in ('sheet.rename','sheet.delete'):
            self.structural_guard()
            if op=='sheet.rename':
                name=self.valid_name(cmd.get('name'),cmd['sheet']); self.rewrite(cmd['sheet'],op,new_name=name); item[0].set('name',name)
            else:
                if sum(x[0].get('state','visible')=='visible' for x in self.items if x is not item)<1: raise Error('必须保留一个可见工作表','INVALID_INPUT')
                self.rewrite(cmd['sheet'],op); self.book.find('s:sheets',NS).remove(item[0]); self.items.remove(item); self.removed.add(item[1])
                relpath='xl/_rels/workbook.xml.rels'; rel=base.xml(self.z.read(relpath))
                for node in list(rel):
                    if node.get('Id')==item[0].get('{'+R+'}id'): rel.remove(node)
                ct=base.xml(self.z.read('[Content_Types].xml'))
                for node in list(ct):
                    if node.get('PartName')=='/'+item[1]: ct.remove(node)
                self.changes.update({relpath:base.serial(rel),'[Content_Types].xml':base.serial(ct)})
                for view in self.book.findall('s:bookViews/s:workbookView',NS): view.set('activeTab','0'); view.set('firstSheet','0')
        else: raise Error('不支持的 Excel 命令','INVALID_INPUT')

    def valid_name(self,name,old=None):
        if not isinstance(name,str) or not name.strip() or len(name)>31 or re.search(r'[\x00-\x1f\\/*?:\[\]]',name) or name.startswith("'") or name.endswith("'"):
            raise Error('工作表名称无效（最多 31 字）','INVALID_INPUT')
        if any(x[0].get('name').casefold()==name.casefold() and x[0].get('name')!=old for x in self.items): raise Error('工作表名称重复','INVALID_INPUT')
        return name

    def recalculate(self):
        cells={info.get('name'):self.cells((info,part,root)) for info,part,root in self.items}
        names={n.casefold():n for n in cells}; results={}; visiting=set(); warnings=[]; steps=0
        blocked={}
        for sheet,items in cells.items():
            for addr,cell in items.items():
                f=cell.find('s:f',NS)
                if f is not None and f.get('t') in ('array','dataTable') and f.get('ref'):
                    region=bounds(f.get('ref')); r1,c1,r2,c2=region
                    for candidate in items:
                        r,c=base.address(candidate)
                        if r1<=r<=r2 and c1<=c<=c2: blocked[(sheet,candidate)]=calc.FormulaError('暂不支持数组或数据表公式结果',unsupported=True)
        def value(sheet,addr):
            nonlocal steps
            steps+=1
            if steps>200000: raise calc.FormulaError('重算引用超过 200000 次',unsupported=True)
            key=(sheet,addr)
            if key in blocked:
                results[key]=blocked[key]; raise blocked[key]
            if key in results:
                result=results[key]
                if isinstance(result,Exception): raise result
                return result
            if key in visiting: raise calc.FormulaError('循环引用', '#REF!', True)
            if len(visiting)>150: raise calc.FormulaError('公式依赖超过 150 层',unsupported=True)
            cell=cells[sheet].get(addr)
            if cell is None: return None
            f=cell.find('s:f',NS)
            if f is None:
                info=base.cell_info(cell,self.shared); raw=info['value']
                if info['valueType']=='e': raise calc.FormulaError(str(raw),str(raw))
                if info['valueType']=='n':
                    try: return float(raw) if raw!='' else None
                    except ValueError: raise calc.FormulaError('无效数值')
                if info['valueType']=='d': raise calc.FormulaError('暂不支持 ISO 日期参与公式',unsupported=True)
                return raw
            visiting.add(key)
            try:
                if f.attrib: raise calc.FormulaError('暂不支持共享、数组或数据表公式',unsupported=True)
                def resolve(text):
                    name,region,_=reference(text,sheet); actual=names.get(name.casefold())
                    if actual is None: raise calc.FormulaError('引用的工作表不存在','#REF!')
                    try: refs=addresses(region)
                    except Error: raise calc.FormulaError('公式引用范围超过 10000 格',unsupported=True)
                    values=[]
                    for a in refs:
                        try: values.append(value(actual,a))
                        except calc.FormulaError as e: values.append(e)
                    return values
                result=calc.scalar(calc.evaluate(calc.parse(f.text or ''),resolve))
                if result is None: result=0
                if isinstance(result,(float,int)) and not math.isfinite(result): raise calc.FormulaError('数值超出范围','#NUM!')
                results[key]=result; return result
            except calc.FormulaError as e:
                results[key]=e; raise
            finally: visiting.remove(key)
        for sheet,items in cells.items():
            for addr,cell in items.items():
                if cell.find('s:f',NS) is None and (sheet,addr) not in blocked: continue
                try: value(sheet,addr)
                except calc.FormulaError as e: results[(sheet,addr)]=e
        for (sheet,addr),result in results.items():
            cell=cells[sheet][addr]
            for v in cell.findall('s:v',NS): cell.remove(v)
            cell.attrib.pop('t',None)
            if isinstance(result,calc.FormulaError):
                warnings.append({'sheet':sheet,'address':addr,'status':'unsupported' if result.unsupported else 'error','message':str(result),'code':result.code})
                if not result.unsupported: cell.set('t','e'); E.SubElement(cell,'{'+S+'}v').text=result.code
            else:
                if isinstance(result,bool): cell.set('t','b'); raw='1' if result else '0'
                elif isinstance(result,str): cell.set('t','str'); raw=result
                else: raw=str(result)
                E.SubElement(cell,'{'+S+'}v').text=raw
        return results,warnings

    def output(self):
        if sum(len(self.cells(x)) for x in self.items)>40000: raise Error('工作簿超过 40000 个单元格','RESOURCE_LIMIT')
        for info,part,root in self.items:
            data=root.find('s:sheetData',NS); data[:]=sorted(data,key=lambda row:int(row.get('r')))
            for row in data: row[:]=sorted(row,key=lambda cell:base.address(cell.get('r'))[1])
            coords=[base.address(a) for a in self.cells((info,part,root))]; dimension=root.find('s:dimension',NS)
            if dimension is not None:
                dimension.set('ref',f'{get_column_letter(min(c for r,c in coords))}{min(r for r,c in coords)}:{get_column_letter(max(c for r,c in coords))}{max(r for r,c in coords)}' if coords else 'A1')
            self.changes[part]=base.serial(root)
        prop=self.book.find('s:calcPr',NS)
        if prop is None: prop=E.SubElement(self.book,'{'+S+'}calcPr')
        for k,v in {'calcMode':'auto','fullCalcOnLoad':'1','forceFullCalc':'1','calcId':'0'}.items(): prop.set(k,v)
        self.changes['xl/workbook.xml']=base.serial(self.book)
        relpath='xl/_rels/workbook.xml.rels'; rel=base.xml(self.changes.get(relpath,self.z.read(relpath)))
        for node in list(rel):
            if node.get('Type','').endswith('/calcChain'):
                target=base.relations(self.z,'xl/workbook.xml').get(node.get('Id'))
                if target: self.removed.add(target)
                rel.remove(node)
        self.changes[relpath]=base.serial(rel)
        ct=base.xml(self.changes.get('[Content_Types].xml',self.z.read('[Content_Types].xml')))
        for node in list(ct):
            if node.get('PartName','').lstrip('/') in self.removed: ct.remove(node)
        self.changes['[Content_Types].xml']=base.serial(ct)
        out=io.BytesIO()
        with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
            z.comment=self.z.comment
            for info in self.z.infolist():
                if info.filename not in self.removed: z.writestr(info,self.changes.get(info.filename,self.z.read(info.filename)))
            for name,content in self.changes.items():
                if name not in self.z.namelist(): z.writestr(name,content)
        return out.getvalue()


def inspect(data):
    w=Workbook(data)
    stored={(info.get('name'),addr):base.cell_info(cell,w.shared).get('cachedValue') for info,part,root in w.items for addr,cell in w.cells((info,part,root)).items()}
    results,warnings=w.recalculate(); view=base.inspect_xlsx(base.load_package(w.output(),'xlsx'))
    view['calculation']='bounded-local'; view['warnings']=warnings; view['formats']=FORMATS
    properties=w.book.find('s:workbookPr',NS)
    view['date1904']=properties is not None and properties.get('date1904') in ('1','true')
    for sheet in view['sheets']:
        for cell in sheet['cells']:
            if (sheet['name'],cell['address']) in results:
                result=results.get((sheet['name'],cell['address']))
                cell['calculationStatus']='unsupported' if isinstance(result,calc.FormulaError) and result.unsupported else 'error' if isinstance(result,Exception) else 'calculated'
                cell['calculationMessage']=str(result) if isinstance(result,Exception) else ''
                cell['value']=None if isinstance(result,Exception) and result.unsupported else result.code if isinstance(result,Exception) else result
                cell['calculatedValue']=cell['value']
                cell['cachedValue']=stored.get((sheet['name'],cell['address']))
    data_commands.decorate(view,w,base)
    formatting_commands.decorate(view,w,base)
    return view


def edit(data,command):
    w=Workbook(data); w.command(command); w.recalculate(); return w.output()


if __name__=='__main__':
    try:
        folder=Path(sys.argv[1]); request=json.loads((folder/'request.json').read_text('utf-8')); data=(folder/'input.bin').read_bytes()
        if request['action']=='inspect': result=inspect(data)
        else: (folder/'output.bin').write_bytes(edit(data,request['command'])); result={'ok':True}
        print(json.dumps(result,ensure_ascii=True,allow_nan=False))
    except Exception as e:
        print(json.dumps({'error':str(e),'code':getattr(e,'code','INVALID_XLSX')},ensure_ascii=True))
