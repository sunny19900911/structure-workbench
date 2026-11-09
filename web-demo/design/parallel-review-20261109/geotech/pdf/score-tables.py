"""Compare saved engine HTML tables with private, independently checked grids.

Usage: python score-tables.py <expected-cells.json> <engine-output-dir> <score.json>
Whitespace alone is normalized; no correction of digits, units or inequalities.
The score covers supplied cells, not full-document accuracy or header correctness.
"""
import json
import re
import sys
from pathlib import Path
from bs4 import BeautifulSoup


def grids(value):
    if isinstance(value, dict):
        for child in value.values():
            yield from grids(child)
    elif isinstance(value, list):
        for child in value:
            yield from grids(child)
    elif isinstance(value, str) and "<table" in value.lower():
        for table in BeautifulSoup(value, "html.parser").find_all("table"):
            cells = {}
            for ri, row in enumerate(table.find_all("tr")):
                ci = 0
                for cell in row.find_all(["td", "th"], recursive=False):
                    while (ri, ci) in cells:
                        ci += 1
                    rs, cs = int(cell.get("rowspan", 1)), int(cell.get("colspan", 1))
                    if not 1 <= rs <= 1000 or not 1 <= cs <= 200:
                        raise ValueError("Invalid table span")
                    for r in range(ri, ri+rs):
                        for c in range(ci, ci+cs):
                            cells[r, c] = cell.get_text("", strip=True)
                    ci += cs
            if cells:
                yield [[cells.get((r, c), "") for c in range(max(c for _, c in cells)+1)] for r in range(max(r for r, _ in cells)+1)]


def norm(value):
    return re.sub(r"\s+", "", str(value or ""))


if __name__ == "__main__":
    expected, folder, output = map(Path, sys.argv[1:4])
    results = []
    for name, wanted in json.loads(expected.read_text(encoding="utf-8")).items():
        candidates = []
        for file in folder.rglob("*.json"):
            if name not in str(file.relative_to(folder)):
                continue
            for table in grids(json.loads(file.read_text(encoding="utf-8"))):
                if len(table[0]) != len(wanted[0]):
                    continue
                for offset in range(len(table)):
                    checks = []
                    for ri, row in enumerate(wanted):
                        for ci, value in enumerate(row):
                            actual = table[offset+ri][ci] if offset+ri < len(table) else None
                            checks.append({"row": ri+1, "column": ci+1, "expected": value, "actual": actual, "pass": actual is not None and norm(value)==norm(actual)})
                    candidates.append({"file": str(file), "offset": offset, "correct": sum(c["pass"] for c in checks), "checked": len(checks), "checks": checks})
        best = max(candidates, key=lambda c:c["correct"]) if candidates else {"correct": 0, "checked": sum(map(len, wanted)), "status": "no_matching_width_table"}
        results.append({"page": name, **best})
    output.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps([{k:v for k,v in r.items() if k!='checks'} for r in results], ensure_ascii=False))
