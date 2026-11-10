"""Compare reviewed ranges with raw OCR, without repairing digits or symbols.
Usage: python score-range-crops.py manifest.json result-dir output.json [baseline-dir]
"""
import json
import re
import sys
from pathlib import Path

manifest,results,output=map(Path,sys.argv[1:4])
baseline=Path(sys.argv[4]) if len(sys.argv)>4 else None
def normalize(text):
    text=re.sub(r'^#{1,6}\s+','',text.strip(),flags=re.M)
    return re.sub(r'\s+','',text.replace('\\~','~').replace('～','~'))

records=[]
for region in json.loads(manifest.read_text(encoding='utf8'))['regions']:
    if 'expected' not in region:
        continue
    text=(results/(region['id']+'.md')).read_text(encoding='utf8')
    record={'id':region['id'],'expected':region['expected'],'actual':text,'pass':normalize(text)==normalize(region['expected'])}
    if baseline:
        old=(baseline/(region['id']+'.md')).read_text(encoding='utf8')
        record.update(before=old,beforePass=normalize(old)==normalize(region['expected']))
    records.append(record)
report={'normalization':'Markdown heading/escape and whitespace only; fullwidth tilde equivalent; no numeric or sign repair','checks':records,'correct':sum(r['pass'] for r in records),'total':len(records)}
if baseline:report['beforeCorrect']=sum(r['beforePass'] for r in records)
output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({k:v for k,v in report.items() if k!='checks'},ensure_ascii=False))
