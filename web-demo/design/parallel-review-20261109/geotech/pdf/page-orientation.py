"""Normalize consistently sideways native pages, preserving source coordinates."""
from collections import Counter
import io
import math
from pypdf import PdfReader, PdfWriter


def rotation_for(chars):
    votes = Counter()
    for c in chars:
        if not c.get('text', '').strip(): continue
        matrix = c.get('matrix')
        if not matrix: return 0
        angle = math.degrees(math.atan2(matrix[1], matrix[0])) % 360
        nearest = (round(angle/90)*90) % 360
        if min(abs(angle-nearest), 360-abs(angle-nearest)) > .1: return 0
        votes[nearest] += 1
    if sum(votes.values()) < 40: return 0
    angle, count = votes.most_common(1)[0]
    return angle if angle in (90,270) and count/sum(votes.values()) >= .98 else 0


def rotated_bytes(source, page_index, angle):
    writer=PdfWriter();writer.add_page(PdfReader(source).pages[page_index])
    writer.pages[0].rotate(angle)
    # A rotation flag alone leaves PDFium text boxes in a different frame.
    writer.pages[0].transfer_rotation_to_content()
    output=io.BytesIO();writer.write(output);return output.getvalue()


def source_box(box, angle, width, height):
    x0,y0,x1,y1=box
    if angle==270:return [width-y1,x0,width-y0,x1]
    if angle==90:return [y0,height-x1,y1,height-x0]
    return list(box)


def normalized_box(box, angle, width, height):
    x0,y0,x1,y1=box
    if angle==270:return [y0,width-x1,y1,width-x0]
    if angle==90:return [height-y1,x0,height-y0,x1]
    return list(box)


def orthogonal_table_settings(page):
    edges=[]
    for original in page.edges:
        e=dict(original)
        # Content rotation introduces tiny IEEE rounding errors. Correct only
        # lines already axis-aligned within 0.001 PDF point, not diagonal rules.
        if abs(e['x1']-e['x0'])<.001 and e['bottom']-e['top']>3:
            e.update(x0=round(e['x0'],4),x1=round(e['x0'],4),width=0,orientation='v');edges.append(e)
        elif abs(e['bottom']-e['top'])<.001 and e['x1']-e['x0']>3:
            e.update(top=round(e['top'],4),bottom=round(e['top'],4),height=0,orientation='h');edges.append(e)
    vertical=[e for e in edges if e['orientation']=='v'];horizontal=[e for e in edges if e['orientation']=='h']
    if len(vertical)<2 or len(horizontal)<2:return None
    return {'vertical_strategy':'explicit','horizontal_strategy':'explicit',
            'explicit_vertical_lines':vertical,'explicit_horizontal_lines':horizontal}


def annotate_source_boxes(value, angle, width, height):
    if isinstance(value,list):
        for child in value:annotate_source_boxes(child,angle,width,height)
    elif isinstance(value,dict):
        if isinstance(value.get('bbox'),(list,tuple)) and len(value['bbox'])==4:
            value['sourceBBox']=source_box(value['bbox'],angle,width,height)
            value['coordinateSpace']='normalized-page'
        for key in ['cells','bboxes']:
            boxes=value.get(key)
            if boxes and isinstance(boxes,list) and all(isinstance(b,(list,tuple)) and len(b)==4 for b in boxes):
                value['source'+key.title()]=[source_box(b,angle,width,height) for b in boxes]
        for child in list(value.values()):
            if isinstance(child,(list,dict)):annotate_source_boxes(child,angle,width,height)
