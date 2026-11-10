"""Retain OCR views and classify disagreement; never repair or adopt numbers."""
import json
import re
import sys
from pathlib import Path


def normalize(text):
    text = re.sub(r'^#{1,6}\s+', '', text.strip(), flags=re.M)
    # MinerU may route a negative number/range through its formula model.
    # Unwrap only a closed numeric grammar, never general LaTeX expressions.
    if text.startswith('$$') and text.endswith('$$'):
        body = re.sub(r'\s+', '', text[2:-2]).replace('\\sim', '~')
        number = r'[+-]?(?:\d+(?:\.\d+)?|\.\d+)'
        if re.fullmatch(number + '(?:~' + number + ')?', body):
            text = body
    return re.sub(r'\s+', '', text.replace('\\~', '~').replace('～', '~'))


def layer_context(text, soil_name):
    """Read an explicit circle prefix only when its adjacent name agrees.

    soil_name must come from the independently aligned source row, not an
    expected answer. Keep raw context separately; this never infers a code.
    """
    value = normalize(text)
    match = re.fullmatch(r'([①-⑳](?:[0-9]+(?:-[0-9]+)*)?)([\u4e00-\u9fff]+)', value)
    if match and normalize(soil_name) and match[2] == normalize(soil_name):
        return match[1]
    return ''


def compare(kind, views):
    number = r'[+-]?(?:\d+(?:\.\d+)?|\.\d+)'
    pattern = {'range': number + '~' + number, 'mean': number, 'original': '未钻穿',
               'layer-code': r'[①-⑳](?:[0-9]+(?:-[0-9]+)*)?'}.get(kind)
    if pattern is None:
        raise ValueError('Unknown field kind')
    records, candidates = [], {}
    for view in views:
        value = normalize(view['rawText'])
        if kind == 'layer-code':
            # Decode only an explicit numeric circle; never infer 71 -> ⑦1.
            body = value[2:-2] if value.startswith('$$') and value.endswith('$$') else value
            match = re.fullmatch(r'\\textcircled\{([0-9]{1,2})\}([0-9]*(?:-[0-9]+)*)', body)
            if match and 1 <= int(match[1]) <= 20:
                value = chr(0x2460 + int(match[1]) - 1) + match[2]
        state = 'empty' if not value else 'valid' if re.fullmatch(pattern, value) else 'invalid-format'
        records.append({**view, 'normalized': value, 'state': state})
        if state == 'valid':
            candidates.setdefault(value, []).append(view['id'])
    if len(candidates) > 1:
        status = 'numeric-conflict'
    elif any(v['state'] == 'invalid-format' for v in records):
        status = 'review-invalid-format'
    elif not candidates:
        status = 'unread'
    elif len(records) >= 2 and all(v['state'] == 'valid' for v in records):
        status = 'view-agreement'
    else:
        status = 'single-view-only'
    return {'kind': kind, 'status': status, 'automaticAdoption': False, 'views': records,
            'candidates': [{'value': value, 'viewIds': ids} for value, ids in candidates.items()]}


if __name__ == '__main__':
    manifest, destination = map(Path, sys.argv[1:3])
    rows = json.loads(manifest.read_text(encoding='utf8'))
    results = [{**row, 'comparison': compare(row['kind'], row['views'])} for row in rows]
    destination.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf8')
