"""Flag an unread raised horizontal mark in an isolated label crop.

This is a visual discrepancy candidate, not chemical recognition or repair.
The caller must retain the original image and its page/cell identity.
"""
import cv2
import numpy as np
from statistics import median


def audit_raised_marks(gray, raw_text):
    if not isinstance(gray, np.ndarray) or gray.ndim != 2 or gray.dtype != np.uint8:
        raise ValueError('Original grayscale uint8 crop required')
    if not isinstance(raw_text, str):
        raise ValueError('Raw OCR text required')
    result = {'rawText': raw_text, 'automaticAdoption': False, 'marks': [],
              'status': 'not-assessed', 'threshold': 190}
    height, width = gray.shape
    if height < 12 or width < 12:
        return result
    # An already represented charge is not diagnosed as missing. This does
    # not mean its location or chemical meaning has been verified.
    if any(char in raw_text for char in '+-⁺⁻−'):
        result['reason'] = 'charge-already-present'
        return result
    _, _, stats, _ = cv2.connectedComponentsWithStats((gray < 190).astype(np.uint8))
    components = [tuple(map(int, row)) for row in stats[1:]
                  if row[0] > 0 and row[1] > 0
                  and row[0]+row[2] < width and row[1]+row[3] < height]
    bodies = [c for c in components if height*.4 <= c[3] <= height*.8 and c[2] < width*.6]
    if len(bodies) < 2:
        result['reason'] = 'insufficient-body-geometry'
        return result
    body_height = median(c[3] for c in bodies)
    body_top = median(c[1] for c in bodies)
    right = max(c[0]+c[2] for c in bodies)
    for x,y,w,h,area in components:
        if (right <= x <= right+body_height*1.5 and w >= 3
                and w >= 2.5*h and h <= max(2, body_height*.15)
                and body_top-body_height*.35 <= y+h/2 <= body_top+body_height*.3
                and area >= 3):
            result['marks'].append({'bbox': [x,y,x+w,y+h], 'inkPixels': area,
                                    'kind': 'raised-horizontal-mark'})
    result['status'] = 'review-required' if result['marks'] else 'no-candidate-found'
    # Absence of a candidate is explicitly not a correctness certificate.
    return result
