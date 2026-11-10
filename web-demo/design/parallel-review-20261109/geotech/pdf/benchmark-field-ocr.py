"""Diagnose already isolated field crops with local OCR, without page layout.

Usage: python benchmark-field-ocr.py model-dir image-dir output.json [--separate-boxes]
No expected answers, repairs, parameter adoption or model downloads.
"""
import hashlib
import json
import sys
import cv2
import numpy as np
from pathlib import Path
from mineru.model.ocr.pp_ocr_v6_onnx import PPOCRv6ONNX

if __name__ == '__main__':
    models, images, output = map(Path, sys.argv[1:4])
    det = models / 'ch_PP-OCRv6_tiny_det_infer.onnx'
    rec = models / 'ch_PP-OCRv6_small_rec_infer.onnx'
    if not det.is_file() or not rec.is_file():
        raise FileNotFoundError('Local OCR model files required')
    merge = '--separate-boxes' not in sys.argv[4:]
    model = PPOCRv6ONNX(str(det), str(rec), device='cpu', intra_op_num_threads=4,
                       enable_merge_det_boxes=merge)
    rows = []
    for path in sorted(images.glob('*.png')):
        pixels = cv2.imdecode(np.frombuffer(path.read_bytes(), dtype=np.uint8), cv2.IMREAD_COLOR)
        rows.append({'id': path.stem, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                     'detected': model.ocr(pixels, det=True, rec=True),
                     'recognitionOnly': model.ocr(pixels, det=False, rec=True)})
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({'scope': 'isolated source crops only',
                                 'automaticAdoption': False, 'mergeDetectionBoxes': merge, 'rows': rows},
                                ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'fields': len(rows), 'output': str(output)}))
