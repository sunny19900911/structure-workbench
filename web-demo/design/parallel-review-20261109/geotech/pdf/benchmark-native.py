"""Read selected native PDF tables with geometric merge provenance.

Usage: python benchmark-native.py <private-pages.json> <output-directory>
Null cells are expanded only when an actual spanning PDF cell covers them.
This is an isolated benchmark, not the application's production PDF route.
"""
import hashlib
import json
import sys
import time
from pathlib import Path

import pdfplumber


def table_data(table):
    raw = table.extract()
    xs = sorted({v for cell in table.cells for v in (cell[0], cell[2])})
    ys = sorted({v for cell in table.cells for v in (cell[1], cell[3])})
    owners = {}
    for ri, row in enumerate(table.rows):
        for ci, cell in enumerate(row.cells):
            if cell is not None:
                owners[cell] = {"row": ri, "column": ci, "text": raw[ri][ci] or ""}
    # Keep the original matrix if borders do not form the expected grid.
    if len(xs)-1 != max(map(len, raw)) or len(ys)-1 != len(raw):
        return {"bbox": table.bbox, "rawRows": raw, "rows": raw, "gridExpanded": False, "warning": "Irregular grid: no merge expansion"}
    rows, provenance = [], []
    for ri in range(len(ys)-1):
        values, origins = [], []
        for ci in range(len(xs)-1):
            x, y = (xs[ci]+xs[ci+1])/2, (ys[ri]+ys[ri+1])/2
            matches = [cell for cell in owners if cell[0] < x < cell[2] and cell[1] < y < cell[3]]
            owner = owners[matches[0]] if len(matches) == 1 else None
            values.append(owner["text"] if owner else "")
            origins.append({**owner, "bbox": matches[0]} if owner else None)
        rows.append(values)
        provenance.append(origins)
    return {"bbox": table.bbox, "rawRows": raw, "rows": rows, "gridExpanded": True, "cellOrigins": provenance}


if __name__ == "__main__":
    manifest, output = Path(sys.argv[1]), Path(sys.argv[2])
    output.mkdir(parents=True, exist_ok=True)
    results = []
    for item in json.loads(manifest.read_text(encoding="utf-8")):
        started = time.monotonic()
        path = Path(item["input"])
        with pdfplumber.open(path) as doc:
            page = doc.pages[item["page"]-1]
            tables = [table_data(t) for t in page.find_tables()]
            result = {"id": item["id"], "page": item["page"], "sourceHash": hashlib.sha256(path.read_bytes()).hexdigest(), "ocrApplied": False, "text": page.extract_text() or "", "tables": tables, "seconds": time.monotonic()-started}
        (output / (item["id"]+".json")).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        results.append({"id": item["id"], "tables": len(tables), "seconds": result["seconds"]})
    (output / "run.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(json.dumps(results), flush=True)
