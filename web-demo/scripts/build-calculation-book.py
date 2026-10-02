#!/usr/bin/env python3
"""Read calculation-book inputs and build a local A3 Word deliverable."""

from __future__ import annotations

import argparse
import base64
import json
import math
import re
import shutil
import sys
import uuid
from pathlib import Path

from docx import Document
from docx.enum.section import WD_ORIENT, WD_SECTION
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Mm, Pt
from openpyxl import load_workbook
from openpyxl.utils import get_column_letter


WORKBOOKS = {
    "jump-column": {"pattern": "*跃层柱*.xlsx", "label": "跃层柱计算长度分析"},
    "stair": {"pattern": "*楼梯构件库计算表*.xlsm", "label": "楼梯构件库计算表"},
}
SECTION_TITLES = ["计算书目录", "上部结构", "基础", "其他（需要自行补充）"]
SECTION_NUMERALS = ["一", "二", "三", "四"]


def fail(message: str, code: int = 1) -> None:
    print(json.dumps({"error": message}, ensure_ascii=False), file=sys.stderr)
    raise SystemExit(code)


def clean_text(value) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def find_one(source_dir: Path, pattern: str) -> Path | None:
    matches = sorted(source_dir.glob(pattern))
    return matches[0] if matches else None


def sources(source_dir: Path) -> dict[str, Path | None]:
    result = {
        "cover": find_one(source_dir, "*计算书封面*.DOC"),
        "catalog": find_one(source_dir, "*结构计算书内容*.docx"),
        "column": find_one(source_dir, "*穿层柱计算书*.docx"),
    }
    for key, spec in WORKBOOKS.items():
        result[key] = find_one(source_dir, spec["pattern"])
    return result


def read_catalog_sections(path: Path) -> list[dict]:
    document = Document(path)
    lines = [
        clean_text(paragraph.text)
        for paragraph in document.paragraphs
        if clean_text(paragraph.text) and clean_text(paragraph.text) != "结构计算书内容"
    ]
    sections = [{"title": title, "items": []} for title in SECTION_TITLES]
    current = 0
    for line in lines:
        heading = re.match(r"^([一二三四])[、.](.*)", line)
        if heading:
            current = SECTION_NUMERALS.index(heading.group(1))
            sections[current]["title"] = heading.group(2).strip()
        else:
            sections[current]["items"].append(line)
    return sections


def normalize_sections(value) -> list[dict]:
    source = value if isinstance(value, list) else []
    result = []
    for index, title in enumerate(SECTION_TITLES):
        raw_items = source[index].get("items", []) if index < len(source) and isinstance(source[index], dict) else []
        items = [clean_text(item) for item in raw_items if clean_text(item)][:80]
        actual_title = clean_text(source[index].get("title")) if index < len(source) and isinstance(source[index], dict) else ""
        result.append({"title": actual_title or title, "items": items})
    return result


def workbook_manifest(source_dir: Path) -> list[dict]:
    src = sources(source_dir)
    result = []
    for key, spec in WORKBOOKS.items():
        path = src.get(key)
        if not path:
            continue
        workbook = load_workbook(path, read_only=True, data_only=False, keep_vba=path.suffix.lower() == ".xlsm")
        sheets = []
        for sheet in workbook.worksheets:
            if sheet.sheet_state != "visible":
                continue
            sheets.append({"name": sheet.title, "dimension": sheet.calculate_dimension()})
        result.append({"key": key, "label": spec["label"], "file": path.name, "sheets": sheets})
        workbook.close()
    return result


def status_payload(source_dir: Path) -> dict:
    src = sources(source_dir)
    required = ["cover", "catalog", "column"]
    missing = [key for key in required if not src.get(key)]
    sections = read_catalog_sections(src["catalog"]) if src.get("catalog") else normalize_sections([])
    return {
        "ready": not missing,
        "missing": missing,
        "word_count": sum(1 for key in required if src.get(key)),
        "sections": sections,
        "templates": {
            "cover": src["cover"].name if src.get("cover") else None,
            "catalog": src["catalog"].name if src.get("catalog") else None,
        },
        "workbooks": workbook_manifest(source_dir),
    }


