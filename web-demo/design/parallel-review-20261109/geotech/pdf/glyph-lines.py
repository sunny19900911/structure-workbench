"""Keep small raised/lowered digits with their geometric host text line.

No geological code or numeric value is inferred: only existing small glyphs
with a nearby larger glyph are attached. Unmatched glyphs remain separate.
"""
from statistics import median

SUPER=str.maketrans('0123456789+-mlha','⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ᵐˡʰᵃ')
SUB=str.maketrans('0123456789+-','₀₁₂₃₄₅₆₇₈₉₊₋')

def glyph_lines(region, reference_size=None):
    chars=[c for c in region.chars if c['text'].strip()]
    if not chars:return []
    usual=reference_size or median(c['size'] for c in chars)
    small=[c for c in chars if c['size']<usual*.8]
    if not small:return region.extract_text_lines(return_chars=False)
    normal=region.filter(lambda c:c.get('object_type')!='char' or c['size']>=usual*.8)
    lines=normal.extract_text_lines(return_chars=True)
    additions={i:[] for i in range(len(lines))};unmatched=[]
    for glyph in small:
        cy=(glyph['top']+glyph['bottom'])/2;candidates=[]
        for i,line in enumerate(lines):
            for host in line['chars']:
                dy=cy-(host['top']+host['bottom'])/2;dx=glyph['x0']-host['x1']
                if glyph['size']<host['size']*.8 and -.25*host['size']<=dx<=host['size']*1.6 and abs(dy)<host['size']*.65:
                    candidates.append((abs(dy)+abs(dx),i,host,dy))
        if not candidates:unmatched.append(glyph);continue
        _,index,host,dy=min(candidates,key=lambda c:c[0])
        value=glyph['text']
        if abs(dy)>host['size']*.08:value=value.translate(SUB if dy>0 else SUPER)
        additions[index].append({**glyph,'text':value})
    result=[]
    for i,line in enumerate(lines):
        glyphs=sorted(line['chars']+additions[i],key=lambda c:(c['x0'],c['top']))
        text='';previous=None
        for glyph in glyphs:
            if previous and glyph['x0']-previous['x1']>max(1.5,usual*.25):text+=' '
            text+=glyph['text'];previous=glyph
        result.append({**{k:line[k] for k in ['x0','x1','top','bottom']},'text':text})
    if unmatched:
        keys={(c['x0'],c['top'],c['text']) for c in unmatched}
        orphan=region.filter(lambda c:c.get('object_type')=='char' and (c['x0'],c['top'],c['text']) in keys)
        result.extend(orphan.extract_text_lines(return_chars=False))
    return sorted(result,key=lambda l:(l['top'],l['x0']))
