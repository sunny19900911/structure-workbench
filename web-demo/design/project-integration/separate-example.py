"""One-time extraction of legacy demo facts; refuses to run twice."""
from pathlib import Path
from html.parser import HTMLParser
from html import escape
import json
import re

root = Path(__file__).resolve().parents[2]
entry = root / 'workbuddy-integrated-studio.html'
sample_path = root / 'data' / 'example-project.json'
if sample_path.exists():
    raise SystemExit('Example already extracted; do not rerun.')
source = entry.read_text(encoding='utf-8')

class Parser(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=False)
        self.text, self.nodes, self.stack = text, [], []
        self.offsets = [0]
        for line in text.splitlines(keepends=True):
            self.offsets.append(self.offsets[-1] + len(line))
        self.feed(text)
    def pos(self):
        line, column = self.getpos()
        return self.offsets[line-1] + column
    def handle_starttag(self, tag, attrs):
        start = self.pos()
        n = dict(tag=tag, attrs=dict(attrs), start=start, inner=start+len(self.get_starttag_text()), parent=self.stack[-1] if self.stack else None)
        self.nodes.append(n)
        if tag in 'area base br col embed hr img input link meta param source track wbr'.split():
            n['close'] = n['end'] = n['inner']
        else:
            self.stack.append(n)
    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1, -1, -1):
            if self.stack[i]['tag'] == tag:
                for n in self.stack[i:]:
                    n['close'] = self.pos()
                    n['end'] = self.text.index('>', self.pos()) + 1
                self.stack = self.stack[:i]
                break
    def by_id(self, id):
        return next(n for n in self.nodes if n['attrs'].get('id') == id)
    def inner(self, n):
        return self.text[n['inner']:n['close']]

p = Parser(source)
stage1 = p.by_id('stage1')
paper1 = next(n for n in p.nodes if n['attrs'].get('class') == 'paper' and stage1['start'] < n['start'] < stage1['end'])
paper2 = p.by_id('paper2')
spec = p.by_id('spec-itbl')
spec_body = next(n for n in p.nodes if n['tag'] == 'tbody' and spec['start'] < n['start'] < spec['end'])
constants = {key: json.loads(re.search(r'^const '+key+r' = (.+);$', source, re.M).group(1)) for key in ['DEF','DATA_DEF','DATA_TABLES']}
params = dict(constants['DEF'])
labels = {}
controls = [n for n in p.nodes if 'data-k' in n['attrs']]
for n in controls:
    key = n['attrs']['data-k']
    if n['tag'] == 'input':
        params[key] = n['attrs'].get('value','')
    elif n['tag'] == 'select':
        options = [o for o in p.nodes if o['parent'] is n and o['tag']=='option']
        selected = next((o for o in options if 'selected' in o['attrs']), options[0] if options else None)
        if selected:
            params[key] = selected['attrs'].get('value',p.inner(selected))
    parent = n['parent']
    label = next((l for l in p.nodes if l['parent'] is parent and l['tag']=='label'), None)
    if label:
        labels[key] = re.sub('<[^>]+>','',p.inner(label))
labels.update(dict(region='项目所在地',safety_grade='结构安全等级',gamma0='结构重要性系数',found_grade='地基基础设计等级',found_safety='基础安全等级',gamma0_found='基础结构重要性系数',pile_gamma='桩基重要性系数',seismic_cat_short='抗震设防类别',seismic_level='设防类别等级',intensity_up='措施采用烈度',seismic_up_note='抗震措施采用说明',iso_reduce_note='隔震措施采用说明',snow_note='雪荷载采用说明',wall_dd_t='墙体容重'))
for thickness in [100,150,200,250,300]:
    labels['w'+str(thickness)] = str(thickness)+' mm 墙体荷载采用值'
    labels['w'+str(thickness)+'_raw'] = str(thickness)+' mm 墙体荷载计算值'

sample = dict(schema=1, source_id='workbuddy-integrated-studio/legacy-example-before-20260930-blank-fix', statement='历史项目参考', parameters=params, data=constants['DATA_DEF'], dataTables=constants['DATA_TABLES'], paper=p.inner(paper1), expansionPaper=p.inner(paper2), spec=dict(rows='<table><tbody>'+p.inner(spec_body)+'</tbody></table>',text=''))
sample_path.parent.mkdir(exist_ok=True)
sample_path.write_text(json.dumps(sample,ensure_ascii=False,indent=2),encoding='utf-8')

