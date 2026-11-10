"""Suggest a name reading from reviewed same-report layer headings.

Never edit raw OCR, infer a layer mapping, repair numeric values, or adopt a
candidate. The caller must supply reviewed evidence and an explicit mapping.
"""
import re


def explicit_heading(heading):
    raw = re.sub(r'\s+', '', heading.get('rawText', ''))
    match = re.match(r'^第[（(]([1-9]\d*)[）)]层[：:]([\u4e00-\u9fff]+)(?:[（(]|$)', raw)
    return bool(match and int(match[1]) == heading.get('layer') and match[2] == heading.get('name'))


def corroborate(chart, evidence):
    digest = chart.get('sourceSha256', '')
    if not re.fullmatch(r'[0-9a-f]{64}', digest) or digest != evidence.get('sourceSha256'):
        raise ValueError('Same PDF identity required')
    if chart.get('layerNumberingVerified') is not True:
        raise ValueError('Explicit layer-number mapping review required')
    if chart.get('status') != 'candidate':
        raise ValueError('Structured chart candidate required')
    result = []
    for row in chart['rows']:
        label = row['values'][0]
        match = re.fullmatch(r'土层([1-9]\d*)', label)
        if not match:
            raise ValueError('Unambiguous source layer label required')
        layer = int(match[1])
        headings = [h for h in evidence['headings'] if h['layer'] == layer]
        # Conflicting or unreviewed evidence is retained, never silently chosen.
        names = {h['name'] for h in headings}
        usable = bool(headings) and len(names) == 1 and all(
            h.get('visuallyReviewed') is True and h.get('page') and h.get('box')
            and re.fullmatch(r'[0-9a-f]{64}', h.get('pageImageSha256', ''))
            and explicit_heading(h) for h in headings)
        for cell in row['cells']:
            if cell['sourceColumn'] not in (2, 5):
                continue
            raw = cell['text']
            record = {'layer': layer, 'sourceColumn': cell['sourceColumn'], 'rawText': raw,
                      'sourceBox': cell['box'], 'automaticAdoption': False,
                      'status': 'unresolved', 'headingEvidence': headings}
            if not usable:
                record['reason'] = 'missing-unreviewed-or-conflicting-heading'
            else:
                name = next(iter(names))
                if raw == name:
                    record['status'] = 'exact-agreement'
                elif (len(raw) == len(name) and raw[:-1] == name[:-1]
                      and raw[-1:] in ('+', '十') and name[-1:] == '土'):
                    record.update(status='source-supported-reading', proposedName=name,
                                  reason='same-report-reviewed-layer-heading')
                else:
                    record['reason'] = 'different-wording-not-normalized'
            result.append(record)
    return {'sourceSha256': digest, 'page': chart['page'], 'drill': chart.get('drill'),
            'cells': result, 'automaticAdoption': False}
