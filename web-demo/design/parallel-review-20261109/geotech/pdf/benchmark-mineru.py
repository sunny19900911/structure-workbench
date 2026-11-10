"""Local MinerU benchmark. No server or remote parsing fallback.

Usage: python benchmark-mineru.py <images> <output> [basic|standard]
"""
import json
import sys
import time
from pathlib import Path
from mineru.parser import parse
from mineru.config import get_config

def main():
    inputs, output = map(Path, sys.argv[1:3])
    tier = sys.argv[3] if len(sys.argv) > 3 else "basic"
    output.mkdir(parents=True, exist_ok=True)
    print(json.dumps({"tier": tier, "onnx_device": get_config().model.onnx_device}), flush=True)
    results = []
    for page in sorted(inputs.glob("*.png")):
        started = time.monotonic()
        try:
            result = parse(page, tier=tier)
            (output / (page.stem+".json")).write_text(result.to_json(), encoding="utf-8")
            (output / (page.stem+".md")).write_text(result.markdown(), encoding="utf-8")
            record = {"page": page.name, "status": "produced", "seconds": time.monotonic()-started}
        except Exception as error:
            record = {"page": page.name, "status": "failed", "seconds": time.monotonic()-started, "error": str(error)}
        results.append(record)
        print(json.dumps(record, ensure_ascii=False), flush=True)
        (output / "run.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")

if __name__ == '__main__':
    from multiprocessing import freeze_support
    freeze_support()
    main()
