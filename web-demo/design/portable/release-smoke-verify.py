"""Independent output verification. Does not run Word/Office or recalculate models."""
import json
import sys
import zipfile
from pathlib import Path
from lxml import etree as ET
from pypdf import PdfReader

folder=Path(sys.argv[1]).resolve()
source_root=Path(__file__).resolve().parents[2]
NS={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
out={'passed':True,'documents':[]}
for name in ['measures.docx','expansion.docx','calculation.docx']:
    with zipfile.ZipFile(folder/name) as z:
        assert z.testzip() is None,(name,'CRC failure')
        root=ET.fromstring(z.read('word/document.xml'))
        text=''.join(root.xpath('//w:t/text()',namespaces=NS))
        for number in ['23.70','1234.56','-1.250']:
            assert number in text,(name,'missing numeric token',number)
        assert not root.xpath(".//*[local-name()='imagedata'] | .//*[local-name()='drawing']"),(name,'unexpected original image/seal')
        item={'name':name,'numericTokensPreserved':True,'tables':len(root.xpath('//w:tbl',namespaces=NS)),'drawings':0,'mediaParts':len([n for n in z.namelist() if n.startswith('word/media/')])}
        assert item['mediaParts']==0,(name,'unexpected bundled original media')
        if name!='calculation.docx':
            item['gridSpan']=len(root.xpath('//w:gridSpan',namespaces=NS));item['vMerge']=len(root.xpath('//w:vMerge',namespaces=NS))
            assert item['gridSpan']>0 and item['vMerge']>0,(name,'table merged cells lost')
        if name=='expansion.docx':
            assert '云南旅游学院' not in text and '媒体楼' not in text,(name,'historical identity retained')
            patterns=json.loads((source_root/'design/reference-expansion/native-tables.json').read_text('utf-8'))
            reference=ET.fromstring(patterns['tables']['1'])
            actual=root.xpath('//w:tbl',namespaces=NS)[0]
            attribute=lambda element,key:element.get('{'+NS['w']+'}'+key)
            expected_widths=[attribute(c,'w') for c in reference.xpath('./w:tblGrid/w:gridCol',namespaces=NS)]
            actual_widths=[attribute(c,'w') for c in actual.xpath('./w:tblGrid/w:gridCol',namespaces=NS)]
            assert expected_widths==actual_widths,'Native table column widths changed'
            def merged_signature(row):
                return [[attribute(node,'val') or '' for node in cell.xpath('./w:tcPr/w:gridSpan|./w:tcPr/w:vMerge',namespaces=NS)] for cell in row.xpath('./w:tc',namespaces=NS)]
            expected_rows=reference.xpath('./w:tr',namespaces=NS)[:3]
            actual_rows=actual.xpath('./w:tr',namespaces=NS)
            assert [merged_signature(r) for r in expected_rows]==[merged_signature(r) for r in actual_rows],'Native table merge geometry changed'
            item['nativeColumnWidthsPreserved']=True;item['nativeMergeGeometryPreserved']=True
        # Both native expansion and portable measures preserve A3 landscape setup.
        pages=root.xpath('//w:sectPr/w:pgSz',namespaces=NS)
        assert pages and all(int(p.get('{'+NS['w']+'}w'))>int(p.get('{'+NS['w']+'}h')) for p in pages),(name,'landscape lost')
        out['documents'].append(item)
sources=[PdfReader(p,strict=True) for p in json.loads((folder/'pdf-sources.json').read_text('utf-8'))]
merged=PdfReader(folder/'merged.pdf',strict=True)
originals=[page for source in sources for page in source.pages]
assert len(merged.pages)==len(originals)==4,'PDF page count mismatch'
out['pdf']={'pages':4,'orderAndDimensionsPreserved':True,'details':[]}
for i,(before,after) in enumerate(zip(originals,merged.pages)):
    assert before.extract_text().strip()==after.extract_text().strip(),('PDF page order/text mismatch',i)
    dimensions=[float(before.mediabox.width),float(before.mediabox.height)]
    assert [float(after.mediabox.width),float(after.mediabox.height)]==dimensions,('PDF page size changed',i)
    out['pdf']['details'].append({'page':i+1,'text':after.extract_text().strip(),'dimensions':dimensions})
print(json.dumps(out,ensure_ascii=True))
