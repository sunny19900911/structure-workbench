"""Compose reviewed spatial OCR parts without chemical dictionary repair."""
import re
import math
from copy import deepcopy

PLAIN=str.maketrans('⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉⁺⁻−','01234567890123456789+--')
SUB=str.maketrans('0123456789','₀₁₂₃₄₅₆₇₈₉')
SUPER=str.maketrans('0123456789+-','⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻')

def compose_parts(evidence):
    out={'status':'unresolved','automaticAdoption':False,'evidence':deepcopy(evidence)}
    def fail(reason):
        out['reason']=reason
        return out
    if evidence.get('geometryReviewed') is not True:
        return fail('geometry-not-reviewed')
    digest=evidence.get('cropSha256','')
    if not re.fullmatch('[a-f0-9]{64}',digest):
        return fail('missing-crop-identity')
    size=evidence.get('cropSize',[])
    if len(size)!=2 or any(type(v)!=int or v<=0 for v in size):
        return fail('invalid-crop-size')
    parts=evidence.get('parts',[]); roles={}
    for p in parts:
        role=p.get('role');box=p.get('bbox',[])
        if role not in ['body','lowered','raised'] or role in roles:
            return fail('invalid-or-repeated-role')
        if p.get('cropSha256')!=digest:
            return fail('mixed-source-crops')
        if (len(box)!=4 or not all(type(v) in [int,float] and math.isfinite(v) for v in box)
                or not 0<=box[0]<box[2]<=size[0] or not 0<=box[1]<box[3]<=size[1]):
            return fail('invalid-part-geometry')
        raw=p.get('raw')
        if not isinstance(raw,str):return fail('missing-raw-text')
        roles[role]={**p,'text':raw.translate(PLAIN).strip()}
    if not {'body','raised'}<=roles.keys():return fail('missing-body-or-charge')
    body=roles['body'];raised=roles['raised'];lower=roles.get('lowered')
    if not re.fullmatch('[A-Za-z]+',body['text']):return fail('unresolved-body')
    if not re.fullmatch('[0-9]*[+-]',raised['text']):return fail('unresolved-charge')
    if lower and not re.fullmatch('[0-9]+',lower['text']):return fail('unresolved-lowered-text')
    cx=lambda p:(p['bbox'][0]+p['bbox'][2])/2
    cy=lambda p:(p['bbox'][1]+p['bbox'][3])/2
    if not (cx(raised)>cx(body) and cy(raised)<cy(body)):
        return fail('charge-not-raised-right')
    if lower and not (cx(lower)>cx(body) and cy(lower)>cy(body)):
        return fail('subscript-not-lowered-right')
    flat=body['text']+(lower['text'] if lower else '')+raised['text']
    view=evidence.get('linearizedRaw')
    if not isinstance(view,str) or re.sub(r'\s+','',view.translate(PLAIN))!=flat:
        return fail('independent-view-disagrees')
    out.update(status='reviewed-geometry-candidate',text=body['text']+
               (lower['text'].translate(SUB) if lower else '')+raised['text'].translate(SUPER))
    return out
