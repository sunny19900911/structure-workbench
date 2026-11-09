"""Run a benchmark child with a real time limit and retained error log.

Usage: python run-bounded.py <seconds> <output-prefix> <python-script> [args...]
"""
import json
import subprocess
import sys
import time
from pathlib import Path

seconds, prefix = int(sys.argv[1]), Path(sys.argv[2])
prefix.parent.mkdir(parents=True, exist_ok=True)
started = time.monotonic()
with prefix.with_suffix(".log").open("w", encoding="utf-8") as log:
    try:
        result = subprocess.run([sys.executable, *sys.argv[3:]], stdout=log, stderr=subprocess.STDOUT, timeout=seconds)
        status = {"exit_code": result.returncode}
    except subprocess.TimeoutExpired:
        status = {"status": "timeout", "limit_seconds": seconds}
status["seconds"] = time.monotonic()-started
prefix.with_suffix(".status.json").write_text(json.dumps(status, indent=2), encoding="utf-8")
print(json.dumps(status), flush=True)
