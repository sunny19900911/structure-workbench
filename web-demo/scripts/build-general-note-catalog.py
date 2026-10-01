"""Build the browser-readable 604 general-note component catalog.

The 604 source files are read-only. This script extracts block-level text,
classifies authoring markers, and writes a derived JavaScript data asset under
web-demo/data so the standalone workbench can run from file:// without fetch.
"""

from __future__ import annotations

import csv
import json
import re
import subprocess
from collections import Counter
from datetime import datetime
from pathlib import Path

from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph
from lxml import etree


WORKSPACE = Path(__file__).resolve().parents[2]
OUTPUT = WORKSPACE / "web-demo" / "data" / "general-note-masters.v1.js"
ANTIWORD = Path(r"C:\Program Files\Git\mingw64\bin\antiword.exe")

COMPONENTS = [
    ("GNM-604-20260901-01", "01", "通用说明", {"type": "always"}),
    ("GNM-604-20260901-02", "02", "地基基础", {"type": "always"}),
    ("GNM-604-20260901-03", "03", "混凝土结构", {"type": "feature", "key": "has_concrete"}),
    ("GNM-604-20260709-04", "04", "钢结构", {"type": "feature", "key": "has_steel"}),
    ("GNM-604-20251230-05", "05", "砌体结构", {"type": "feature", "key": "has_masonry"}),
    ("GNM-604-20251230-06", "06", "绿色建筑设计专篇 结构专业", {"type": "feature", "key": "has_green_building"}),
    ("GNM-604-20260821-07", "07", "装配式混凝土结构", {"type": "feature", "key": "has_precast"}),
    (
        "GNM-604-20260529-08",
        "08",
        "隔震 消能减震与结构健康监测设计专篇",
        {"type": "any", "keys": ["has_iso", "has_damp", "has_health_monitoring"]},
    ),
    ("GNM-604-20260428-09", "09", "专项设计技术要求 结构专业", {"type": "feature", "key": "has_special_design_scope"}),
    ("GNM-604-20260529-10", "10", "既有建筑加固改造", {"type": "feature", "key": "has_existing"}),
]

MARKER_RE = re.compile(r"^【([^】]+)】")
PLACEHOLDER_RE = re.compile(r"(?:X{2,}|待填写|SRC-PENDING)", re.I)


def find_604_root() -> Path:
    db = next(Path("E:/").glob("600-*"))
    return next(db.glob("604-*"))


def normalized_text(value: str) -> str:
    value = value.replace("\xa0", " ").replace("\u3000", " ")
    value = re.sub(r"[\t ]+", " ", value)
    value = re.sub(r"\s*\n\s*", " ", value)
    return value.strip()


def role_for(text: str) -> str:
    markers = set(MARKER_RE.findall(text))
    if "注释" in markers:
        return "editorial_note"
    if "【注释】" in text:
        return "mixed_annotation"
    if "待协" in markers:
        return "coordination_item"
    if "备用" in markers or any(x.startswith("选项") for x in markers):
        return "optional_clause"
    if "要点" in markers:
        return "designer_prompt"
    if "示例" in markers:
        return "example_text"
    if PLACEHOLDER_RE.search(text):
        return "project_placeholder"
    return "formal_text"


def add_text_block(out: list[dict], component_no: str, text: str, *, heading: bool, role: str | None = None) -> None:
    text = normalized_text(text)
    if not text:
        return
    seq = len(out) + 1
    out.append(
        {
            "block_id": f"GN-{component_no}-{seq:05d}",
            "type": "heading" if heading else "paragraph",
            "role": role or role_for(text),
            "text": text,
            "source_locator": f"block:{seq}",
        }
    )