# New projects retain chapter anchors and parameter references, with no adopted
# historical prose, load rows, numeric rules or project-specific materials.
headings = [n for n in p.nodes if paper1['inner'] <= n['start'] < paper1['close'] and n['tag'] in ['h1','h2']]
parts = ['<div class="ptitle">结构计算统一措施</div>', '<div class="psub">新建项目 · 待编写</div>', '<div class="ptip">请先填写本项目参数。蓝色字段随参数同步；各节正文及取值依据由本项目资料补充。</div>']
for i, h in enumerate(headings):
    parts.append(source[h['start']:h['end']])
    stop = headings[i+1]['start'] if i+1<len(headings) else paper1['close']
    refs = list(dict.fromkeys(n['attrs']['data-p'] for n in p.nodes if h['end'] <= n['start'] < stop and 'data-p' in n['attrs']))
    if refs:
        parts.append('<table><tbody><tr><th>参数</th><th>本项目取值</th></tr>'+''.join('<tr><td>'+escape(labels.get(k,k))+'</td><td><span class="pv" data-p="'+k+'">【待确认】</span></td></tr>' for k in refs)+'</tbody></table>')
    parts.append('<p class="ce" contenteditable="true" data-empty-section="'+h['attrs']['id']+'">【待填写本节内容及取值依据】</p>')
    # Keep editable table tooling for the existing load entry workflow.
    for table in [n for n in p.nodes if h['end'] <= n['start'] < stop and 'itbl' in n['attrs'].get('class','').split()]:
        columns=int(table['attrs']['data-cols'])
        headers=[n for n in p.nodes if table['inner'] < n['start'] < table['close'] and n['tag']=='th' and n['attrs'].get('class')!='op']
        attrs=' '.join(k+'="'+escape(v or '',quote=True)+'"' for k,v in table['attrs'].items())
        parts.append('<div '+attrs+'><table><tbody><tr>'+''.join(source[n['start']:n['end']] for n in headers)+'<th class="op">操作</th></tr><tr>'+('<td class="ce" contenteditable="true">【待填写】</td>'*columns)+'<td class="op"><button class="delbtn" onclick="delRow(this)">删除</button></td></tr></tbody></table><button class="addbtn" onclick="addRow(this)">＋ 添加一行</button></div>')
blank_paper='\n'.join(parts)
edits=[(paper1['inner'],paper1['close'],'\n'+blank_paper+'\n'),(paper2['inner'],paper2['close'],'<div class="ptitle">结构扩初说明</div><p>本项目正文尚未编写。请通过启动Demo.cmd打开工作台，载入扩初编辑器后编写。</p>'),(spec_body['inner'],spec_body['close'],'')]
for key,value in [('DEF',{k:('结构' if k=='discipline' else '') for k in params}),('DATA_DEF',{}),('DATA_TABLES',{})]:
    m=re.search(r'^const '+key+r' = (.+);$',source,re.M)
    edits.append((m.start(),m.end(),'const '+key+' = '+json.dumps(value,ensure_ascii=False)+';'))
for n in p.nodes:
    if any(a <= n['start'] < b for a,b,_ in edits):
        continue
    a=n['attrs']
    if 'data-k' in a:
        if n['tag']=='input':
            opening=source[n['start']:n['inner']]
            opening=re.sub(r'\svalue="[^"]*"','',opening)
            opening=opening[:-1]+' value="'+('结构' if a['data-k']=='discipline' else '')+'">'
            edits.append((n['start'],n['inner'],opening))
        elif n['tag']=='select':
            options=re.sub(r'\sselected(?:="[^"]*")?', '', p.inner(n))
            edits.append((n['inner'],n['close'],'<option value="" selected>— 待确认 —</option>'+options))
    elif any(k in a for k in ['data-p','data-inh','data-x']):
        edits.append((n['inner'],n['close'],'【待确认】'))
    elif a.get('id')=='spec-ta':
        edits.append((n['start'],n['inner'],'<textarea id="spec-ta" placeholder="粘贴本项目适用的地方规范名称、编号及版本">'))
for a,b,v in sorted(edits,reverse=True):
    source=source[:a]+v+source[b:]
source=source.replace('kbInitNarrativeEditing(); /* ② 普通正文可编辑；联动字段保持只读 */','// The current expansion editor owns project-scoped drafts; do not restore legacy browser prose.')
source=source.replace('runExpansionMethod(false); /* ② 后台应用本地扩初生成规则；方法本身不在界面展示 */','// Expansion generation is explicit and uses only current project evidence.')
start=source.index('  deriveAll();',source.index('function generateExpand(forceMethod)'))
end=source.index('\n}\n',start)
source=source[:start]+"  toast('扩初编辑器尚未就绪，请使用启动Demo.cmd打开工作台并等待项目载入完成。');\n  goStage(2);"+source[end:]
entry.write_text(source,encoding='utf-8')
print('Extracted example and replaced active defaults and document templates.')
