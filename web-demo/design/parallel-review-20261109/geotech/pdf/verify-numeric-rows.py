"""Recover disputed numeric rows using independent PDFium glyph geometry.

Only single-line, contiguous numeric cells are eligible. Both engines must
retain exactly the same ordered numeric characters across each complete run.
No value ranges, rounding, expected answers or other reports are consulted.
"""
import re


def resolve_numeric_rows(data, textpage, height):
    origins = {tuple(c['bbox']): c for row in data.get('cellOrigins', []) for c in row if c}
    bands = {(b[1], b[3]) for b, c in origins.items() if c.get('requiresReview')}
    glyphs = []
    for i in range(textpage.count_chars()):
        char = textpage.get_text_range(i, 1)
        if not char.strip():
            continue
        left, bottom, right, top = textpage.get_charbox(i)
        baseline = height-textpage.get_charbox(i, loose=True)[1]
        glyphs.append((char, (left, height-top, right, height-bottom), baseline))
    resolutions = []
    for top, bottom in sorted(bands):
        row = sorted((b, c) for b, c in origins.items() if b[1] == top and b[3] == bottom)
        # Text labels, multiline values and gaps delimit independent runs.
        # Never search for a convenient sub-run or split a cell to force a match.
        runs, run = [], []
        for box, cell in row:
            previous = cell.get('unreviewedText', cell['text']).strip()
            chars = [(char, rect, baseline) for char, rect, baseline in glyphs
                     if box[0] <= (rect[0]+rect[2])/2 < box[2]
                     and box[1] <= (rect[1]+rect[3])/2 < box[3]]
            value = ''.join(char for char, _, _ in chars)
            bounded = textpage.get_text_bounded(box[0], height-box[3], box[2], height-box[1]).strip()
            # The bounding-box reading and individually contained glyphs must
            # agree. A glyph crossing a border or two baselines rejects it.
            if (not re.fullmatch(r'[+\-\d.]*', previous)
                    or not re.fullmatch(r'[+\-]?\d+(?:\.\d+)?', value)
                    or bounded != value or not chars
                    or any(r[0] < box[0]-.1 or r[2] > box[2]+.1 or r[1] < box[1]-.1 or r[3] > box[3]+.1 for _, r, _ in chars)
                    or max(base for _, _, base in chars)-min(base for _, _, base in chars) > 2):
                if run: runs.append(run)
                run = []
                continue
            if run and abs(run[-1][0][2]-box[0]) > .1:
                runs.append(run); run = []
            run.append((box, cell, previous, value))
        if run: runs.append(run)
        for run in runs:
            if len(run) < 2 or not any(c.get('requiresReview') for _, c, _, _ in run):
                continue
            if ''.join(old for _, _, old, _ in run) != ''.join(value for _, _, _, value in run):
                continue
            records = []
            for box, _, previous, value in run:
                records.append({'bbox': list(box), 'previousText': previous, 'text': value})
                for logical_row in data['cellOrigins']:
                    for cell in logical_row:
                        if cell and tuple(cell['bbox']) == box:
                            cell.setdefault('unreviewedText', cell['text'])
                            cell.update(text=value, requiresReview=False, numericVerification='pdfium-glyphs-and-run-character-conservation')
            resolutions.append({'method': 'pdfium-glyphs-and-run-character-conservation', 'cells': records})
    if resolutions:
        data['numericBoundaryResolutions'] = resolutions
        data['rows'] = [[c['text'] if c else '' for c in row] for row in data['cellOrigins']]
    return data