def docbook_blocks(path: Path, component_no: str) -> list[dict]:
    proc = subprocess.run(
        [str(ANTIWORD), "-x", "db", "-m", "UTF-8.txt", str(path)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=True,
    )
    # A few metadata strings in legacy files use a mismatched codepage. Recover
    # the XML and retain the UTF-8 body text rather than mutating the source.
    xml_text = proc.stdout.decode("utf-8", "replace")
    parser = etree.XMLParser(recover=True, load_dtd=False, no_network=True)
    root = etree.fromstring(xml_text.encode("utf-8"), parser=parser)
    blocks: list[dict] = []

    def local_name(el) -> str:
        return etree.QName(el).localname if isinstance(el.tag, str) else ""

    def emit_table(table_el) -> None:
        rows = []
        for row in table_el.xpath(".//*[local-name()='row']"):
            cells = []
            for entry in row.xpath("./*[local-name()='entry']"):
                cells.append(normalized_text("".join(entry.itertext())))
            if any(cells):
                rows.append(cells)
        if not rows:
            return
        seq = len(blocks) + 1
        table_text = " ".join(cell for row in rows for cell in row)
        blocks.append(
            {
                "block_id": f"GN-{component_no}-{seq:05d}",
                "type": "table",
                "role": "mixed_annotation" if "【注释】" in table_text else "formal_text",
                "rows": rows,
                "source_locator": f"block:{seq}",
            }
        )

    def walk(container) -> None:
        annotation_run = False
        for child in container:
            tag = local_name(child)
            if tag == "para":
                text = normalized_text("".join(child.itertext()))
                if not text:
                    continue
                marker = MARKER_RE.match(text)
                bold = bool(child.xpath(".//*[local-name()='emphasis' and @role='bold']"))
                if text.startswith("【注释】"):
                    annotation_run = True
                elif marker or bold:
                    annotation_run = False
                add_text_block(
                    blocks,
                    component_no,
                    text,
                    heading=bold and not marker,
                    role="editorial_note" if annotation_run else None,
                )
            elif tag in {"informaltable", "table"}:
                annotation_run = False
                emit_table(child)
            else:
                annotation_run = False
                walk(child)

    walk(root)
    return blocks


def iter_docx_blocks(doc: Document):
    body = doc.element.body
    for child in body.iterchildren():
        if child.tag.endswith("}p"):
            yield Paragraph(child, doc)
        elif child.tag.endswith("}tbl"):
            yield Table(child, doc)


def docx_blocks(path: Path, component_no: str) -> list[dict]:
    doc = Document(path)
    blocks: list[dict] = []
    annotation_run = False
    for item in iter_docx_blocks(doc):
        if isinstance(item, Paragraph):
            text = normalized_text(item.text)
            if not text:
                continue
            marker = MARKER_RE.match(text)
            style_name = (item.style.name or "") if item.style else ""
            bold = style_name.lower().startswith("heading") or (
                item.runs and all((r.bold is True) for r in item.runs if r.text.strip())
            )
            if text.startswith("【注释】"):
                annotation_run = True
            elif marker or bold:
                annotation_run = False
            add_text_block(
                blocks,
                component_no,
                text,
                heading=bool(bold and not marker),
                role="editorial_note" if annotation_run else None,
            )
        else:
            annotation_run = False
            rows = [[normalized_text(cell.text) for cell in row.cells] for row in item.rows]
            rows = [row for row in rows if any(row)]
            if rows:
                seq = len(blocks) + 1
                table_text = " ".join(cell for row in rows for cell in row)
                blocks.append(
                    {
                        "block_id": f"GN-{component_no}-{seq:05d}",
                        "type": "table",
                        "role": "mixed_annotation" if "【注释】" in table_text else "formal_text",
                        "rows": rows,
                        "source_locator": f"block:{seq}",
                    }
                )
    return blocks


def build() -> dict:
    root = find_604_root()
    registry = root / "meta" / "registries" / "master-register.csv"
    with registry.open(encoding="utf-8", newline="") as handle:
        masters = {row["master_id"]: row for row in csv.DictReader(handle)}

    output_components = []
    for master_id, component_no, title, condition in COMPONENTS:
        row = masters[master_id]
        path = Path(row["file_path"])
        if path.suffix.lower() == ".doc":
            blocks = docbook_blocks(path, component_no)
            extractor = "antiword-docbook"
        elif path.suffix.lower() == ".docx":
            blocks = docx_blocks(path, component_no)
            extractor = "python-docx"
        else:
            raise ValueError(f"Unsupported master type: {path}")
        counts = Counter(b["role"] for b in blocks)
        for block in blocks:
            block["source_id"] = row["source_id"]
            block["source_version"] = row["version"]
        output_components.append(
            {
                "component_id": master_id,
                "component_no": component_no,
                "title": title,
                "source_id": row["source_id"],
                "version": row["version"],
                "sha256": row["sha256"],
                "condition": condition,
                "extractor": extractor,
                "stats": {"blocks": len(blocks), **dict(sorted(counts.items()))},
                "blocks": blocks,
            }
        )
    return {
        "schema_version": "general-note-masters/1",
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "source_registry": str(registry),
        "cleaning_policy": {
            "auto_remove_roles": ["editorial_note"],
            "review_roles": ["mixed_annotation", "coordination_item", "optional_clause", "designer_prompt", "example_text", "project_placeholder"],
            "mixed_annotation_policy": "withhold_whole_mixed_block_and_require_manual_structural_split",
            "unknown_component_policy": "withhold_and_require_review",
        },
        "components": output_components,
    }


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    payload = build()
    data = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    OUTPUT.write_text("window.GN7_MASTER_DATA=" + data + ";\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "output": str(OUTPUT),
                "bytes": OUTPUT.stat().st_size,
                "components": len(payload["components"]),
                "blocks": sum(c["stats"]["blocks"] for c in payload["components"]),
                "editorial_notes": sum(c["stats"].get("editorial_note", 0) for c in payload["components"]),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
