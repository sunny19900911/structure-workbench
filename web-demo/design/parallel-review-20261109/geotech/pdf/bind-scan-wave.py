"""Bind independently read chart identity and layer rows to one source image.

Usage: python bind-scan-wave.py selection.json identity.json bands-dir output.json
Only the supported column-band profile is accepted. Missing headers in the band
OCR are supplied by the separately checked header, not guessed from numbers.
"""
import hashlib
import importlib.util
import json
import re
import sys
from pathlib import Path

spec=importlib.util.spec_from_file_location('score',Path(__file__).with_name('score-scan-bands.py'))
score=importlib.util.module_from_spec(spec);spec.loader.exec_module(score)


def bind(selection, identity, tables):
    if selection['status']!='data-bands-ready' or identity['status']!='identified':raise ValueError('Unverified profile or identity')
    if selection['name']!=identity['name'] or selection['sha256']!=identity['sha256']:raise ValueError('Different source identity')
    if len(tables)!=1:raise ValueError('Ambiguous layer tables')
    rows=tables[0][1:]
    if not rows or any(len(row)!=5 for row in rows):raise ValueError('Unexpected column layout')
    for index,row in enumerate(rows,1):
        if row[0]!=str(index) or not row[1] or any(not re.fullmatch(r'\d+(?:\.\d+)?',v) for v in row[2:]):
            raise ValueError('Unresolved layer row')
    return {'sourceImageSha256':selection['sha256'],'page':int(selection['name'].split('-')[-1]),
            'identity':identity['fields'],'identityUnits':{},'identityEvidence':identity['ocrEvidence'],
            'headerEvidence':selection['headerEvidence'],'pixelBoxes':selection['pixelBoxes'],
            'columns':['序号','地层名称','深度(m)','厚度(m)','层速度(m/s)'],
            'rows':rows,'automaticAdoption':False,'scope':'wave-chart-layer-results',
            'limitations':['身份栏未标单位，保留原文数值；不补算等效速度或覆盖层厚度。','只含目标柱状图；不代表该页其他图表已完整提取。']}


def main():
    selection,identities,bands,out=map(Path,sys.argv[1:5])
    ids={r['name']:r for r in json.loads(identities.read_text(encoding='utf8'))};results=[]
    for s in json.loads(selection.read_text(encoding='utf8')):
        path=bands/(s['name']+'.json')
        if not path.exists():continue
        if hashlib.sha256(Path(s['source']).read_bytes()).hexdigest()!=s['sha256']:raise ValueError('Source changed')
        result=bind(s,ids[s['name']],score.table_rows(path))
        result.update(layerEvidence=str(path),layerOcrSha256=hashlib.sha256(path.read_bytes()).hexdigest())
        results.append(result)
    out.write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({'charts':len(results),'rows':sum(len(r['rows']) for r in results)}))


if __name__=='__main__':main()
