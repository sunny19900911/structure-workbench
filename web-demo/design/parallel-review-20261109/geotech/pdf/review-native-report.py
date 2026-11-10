"""Create escaped, local-only reading copies of native blocks and unverified OCR.

Usage: python review-native-report.py <private-round-directory>
Requires BeautifulSoup only to turn model table HTML into plain cell text.
Never executes or preserves markup from a source document or model.
"""
import html
import json
import sys
from pathlib import Path
from bs4 import BeautifulSoup

root=Path(sys.argv[1])
esc=lambda value:html.escape(str(value or ''))
def table(rows):
    return '<div class="table"><table>'+''.join('<tr>'+''.join('<td>'+esc(c).replace('\n','<br>')+'</td>' for c in row)+'</tr>' for row in rows)+'</table></div>'
def ocr_content(value):
    if isinstance(value,list):return ''.join(ocr_content(x) for x in value)
    if not isinstance(value,dict):return ''
    content=value.get('content')
    if isinstance(content,str):
        if value.get('type')=='table_body':
            soup=BeautifulSoup(content,'html.parser')
            # Review retains span labels in cells; the raw JSON is the exact output.
            return table([[c.get_text(' ',strip=True)+(f" [跨{c.get('rowspan','1')}行/{c.get('colspan','1')}列]" if c.get('rowspan') or c.get('colspan') else '') for c in row.find_all(['td','th'],recursive=False)] for row in soup.find_all('tr')])
        if value.get('type')=='text':return '<p>'+esc(content)+'</p>'
        return ''
    return ocr_content(content)
for item in json.loads((root/'manifest.json').read_text(encoding='utf8')):
    folder=root/item['id'];report=json.loads((folder/'native-report.json').read_text(encoding='utf8'));source=json.loads((folder/'native-source.json').read_text(encoding='utf8'))
    body=['<h1>'+esc(report['name'])+'</h1><p>原生文字与表格按页保留；下方扫描页为未经校正的 OCR，未编入自动正文。表格恢复数不代表准确率。页码为 PDF 物理页。</p>']
    for page in report['pages']:
        body.append('<section><h2>第 '+str(page['page'])+' 页 · '+('原生提取' if page['method']=='native' else 'OCR待核对')+'</h2>')
        if page['method']=='native':
            for block in page['blocks']:body.append(table(block['rows']) if block['kind']=='table' else '<p>'+esc(block['text'])+'</p>')
        else:
            file=folder/'ocr'/f"page-{page['page']:03}.json"
            body.append(f'<p><a href="ocr-images/page-{page["page"]:03}.png">打开原页图片核对</a></p>')
            if file.exists():
                data=json.loads(file.read_text(encoding='utf8'))
                body.append('<p class="warning">未核实：层号、数值范围、单位和图中文字可能错误，不作为设计采用值。</p>')
                body.extend(ocr_content(p.get('blocks',[])) for p in data.get('pages',[]))
            else:body.append('<p>未生成OCR结果。</p>')
        body.append('</section>')
    style='body{font:16px/1.7 system-ui;margin:35px auto;max-width:1200px;padding:0 20px;color:#243239}section{border-top:1px solid #bbb;margin-top:35px}td{border:1px solid #bbb;padding:5px;white-space:pre-wrap;min-width:55px}table{border-collapse:collapse}.table{overflow:auto}.warning{background:#fff1d1;padding:12px}h1{font-size:25px}'
    (folder/'按页提取复核.html').write_text('<!doctype html><meta charset="utf-8"><title>PDF提取复核</title><style>'+style+'</style>'+''.join(body),encoding='utf8')
    print(item['id'],report['pageCount'])
