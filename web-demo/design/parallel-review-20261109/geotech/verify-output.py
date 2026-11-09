"""Compare downloaded native Word values and render every available PDF page.
Usage: python verify-output.py <private-round-directory> <private-qa-directory> [capture-glob]
Set POPPLER_BIN to the bundled Poppler directory. Never rewrites the Word files.
"""
import json, os, re, sys, zipfile
from pathlib import Path
from lxml import etree
from pypdf import PdfReader
from pdf2image import convert_from_path
from PIL import Image, ImageDraw

root, qa = map(Path, sys.argv[1:3]); qa.mkdir(parents=True, exist_ok=True)
ns = {'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
results=[]
for capture in root.glob(sys.argv[3] if len(sys.argv)>3 else '*/*-capture.json'):
    data=json.loads(capture.read_text(encoding='utf-8')); stem=capture.stem.removesuffix('-capture')
    docx=capture.with_name(stem+'.docx'); pdf=capture.with_name(stem+'.pdf')
    xml=etree.fromstring(zipfile.ZipFile(docx).read('word/document.xml'))
    actual=xml.findall('w:body/w:tbl',ns)
    expected=[b for b in data['package']['blocks'] if b['kind']=='table']
    differences=[]
    for ti,(table,block) in enumerate(zip(actual,expected)):
        rows=table.findall('w:tr',ns)
        if len(rows)!=len(block['rows']):differences.append(f'table {ti+1}: row count')
        for ri,(row,item) in enumerate(zip(rows,block['rows'])):
            cells=[''.join(c.xpath('.//w:t/text()',namespaces=ns)) for c in row.findall('w:tc',ns)]
            wanted=[str(v or '') for v in item['values']]
            if cells!=wanted:differences.append({'table':ti+1,'row':ri+1,'expected':wanted,'actual':cells})
    if len(actual)!=len(expected):differences.append('table count')
    normalize=lambda text: re.sub(r'\s+', '', str(text or ''))
    native_text=normalize(''.join(xml.xpath('.//w:t/text()',namespaces=ns)))
    expected_text=[b['text'] for b in data['package']['blocks'] if b.get('text')]
    missing_text=[text for text in expected_text if normalize(text) not in native_text]
    record={'group':capture.parent.name,'id':stem,'tables':len(actual),'nativeValueDifferences':differences,'textBlocks':len(expected_text),'missingTextBlocks':missing_text}
    if pdf.exists():
        reader=PdfReader(pdf);record['pages']=len(reader.pages)
        pages=convert_from_path(str(pdf),dpi=45,poppler_path=os.environ.get('POPPLER_BIN'))
        for start in range(0,len(pages),12):
            chunk=pages[start:start+12];thumbs=[]
            for n,p in enumerate(chunk,start+1):
                p.thumbnail((550,410));tile=Image.new('RGB',(560,440),'#ddd');tile.paste(p,(5,25));ImageDraw.Draw(tile).text((8,7),str(n),fill='black');thumbs.append(tile)
            sheet=Image.new('RGB',(1680,440*((len(chunk)+2)//3)),'white')
            for i,t in enumerate(thumbs):sheet.paste(t,((i%3)*560,(i//3)*440))
            sheet.save(qa/(capture.parent.name+'-'+stem+f'-pages-{start+1}.png'))
        page_text=[p.extract_text() or '' for p in reader.pages]
        ground=next((i for i,t in enumerate(page_text) if '4.3' in t and ('地基土层' in t or '物理力学参数' in t)),0)
        sample=convert_from_path(str(pdf),dpi=120,first_page=ground+1,last_page=ground+1,poppler_path=os.environ.get('POPPLER_BIN'))[0]
        sample.save(qa/(capture.parent.name+'-'+stem+'-ground.png'))
    results.append(record)
    print(json.dumps({k:v for k,v in record.items() if k not in ['nativeValueDifferences','missingTextBlocks']},ensure_ascii=False),'differences',len(differences),'missing text',len(missing_text),flush=True)
(qa/'native-validation.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
