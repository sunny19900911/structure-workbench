"""Verify scan charts against their PDF and OCR artifacts before attachment.

Usage: python package-scan-wave.py native-report.json output.json charts.json ...
Re-render exact PDF pages using the original 180 dpi Poppler route. An image
from another document/version is not accepted merely because page numbers match.
"""
import hashlib
import importlib.util
import io
import json
import os
import re
import sys
from pathlib import Path
from pdf2image import convert_from_path


def module(name, filename):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(filename))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m


identity=module('identity','scan-wave-identity.py')
score=module('score','score-scan-bands.py')


def header_matches(tables):
    if len(tables)!=1 or not tables[0] or any(len(r)<6 for r in tables[0]):return False
    rows=[[re.sub(r'\s','',c) for c in row] for row in tables[0]];columns=[''.join(r[i] for r in rows) for i in range(5)]
    speed=''.join(r[-1] for r in rows)
    return columns[:2]==['序号','地层名称'] and columns[2] in ('深度(m)','深度（m）') and columns[3] in ('厚度(m)','厚度（m）') and columns[4].startswith('柱状') and '图' in ''.join(''.join(r) for r in rows) and speed in ('层速度(m/s)','层速度（m/s）')


def validate_evidence(chart):
    paths={k:Path(chart[k]) for k in ('identityEvidence','headerEvidence','layerEvidence')}
    actual=identity.identity(json.loads(paths['identityEvidence'].read_text(encoding='utf8')))
    if actual['status']!='identified' or actual['fields']!=chart['identity']:raise ValueError('Identity does not match OCR')
    if not header_matches(score.table_rows(paths['headerEvidence'])):raise ValueError('Unverified header or units')
    tables=score.table_rows(paths['layerEvidence'])
    if len(tables)!=1 or tables[0][1:]!=chart['rows']:raise ValueError('Layer rows do not match OCR')
    if chart['columns']!=['序号','地层名称','深度(m)','厚度(m)','层速度(m/s)']:raise ValueError('Unexpected columns')
    return {k:hashlib.sha256(p.read_bytes()).hexdigest() for k,p in paths.items()}


def main():
    report_path,out,*inputs=map(Path,sys.argv[1:]);report=json.loads(report_path.read_text(encoding='utf8'))
    pdf=Path(report['input']);digest=hashlib.sha256(pdf.read_bytes()).hexdigest()
    if digest!=report['sha256']:raise ValueError('PDF source changed')
    charts=[];seen=set()
    for path in inputs:
        for chart in json.loads(path.read_text(encoding='utf8')):
            page=chart['page'];key=(page,tuple(map(tuple,chart['pixelBoxes'])))
            if key in seen:raise ValueError('Duplicate chart region')
            if not isinstance(page,int) or not 1<=page<=report['pageCount']:raise ValueError('Page outside PDF')
            hashes=validate_evidence(chart)
            image=convert_from_path(str(pdf),dpi=180,first_page=page,last_page=page,poppler_path=os.environ.get('POPPLER_BIN'))[0]
            png=io.BytesIO();image.save(png,format='PNG')
            if hashlib.sha256(png.getvalue()).hexdigest()!=chart['sourceImageSha256']:raise ValueError('Chart image does not match PDF page')
            width,height=image.size
            if not chart['pixelBoxes'] or any(not (0<=x0<x1<=width and 0<=y0<y1<=height) for x0,y0,x1,y1 in chart['pixelBoxes']):raise ValueError('Invalid source crop')
            charts.append({**chart,'evidenceHashes':hashes,'sourcePDFSha256':digest,'sourceImageSize':[width,height],'renderDpi':180,'pageComplete':False})
            seen.add(key);print(json.dumps({'page':page,'borehole':chart['identity']['borehole'],'verified':True}),flush=True)
    out.write_text(json.dumps({'schemaVersion':1,'sourcePDFSha256':digest,'charts':charts,'completePages':[]},ensure_ascii=False,indent=2),encoding='utf8')


if __name__=='__main__':main()
