"""Experimental layer/time-chart OCR binding using visible horizontal rules.

This profile requires six explicit headers and sequential layer labels. It
does not infer missing borders, repair numbers or adopt engineering values.
"""
import math
import re
import cv2
import numpy as np

HEADERS = ['土层', '深度(m)', '土层描述', '柱状图', '速度m/s', '岩性描述']
SELECTED = [0, 1, 2, 4, 5]


def normalized(value):
    return re.sub(r'\s', '', value).replace('（', '(').replace('）', ')')


def regions(detected):
    result = []
    for box, (text, score) in detected:
        xs, ys = zip(*box)
        if not all(math.isfinite(v) for v in (*xs, *ys)):
            raise ValueError('Nonfinite OCR geometry')
        result.append({'text': text, 'box': box, 'x': sum(xs)/4, 'y': sum(ys)/4})
    return result


def horizontal_rules(gray, left, right):
    """Long near-horizontal source rules; never modify the OCR source image."""
    candidates = []
    span = right-left
    for threshold in (160, 190):
        ink = cv2.threshold(gray, threshold, 255, cv2.THRESH_BINARY_INV)[1]
        lines = cv2.HoughLinesP(ink, 1, np.pi/1800, threshold=80,
                               minLineLength=span*.7, maxLineGap=40)
        if lines is None:
            continue
        for x1, y1, x2, y2 in lines[:, 0]:
            if x2 < x1:
                x1, y1, x2, y2 = x2, y2, x1, y1
            if x1 <= left and x2 >= right and abs(y2-y1) <= .03*(x2-x1):
                candidates.append([int(x1), int(y1), int(x2), int(y2)])
    grouped = []
    for line in sorted(candidates, key=lambda a: line_y(a, left)):
        if grouped and abs(line_y(line, left)-line_y(grouped[-1][0], left)) <= 8:
            grouped[-1].append(line)
        else:
            grouped.append([line])
    return [max(group, key=lambda a: a[2]-a[0]) for group in grouped]


def line_y(line, x):
    x1, y1, x2, y2 = line
    return y1+(y2-y1)*(x-x1)/(x2-x1)


def read_chart(gray, detected):
    raw = regions(detected)
    pending = lambda reason: {'status': 'pending', 'reason': reason, 'automaticAdoption': False}
    headers = []
    for title in HEADERS:
        hits = [r for r in raw if normalized(r['text']) == title]
        if len(hits) != 1:
            return pending('missing-or-duplicate-header')
        headers.append(hits[0])
    centers = [r['x'] for r in headers]
    if any(a >= b for a, b in zip(centers, centers[1:])) or max(r['y'] for r in headers)-min(r['y'] for r in headers) > 30:
        return pending('header-order-or-alignment')
    edges = [centers[0]-(centers[1]-centers[0])/2]
    edges += [(a+b)/2 for a, b in zip(centers, centers[1:])]
    edges += [centers[-1]+(centers[-1]-centers[-2])/2]
    header_y = max(r['y'] for r in headers)
    anchors = sorted([r for r in raw if re.fullmatch(r'土层\d+', normalized(r['text']))
                      and edges[0] < r['x'] < edges[1] and r['y'] > header_y], key=lambda r: r['y'])
    if not anchors or [normalized(r['text']) for r in anchors] != [f'土层{i+1}' for i in range(len(anchors))]:
        return pending('layer-sequence')
    rules = [line for line in horizontal_rules(gray, centers[0], centers[-1])
             if header_y < line_y(line, centers[0]) < gray.shape[0]*.95]
    if len(rules) != len(anchors)+1:
        return pending('incomplete-or-extra-row-rules')
    rows = []
    for index, (upper, lower) in enumerate(zip(rules, rules[1:])):
        anchor = anchors[index]
        if not line_y(upper, anchor['x']) < anchor['y'] < line_y(lower, anchor['x']):
            return pending('layer-outside-row')
        cells = []
        for col in SELECTED:
            hits = [r for r in raw if edges[col] < r['x'] < edges[col+1]
                    and line_y(upper, r['x']) < r['y'] < line_y(lower, r['x'])]
            if len(hits) != 1:
                return pending('missing-or-multiple-cell-texts')
            hit = hits[0]
            crosses = any(y <= line_y(upper, x) or y >= line_y(lower, x)
                          or x <= edges[col] or x >= edges[col+1] for x, y in hit['box'])
            cells.append({**hit, 'sourceColumn': col, 'boundaryReview': crosses})
        rows.append({'values': [c['text'] for c in cells], 'cells': cells,
                     'upperRule': upper, 'lowerRule': lower})
    return {'status': 'candidate', 'profile': 'layer-time-chart', 'rows': rows,
            'headerEvidence': headers, 'columnZones': edges,
            'columnZoneMethod': 'header-center-midpoints-not-detected-vertical-rules',
            'automaticAdoption': False}


if __name__ == '__main__':
    import hashlib
    import json
    import sys
    from pathlib import Path
    # OCR input must be full-page source coordinates from benchmark-field-ocr.
    ocr_file, image_dir, output_dir = map(Path, sys.argv[1:4])
    document = json.loads(ocr_file.read_text(encoding='utf8'))
    output_dir.mkdir(parents=True, exist_ok=True)
    summary = []
    for page in document['rows']:
        name = page['id']
        if Path(name).name != name or not re.fullmatch(r'page-\d+', name):
            raise ValueError('Page image identity required')
        data = (image_dir / (name+'.png')).read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        if digest != page['sha256']:
            raise ValueError('OCR/source image hash mismatch')
        gray = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_GRAYSCALE)
        result = read_chart(gray, page['detected'][0])
        result['pageImageSha256'] = digest
        result['sourceOcr'] = str(ocr_file)
        (output_dir / (name+'.json')).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf8')
        summary.append({'page': name, 'status': result['status'], 'rows': len(result.get('rows', [])),
                        'reason': result.get('reason')})
    print(json.dumps(summary, ensure_ascii=False))