def workbook_path(source_dir: Path, key: str) -> Path:
    if key not in WORKBOOKS:
        fail("未知工作簿。")
    path = find_one(source_dir, WORKBOOKS[key]["pattern"])
    if not path:
        fail("未找到所选工作簿。")
    return path


def displayed_region(key: str, sheet) -> tuple[int, int, int, int]:
    if key == "jump-column":
        return 1, 10, 1, 10
    min_row = max(1, sheet.min_row)
    min_col = max(1, sheet.min_column)
    return min_row, min(min_row + 39, sheet.max_row), min_col, min(min_col + 19, sheet.max_column)


def cell_display(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float):
        return f"{value:.6g}"
    return str(value)


def read_workbook(source_dir: Path, key: str, sheet_name: str) -> dict:
    path = workbook_path(source_dir, key)
    keep_vba = path.suffix.lower() == ".xlsm"
    formulas = load_workbook(path, data_only=False, read_only=False, keep_vba=keep_vba)
    values = load_workbook(path, data_only=True, read_only=False, keep_vba=keep_vba)
    if sheet_name not in formulas.sheetnames:
        fail("所选工作表不存在。")
    sheet = formulas[sheet_name]
    value_sheet = values[sheet_name]
    min_row, max_row, min_col, max_col = displayed_region(key, sheet)
    rows = []
    formula_count = 0
    has_custom = False
    for row_index in range(min_row, max_row + 1):
        cells = []
        for column_index in range(min_col, max_col + 1):
            cell = sheet.cell(row_index, column_index)
            cached = value_sheet.cell(row_index, column_index).value
            formula = cell.value if isinstance(cell.value, str) and cell.value.startswith("=") else ""
            if formula:
                formula_count += 1
                has_custom = has_custom or bool(re.search(r"=\s*(getslabas|getslabbar)\s*\(", formula, re.I))
            display = cell_display(cached if formula and cached is not None else cell.value)
            cells.append({
                "coordinate": cell.coordinate,
                "display": display,
                "formula": formula,
                "editable": not bool(formula),
            })
        rows.append({"row": row_index, "cells": cells})
    formulas.close()
    values.close()
    return {
        "workbook": key,
        "workbook_label": WORKBOOKS[key]["label"],
        "sheet": sheet_name,
        "used_range": f"{get_column_letter(min_col)}{min_row}:{get_column_letter(max_col)}{max_row}",
        "min_row": min_row,
        "max_row": max_row,
        "min_col": min_col,
        "max_col": max_col,
        "column_count": max_col - min_col + 1,
        "formula_count": formula_count,
        "has_custom_formulas": has_custom,
        "rows": rows,
    }


def set_run_font(run, name: str, size: float, bold: bool | None = None) -> None:
    run.font.name = name
    run._element.get_or_add_rPr().rFonts.set(qn("w:eastAsia"), name)
    run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold


def configure_a3_two_columns(section) -> None:
    section.orientation = WD_ORIENT.LANDSCAPE
    section.page_width = Mm(420)
    section.page_height = Mm(297)
    section.top_margin = Mm(14)
    section.bottom_margin = Mm(14)
    section.left_margin = Mm(16)
    section.right_margin = Mm(16)
    sect_pr = section._sectPr
    cols = sect_pr.find(qn("w:cols"))
    if cols is None:
        cols = OxmlElement("w:cols")
        sect_pr.append(cols)
    cols.set(qn("w:num"), "2")
    cols.set(qn("w:space"), "650")
    cols.set(qn("w:equalWidth"), "1")


def configure_a3_single_page(section) -> None:
    section.orientation = WD_ORIENT.LANDSCAPE
    section.page_width = Mm(420)
    section.page_height = Mm(297)
    section.top_margin = Mm(0)
    section.bottom_margin = Mm(0)
    section.left_margin = Mm(0)
    section.right_margin = Mm(0)
    cols = section._sectPr.find(qn("w:cols"))
    if cols is None:
        cols = OxmlElement("w:cols")
        section._sectPr.append(cols)
    cols.set(qn("w:num"), "1")


