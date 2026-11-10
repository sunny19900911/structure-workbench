"""Verify lab sample ID/depth pairs against independent native glyph positions.

The table must explicitly label sample ID, sampling depth and metres. Recovery
requires character conservation across the ID/depth and adjacent measurement
cells, never a lookup of plausible IDs or depths from another document.
"""
import re


def compact(value):
    return re.sub(r'\s', '', value)


def verify_sample_depth(data, textpage, height):
    rows = data.get('rows', [])
    headers = rows[:3]
    if (not any(len(r) >= 2 and '土样编号' in compact(r[0]) and '取土深度' in compact(r[1]) for r in headers)
            or not any(len(r) >= 2 and compact(r[1]) == 'm' for r in headers)):
        return data
    glyphs = []
    for i in range(textpage.count_chars()):
        char = textpage.get_text_range(i, 1)
        if not char.strip(): continue
        left, bottom, right, top = textpage.get_charbox(i)
        baseline = height-textpage.get_charbox(i, loose=True)[1]
        glyphs.append((char, (left, height-top, right, height-bottom), baseline))
    checks = []
    for index, row in enumerate(data['cellOrigins']):
        if len(row) < 2 or not all(row[:2]): continue
        first, second = row[:2]
        old = [compact(c.get('unreviewedText', c['text'])) for c in row[:2]]
        if not re.match(r'[A-Za-z]{1,6}\d+[-－]\d+', old[0]): continue
        a, b = first['bbox'], second['bbox']
        if abs(a[2]-b[0]) > .1 or abs(a[1]-b[1]) > .1 or abs(a[3]-b[3]) > .1: continue
        values, cells, boxes, valid = [], [], [], True
        for column, cell in enumerate(row):
            if cell is None: break
            box=cell['bbox']
            if boxes and (abs(boxes[-1][2]-box[0]) > .1 or abs(a[1]-box[1]) > .1 or abs(a[3]-box[3]) > .1): break
            chars = [(c, r, baseline) for c, r, baseline in glyphs if box[0] <= (r[0]+r[2])/2 < box[2] and box[1] <= (r[1]+r[3])/2 < box[3]]
            value = ''.join(c for c, _, _ in chars)
            bounded = textpage.get_text_bounded(box[0], height-box[3], box[2], height-box[1])
            if column >= 2 and value and not re.fullmatch(r'[+\-]?\d+(?:\.\d+)?',value): break
            if (compact(bounded) != value
                    or any(r[0] < box[0]-.1 or r[2] > box[2]+.1 or r[1] < box[1]-.1 or r[3] > box[3]+.1 for _, r, _ in chars)
                    or chars and max(base for _, _, base in chars)-min(base for _, _, base in chars) > 2): valid = False
            values.append(value);cells.append(cell);boxes.append(box)
        if len(values)<2:continue
        old=[compact(c.get('unreviewedText', c['text'])) for c in cells]
        valid &= bool(re.fullmatch(r'[A-Za-z]{1,6}\d+[-－]\d+', values[0]))
        valid &= bool(re.fullmatch(r'\d+(?:\.\d+)?[-－~～]\d+(?:\.\d+)?', values[1]))
        valid &= ''.join(old) == ''.join(values)
        record = {'row': index+1, 'method': 'pdfium-sample-depth-character-conservation',
                  'previous': old, 'independentReading': values, 'bboxes': boxes,
                  'verified': bool(valid), 'changed': bool(valid and old != values),
                  'identityChanged': bool(valid and old[:2] != values[:2])}
        checks.append(record)
        for cell in row:
            if cell: cell['requiresIdentityReview'] = not valid
        if valid:
            for cell, value in zip(cells, values):
                cell.setdefault('unreviewedText', cell['text'])
                cell.update(text=value, requiresReview=False, identityVerification=record['method'])
    if checks:
        data['sampleDepthVerification'] = checks
        data['rows'] = [[c['text'] if c else '' for c in row] for row in data['cellOrigins']]
    return data
