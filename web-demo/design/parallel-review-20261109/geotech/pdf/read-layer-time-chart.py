"""Read explicitly labelled layer/time-chart OCR cells without graph ticks.

Usage: python read-layer-time-chart.py ocr-directory output.json
This profile is distinct from the seven-column wave chart. It preserves the
source label '速度', does not infer thickness or equivalent velocity, and never
adopts values into a project. Raw OCR evidence remains unchanged.
"""
import json
import re
import sys
from pathlib import Path
from lxml import html

HEADER='土层深度(m)土层描述柱状图速度m/s岩性描述'
NUMBER=re.compile(r'\d+(?:\.\d+)?$')


def read_chart(markup):
    table=html.fromstring(markup)
    rows=[[re.sub(r'\s', '', c.text_content()) for c in r.xpath('./td|./th')]
          for r in table.xpath('.//tr')]
    headers=[i for i,r in enumerate(rows) if ''.join(r).startswith(HEADER)
             and re.search(r'单孔测试波速[-－—]+时距图$', ''.join(r))]
    if len(headers)!=1:return None
    header=headers[0];results=[];pending=[]
    for index,row in enumerate(rows[header+1:],header+1):
        if not row or not re.fullmatch(r'土层\d+',row[0]):continue
        # Header order establishes six source cells. A seventh cell may hold
        # both plot curves (often row-spanned across several data rows).
        if not 6<=len(row)<=7 or not NUMBER.fullmatch(row[1]) or not NUMBER.fullmatch(row[4]) or not row[2] or NUMBER.fullmatch(row[2]):
            pending.append({'row':index+1,'rawCells':row,'reason':'unresolved-data-cell-order'});continue
        results.append({'row':index+1,'values':[row[0],row[1],row[2],row[4],row[5]],
                        'rawCells':row,'excludedColumns':{'pattern':3,'plot':6 if len(row)==7 else None}})
    if not results and not pending:return None
    metadata=rows[:header]
    return {'profile':'layer-time-chart','headers':['土层','深度(m)','土层描述','速度(m/s)','岩性描述'],
            'rows':results,'pending':pending,'metadata':metadata,'headerRow':header+1,
            'automaticAdoption':False}


def extract(document):
    result=[]
    for page in document.get('pages',[]):
        for block in page.get('blocks',[]):
            if block.get('type')!='table':continue
            for part in block.get('content',[]):
                if part.get('type')!='table_body' or not isinstance(part.get('content'),str):continue
                parsed=read_chart(part['content'])
                if parsed is not None:
                    result.append({**parsed,'pageIndex':page['page_idx'],'bbox':block['bbox'],
                                   'blockIndex':block.get('index'),'rawTableHtml':part['content']})
    return result


if __name__=='__main__':
    directory,output=map(Path,sys.argv[1:3]);records=[]
    for path in sorted(directory.glob('page-*.json')):
        records.append({'source':str(path),'name':path.stem,
                        'tables':extract(json.loads(path.read_text(encoding='utf8')))})
    output.write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({'files':len(records),'tables':sum(len(r['tables']) for r in records),
                      'rows':sum(len(t['rows']) for r in records for t in r['tables']),
                      'pending':sum(len(t['pending']) for r in records for t in r['tables'])}))