def configure_catalog_section(section) -> None:
    section.orientation = WD_ORIENT.LANDSCAPE
    section.page_width = Mm(420)
    section.page_height = Mm(297)
    section.top_margin = Mm(31.75)
    section.bottom_margin = Mm(31.75)
    section.left_margin = Mm(25.4)
    section.right_margin = Mm(25.4)
    cols = section._sectPr.find(qn("w:cols"))
    if cols is None:
        cols = OxmlElement("w:cols")
        section._sectPr.append(cols)
    cols.set(qn("w:num"), "2")
    cols.set(qn("w:space"), "425")


def set_table_borders(table) -> None:
    table_properties = table._tbl.tblPr
    borders = table_properties.find(qn("w:tblBorders"))
    if borders is None:
        borders = OxmlElement("w:tblBorders")
        table_properties.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        element = OxmlElement(f"w:{edge}")
        element.set(qn("w:val"), "single")
        element.set(qn("w:sz"), "4")
        element.set(qn("w:color"), "B7C0CA")
        borders.append(element)


def add_directory_page(document: Document, sections: list[dict]) -> None:
    section = document.add_section(WD_SECTION.NEW_PAGE)
    configure_catalog_section(section)
    heading = document.add_paragraph()
    heading.paragraph_format.space_before = Pt(0)
    heading.paragraph_format.space_after = Pt(5)
    set_run_font(heading.add_run("结构计算书内容"), "宋体", 11, True)
    for section_index, catalog_section in enumerate(sections):
        section_heading = document.add_paragraph()
        section_heading.paragraph_format.keep_with_next = bool(catalog_section["items"])
        section_heading.paragraph_format.space_before = Pt(3)
        section_heading.paragraph_format.space_after = Pt(1)
        section_heading.paragraph_format.line_spacing = 1.15
        set_run_font(
            section_heading.add_run(f"{SECTION_NUMERALS[section_index]}、{catalog_section['title']}"),
            "黑体", 11, True,
        )
        for item_index, title in enumerate(catalog_section["items"], 1):
            paragraph = document.add_paragraph()
            paragraph.paragraph_format.left_indent = Mm(7)
            paragraph.paragraph_format.first_line_indent = Mm(0)
            paragraph.paragraph_format.space_before = Pt(0)
            paragraph.paragraph_format.space_after = Pt(0)
            paragraph.paragraph_format.line_spacing = 1.12
            set_run_font(paragraph.add_run(f"{item_index}.  {title}"), "宋体", 10.5)


def parse_edit(value: str):
    text = str(value or "").strip()
    if not text:
        return ""
    try:
        return float(text) if any(char in text for char in ".eE") else int(text)
    except ValueError:
        return text


def workbook_values_with_edits(source_dir: Path, block: dict) -> tuple[dict, list[list[str]]]:
    key = clean_text(block.get("workbook"))
    sheet_name = clean_text(block.get("sheet"))
    data = read_workbook(source_dir, key, sheet_name)
    edits = {str(cell).upper(): parse_edit(value) for cell, value in (block.get("edits") or {}).items()}
    path = workbook_path(source_dir, key)
    workbook = load_workbook(path, data_only=True, read_only=False, keep_vba=path.suffix.lower() == ".xlsm")
    sheet = workbook[sheet_name]
    for coordinate, value in edits.items():
        sheet[coordinate] = value
    if key == "jump-column":
        def number(coordinate: str) -> float:
            value = edits.get(coordinate, sheet[coordinate].value)
            try:
                return float(value)
            except (TypeError, ValueError):
                return 0.0
        b2, b3, b4, b5, b7, b9 = (number(name) for name in ("B2", "B3", "B4", "B5", "B7", "B9"))
        if not all(math.isfinite(v) and v > 0 for v in (b2, b3, b4, b5, b7, b9)):
            fail("跃层柱计算输入必须为当前项目确认的正数，不能沿用空值或历史计算结果。")
        if b2 and b3 and b4 and b5 and b7:
            b6 = math.sqrt(math.pi * math.pi * 3 * 10**4 * (1 / 12) * b2 * b3**3 / (b4 * b5 * 1000)) / 1000
            sheet["B6"] = b6
            sheet["B8"] = b6 / b7
            sheet["B10"] = "满足" if sheet["B8"].value < b9 else "不满足"
    rows = []
    for row_index in range(data["min_row"], data["max_row"] + 1):
        row = []
        for col_index in range(data["min_col"], data["max_col"] + 1):
            coordinate = f"{get_column_letter(col_index)}{row_index}"
            value = edits.get(coordinate, sheet[coordinate].value)
            row.append(cell_display(value))
        rows.append(row)
    workbook.close()
    return data, rows


