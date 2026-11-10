"""Local-only page benchmark; inputs and outputs belong in ignored QA directories.

Usage: python benchmark-paddle.py <page-images-directory> <output-directory>
No source documents, predictions or model weights belong in Git.
"""
import json
import sys
import time
from pathlib import Path

from paddleocr import PPStructureV3

inputs, output = map(Path, sys.argv[1:3])
output.mkdir(parents=True, exist_ok=True)
started = time.monotonic()
pipeline = PPStructureV3(
    device="cpu",
    enable_mkldnn=False,
    cpu_threads=4,
    use_doc_orientation_classify=False,
    use_doc_unwarping=False,
    use_textline_orientation=False,
    use_formula_recognition=False,
)
results = []
for page in sorted(inputs.glob("*.png")):
    dest = output / page.stem
    dest.mkdir(exist_ok=True)
    before = time.monotonic()
    try:
        count = 0
        for result in pipeline.predict(input=str(page)):
            result.save_to_json(save_path=str(dest))
            result.save_to_markdown(save_path=str(dest))
            count += 1
        record = {"page": page.name, "results": count, "seconds": time.monotonic()-before, "status": "produced" if count else "empty"}
    except Exception as error:
        record = {"page": page.name, "status": "failed", "error": str(error)}
    results.append(record)
    print(json.dumps(record, ensure_ascii=False), flush=True)
    (output / "run.json").write_text(json.dumps({"initialization_and_run_seconds": time.monotonic()-started, "results": results}, ensure_ascii=False, indent=2), encoding="utf-8")
