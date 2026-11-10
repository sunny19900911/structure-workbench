"""Bind OCR boxes to explicit column edges without splitting recognized text."""
import math


def assign_column(box, edges):
    if len(edges) < 2 or not all(isinstance(x, (int, float)) and math.isfinite(x) for x in edges):
        raise ValueError('Finite column edges required')
    if any(a >= b for a, b in zip(edges, edges[1:])):
        raise ValueError('Column edges must increase')
    if (len(box) != 4 or any(len(p) != 2 for p in box)
            or not all(isinstance(v, (int, float)) and math.isfinite(v) for p in box for v in p)):
        raise ValueError('Finite quadrilateral required')
    left, right = min(p[0] for p in box), max(p[0] for p in box)
    if left >= right or min(p[1] for p in box) >= max(p[1] for p in box):
        raise ValueError('Nonempty OCR box required')
    columns = [i for i, (a, b) in enumerate(zip(edges, edges[1:])) if left < b and right > a]
    outside = left < edges[0] or right > edges[-1]
    return {'status': 'outside-columns' if outside else 'crosses-columns' if len(columns) != 1 else 'single-column',
            'column': columns[0] if not outside and len(columns) == 1 else None,
            'overlappingColumns': columns, 'automaticAdoption': False}


def guard_regions(regions, edges):
    # Preserve every raw string and polygon, including rejected ones.
    return [{**region, 'columnCheck': assign_column(region['box'], edges)} for region in regions]


def column_recrop_boxes(box, edges, image_size):
    """Propose full-column crops at the flagged vertical span, not string cuts.

    A crop may expose another cell in the same row. Callers must bind its page,
    row and column and retain duplicates as views, never append new soil rows.
    """
    check = assign_column(box, edges)
    if len(image_size) != 2 or any(not isinstance(v, int) or v <= 0 for v in image_size):
        raise ValueError('Positive integer image size required')
    width, height = image_size
    if (edges[0] < 0 or edges[-1] > width or any(x != int(x) for x in edges)
            or min(p[1] for p in box) < 0 or max(p[1] for p in box) > height):
        raise ValueError('Geometry must fit the image; no implicit clamping')
    if check['status'] != 'crosses-columns':
        return []
    top, bottom = math.floor(min(p[1] for p in box)), math.ceil(max(p[1] for p in box))
    return [{'column': col, 'bbox': [int(edges[col]), top, int(edges[col+1]), bottom],
             'automaticAdoption': False} for col in check['overlappingColumns']]


def band_box_to_source(box, source_boxes, scale=2, padding=32):
    """Invert horizontal crop concatenation, white padding and uniform scale.

    A box crossing a join returns multiple source pieces, never one misleading
    rectangle spanning the removed chart area.
    """
    if (not math.isfinite(scale) or scale <= 0 or not math.isfinite(padding) or padding < 0
            or len(box) != 4 or not all(math.isfinite(v) for v in box)
            or box[0] >= box[2] or box[1] >= box[3] or not source_boxes):
        raise ValueError('Invalid band transform')
    for b in source_boxes:
        if len(b) != 4 or not all(math.isfinite(v) for v in b) or b[0] < 0 or b[1] < 0 or b[0] >= b[2] or b[1] >= b[3]:
            raise ValueError('Invalid source crop')
    heights=[b[3]-b[1] for b in source_boxes]
    if any(h != heights[0] for h in heights): raise ValueError('Unequal source crop heights')
    x0,y0,x1,y1=[v/scale-padding for v in box]
    width=sum(b[2]-b[0] for b in source_boxes)
    if x0 < 0 or x1 > width or y0 < 0 or y1 > heights[0]:
        raise ValueError('Box overlaps padding or lies outside data')
    offset=0;pieces=[]
    for index,b in enumerate(source_boxes):
        end=offset+b[2]-b[0];left=max(x0,offset);right=min(x1,end)
        if left < right:
            pieces.append({'sourceCrop':index,'bbox':[b[0]+left-offset,b[1]+y0,b[0]+right-offset,b[1]+y1]})
        offset=end
    return pieces