def add_excel_block(document: Document, source_dir: Path, block: dict) -> None:
    data, rows = workbook_values_with_edits(source_dir, block)
    heading = document.add_paragraph()
    heading.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_run_font(heading.add_run(f"{data['workbook_label']}｜{data['sheet']}"), "黑体", 12, True)
    max_columns = min(10, data["column_count"])
    display_rows = rows[:35]
    table = document.add_table(rows=1, cols=max_columns + 1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_table_borders(table)
    header = table.rows[0].cells
    header[0].text = "行"
    for index in range(max_columns):
        header[index + 1].text = get_column_letter(data["min_col"] + index)
    for row_offset, values in enumerate(display_rows):
        cells = table.add_row().cells
        cells[0].text = str(data["min_row"] + row_offset)
        for index in range(max_columns):
            cells[index + 1].text = values[index] if index < len(values) else ""
    for row in table.rows:
        for cell in row.cells:
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            for paragraph in cell.paragraphs:
                paragraph.paragraph_format.space_after = Pt(0)
                for run in paragraph.runs:
                    set_run_font(run, "宋体", 6.5)
    note = document.add_paragraph()
    note.paragraph_format.space_after = Pt(5)
    set_run_font(note.add_run("原始 Excel 只读；本页记录网页编辑值。宏表自定义公式沿用工作簿已有计算结果。"), "宋体", 7)


def decode_out(file: dict) -> tuple[str, str]:
    name = Path(clean_text(file.get("name"))).name
    raw = base64.b64decode(file.get("content_base64") or "", validate=True)
    if len(raw) > 3 * 1024 * 1024:
        fail(f"{name} 文件过大。")
    for encoding in ("utf-8-sig", "gb18030", "gbk"):
        try:
            return name, raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return name, raw.decode("latin1")


def add_out_file(document: Document, file: dict) -> None:
    name, content = decode_out(file)
    heading = document.add_paragraph()
    heading.paragraph_format.page_break_before = True
    set_run_font(heading.add_run(name.upper()), "黑体", 11, True)
    for line in content.splitlines():
        paragraph = document.add_paragraph()
        paragraph.paragraph_format.space_before = Pt(0)
        paragraph.paragraph_format.space_after = Pt(0)
        paragraph.paragraph_format.line_spacing = 1
        set_run_font(paragraph.add_run(line or " "), "Courier New", 6.2)


def safe_filename(value: str) -> str:
    return re.sub(r'[\\/:*?"<>|]+', "_", value).strip(" .") or "结构计算书"


def apply_current_cover(document: Document, payload: dict) -> None:
    """Retain the template layout while replacing historical project facts in the derived copy."""
    replacements = {
        "26-AD-026": clean_text(payload.get("project_code")) or "【待填写项目编号】",
        "江南大学(江阴校区)二期科研创新组团": clean_text(payload.get("project_name")) or "【待填写项目名称】",
        "施工图": clean_text(payload.get("stage")) or "【待填写阶段】",
        "63": "【待填写子项编号】", "媒体融合与创新创业学院": "【待填写子项名称】",
        "结构": clean_text(payload.get("discipline")) or "结构",
        "基础及上部结构": "【按本次目录确认】",
        "周汉杰": "【待审核】", "刘浩晋": "【待校对】", "张涛冯锋": "【待填写专业负责人】",
        "张伊楚": "【待填写设计人】", "2026-07-10": "【待填写日期】",
        "V01": "【待填写版本】", "施工图出图": "工作草案，待复核",
        "盈建科建筑结构设计软件": "【待填写计算软件】", "7.1.0": "【待填写软件版本】",
        "同济大学建筑设计研究院(集团)有限公司": clean_text(payload.get("company")) or "【待填写设计单位】",
        "TONGJIARCHITECTURALDESIGN(GROUP)CO.,LTD": "",
    }
    namespace = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    for paragraph in document.element.iter(namespace + "p"):
        texts = list(paragraph.iter(namespace + "t"))
        value = re.sub(r"\s+", "", "".join(node.text or "" for node in texts))
        if value in replacements and texts:
            texts[0].text = replacements[value]
            for node in texts[1:]:
                node.text = ""


def build(source_dir: Path, output_dir: Path, payload: dict) -> dict:
    src = sources(source_dir)
    if not src.get("cover") or not src.get("catalog"):
        fail("计算书封面或目录母件缺失。")
    sections = normalize_sections(payload.get("sections"))
    if not any(section["items"] for section in sections):
        fail("计算书目录至少需要一个小标题。")
    assets_dir = Path(__file__).resolve().parents[1] / "assets" / "calculation-book"
    cover_reference = assets_dir / "cover-reference.docx"
    if not cover_reference.exists():
        fail("封面 Word 母件转换副本缺失。")
    output_dir.mkdir(parents=True, exist_ok=True)
    project_name = clean_text(payload.get("project_name")) or "待填写项目"
    filename = f"{safe_filename(project_name)}_结构计算书_A3.docx"
    output_path = output_dir / f"{uuid.uuid4().hex}_{filename}"
    shutil.copy2(cover_reference, output_path)
    document = Document(output_path)
    apply_current_cover(document, payload)
    add_directory_page(document, sections)
    document.core_properties.title = f"{project_name} 结构计算书"
    document.core_properties.subject = "A3 结构计算书"
    document.core_properties.comments = (
        "来源：QS-324计算书封面、结构计算书内容母件、用户上传OUT及所选Excel；"
        "状态：已人工确认；原始输入只读。"
    )
    excel_blocks = payload.get("excel_blocks") if isinstance(payload.get("excel_blocks"), list) else []
    out_files = payload.get("out_files") if isinstance(payload.get("out_files"), list) else []
    if excel_blocks or out_files:
        section = document.add_section(WD_SECTION.NEW_PAGE)
        configure_a3_two_columns(section)
        for block in excel_blocks[:4]:
            add_excel_block(document, source_dir, block)
        for file in out_files[:3]:
            add_out_file(document, file)
    document.save(output_path)
    return {"path": str(output_path), "filename": filename}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--catalog", metavar="SOURCE_DIR")
    mode.add_argument("--workbook", metavar="SOURCE_DIR")
    mode.add_argument("--build", metavar="SOURCE_DIR")
    parser.add_argument("--workbook-key")
    parser.add_argument("--sheet")
    parser.add_argument("--output-dir")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.catalog:
        source_dir = Path(args.catalog)
        if not source_dir.is_dir():
            fail("计算书输入目录不存在。")
        print(json.dumps(status_payload(source_dir), ensure_ascii=False))
        return
    if args.workbook:
        source_dir = Path(args.workbook)
        if not source_dir.is_dir():
            fail("计算书输入目录不存在。")
        print(json.dumps(read_workbook(source_dir, args.workbook_key or "", args.sheet or ""), ensure_ascii=False))
        return
    source_dir = Path(args.build)
    output_dir = Path(args.output_dir or ".")
    try:
        payload = json.load(sys.stdin)
    except Exception:
        fail("计算书生成参数格式无效。")
    print(json.dumps(build(source_dir, output_dir, payload), ensure_ascii=False))


if __name__ == "__main__":
    main()
