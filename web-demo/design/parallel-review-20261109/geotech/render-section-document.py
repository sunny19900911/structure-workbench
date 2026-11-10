"""Independent A3 two-column geotech draft; does not modify the shared exporter."""
import importlib.util
import json
import sys
import base64
import io
import re
from pathlib import Path
from PIL import Image
from docx import Document
from docx.shared import Cm, Pt, RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.section import WD_SECTION_START

spec = importlib.util.spec_from_file_location('native', Path(__file__).with_name('render-native-table.py'))
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)


def build(data, destination, title):
    images = data.get('images', [])
    placed = [b for s in data['sections'] for b in s['blocks'] if b['kind'] == 'geotech-source-image']
    if sorted(i['id'] for i in images) != sorted(i['id'] for i in placed) or data.get('imagePlacement', {}).get('pending'):
        raise ValueError('Source images remain unplaced; refusing to omit them')
    doc = Document()
    section = doc.sections[0]
    section.page_width = Cm(42)
    section.page_height = Cm(29.7)
    section.top_margin = section.bottom_margin = Cm(1.8)
    section.left_margin = section.right_margin = Cm(2)
    columns = section._sectPr.find(qn('w:cols'))
    columns.set(qn('w:num'), '2')
    columns.set(qn('w:space'), str(round(Cm(1).twips)))
    for name, size in [('Normal', 11), ('Title', 18), ('Heading 1', 13), ('Heading 2', 12), ('Caption', 10.5)]:
        style = doc.styles[name]
        style.font.name = 'Times New Roman'
        style.font.size = Pt(size)
        style.font.color.rgb = RGBColor(0, 0, 0)
        style._element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'), '宋体')
        style.paragraph_format.space_after = Pt(5)
        style.paragraph_format.line_spacing = 1.15
        for border in style._element.xpath('.//w:pBdr'):
            border.getparent().remove(border)
    doc.styles['Caption'].font.italic = False
    doc.styles['Caption'].paragraph_format.keep_with_next = True
    for name in ['Heading 1', 'Heading 2']:
        doc.styles[name].paragraph_format.keep_with_next = True
    doc.add_paragraph(title, 'Title')
    seismic = False
    for item in data['sections']:
        if not item['blocks']:
            continue
        heading = item['title']
        if heading.startswith('4.4.') and not seismic:
            doc.add_paragraph('4.4 场地地震效应评价', 'Heading 1')
            seismic = True
        doc.add_paragraph(heading, 'Heading 2' if heading.startswith('4.4.') else 'Heading 1')
        for block in item['blocks']:
            if block['kind'] == 'paragraph':
                p = doc.add_paragraph()
                native.append_runs(p, block)
                p.paragraph_format.first_line_indent = Pt(22)
            elif block['kind'] == 'geotech-source-table':
                wide = block['width'] >= 12
                if wide:
                    wide_section = doc.add_section(WD_SECTION_START.NEW_PAGE)
                    wide_section._sectPr.find(qn('w:cols')).set(qn('w:num'), '1')
                if block.get('title'):
                    doc.add_paragraph(block['title'] + ('（续）' if block.get('continuation') else ''), 'Caption')
                native.append_source_table(doc, block, width_cm=38 if wide else 18.5)
                if wide:
                    following = doc.add_section(WD_SECTION_START.NEW_PAGE)
                    following._sectPr.find(qn('w:cols')).set(qn('w:num'), '2')
            elif block['kind'] == 'table-text-fallback':
                for text in block['paragraphs']:
                    doc.add_paragraph(text)
            elif block['kind'] == 'geotech-source-image':
                match = re.fullmatch(r'data:image/(?:png|jpeg);base64,([A-Za-z0-9+/=\r\n]+)', block['data'])
                if not match:
                    raise ValueError('Unsupported source image payload')
                payload = base64.b64decode(match[1], validate=True)
                with Image.open(io.BytesIO(payload)) as im:
                    width, height = im.size
                    im.verify()
                # Preserve a PDF map's original physical scale when it fits.
                # Other sources retain the established 12 cm image limit.
                source_box = block.get('sourceBBox')
                if (block.get('representation') == 'reviewed-pdf-page-crop'
                        and block.get('coordinateSpace') == 'pdf-page-top-left-points'
                        and source_box and len(source_box) == 4):
                    natural_width = (source_box[2]-source_box[0])*2.54/72
                    natural_height = (source_box[3]-source_box[1])*2.54/72
                    if natural_width <= 0 or natural_height <= 0:
                        raise ValueError('Invalid PDF crop physical size')
                    scale = min(18.5/width, 22/height, natural_width/width, natural_height/height)
                else:
                    scale = min(18.5 / width, 12 / height)
                p = doc.add_paragraph()
                p.alignment = 1
                p.paragraph_format.keep_with_next = True
                p.add_run().add_picture(io.BytesIO(payload), width=Cm(width*scale), height=Cm(height*scale))
                if not block.get('captionInParagraph'):
                    caption = doc.add_paragraph(block['caption'], 'Caption')
                    caption.alignment = 1
                    caption.paragraph_format.keep_with_next = False
            else:
                raise ValueError('Unknown section block: ' + block['kind'])
    footer = section.footer.paragraphs[0]
    footer.alignment = 1
    field = OxmlElement('w:fldSimple')
    field.set(qn('w:instr'), 'PAGE')
    footer._p.append(field)
    doc.save(destination)


if __name__ == '__main__':
    build(json.loads(Path(sys.argv[1]).read_text(encoding='utf8')), sys.argv[2], sys.argv[3])
