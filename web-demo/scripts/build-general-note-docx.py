#!/usr/bin/env python3
"""Build the project General Notes DOCX from the canonical Word component.

The source component is never modified.  The builder preserves every package
part except word/document.xml, so styles, multilevel numbering and page setup
remain those of the authoritative 604 master.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
import shutil
import tempfile
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

from lxml import etree


W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
W = f"{{{W_NS}}}"
NS = {"w": W_NS}


DEFAULTS = {
    "project_name": "云南旅游职业学院龙泉路校区提升改造项目（一期）",
    "project_code": "25-AD-037",
    "discipline": "结构 / 施工图",
    "project_location": "云南省昆明市龙泉路，云南旅游职业学院龙泉路校区内",
    "site_surround": "项目东侧为万彩城二期并邻龙泉路，南侧为华友之星大酒店与实力壹方城，西侧为东郡机动车检测站，北侧邻二环北路。",
    "struct_sys": "混凝土框架结构",
    "intensity": "8",
    "pga": "0.20g",
    "eq_group": "第三组",
    "site_class": "Ⅲ类",
    "tg": "0.65",
    "tg_rare": "0.70",
    "alpha_max": "多遇 0.16；设防 0.45；罕遇 0.90",
    "damping": "0.05",
    "seismic_cat": "重点设防类（乙类）",
    "safety_grade": "一级",
    "importance_factor": "1.1",
    "foundation_grade": "甲级",
    "foundation_safety": "一级 / 1.1",
    "pile_grade": "甲级",
    "anti_float_grade": "甲级",
    "geo_report_name": "云南旅游职业学院龙泉路校区提升改造项目（一期）岩土工程勘察报告（详细勘察）",
    "geo_report_unit": "建研地基基础工程有限责任公司",
    "geo_landform": "拟建场地位于云南旅游职业学院内，地形平坦开阔，处于昆明滇池断陷盆地西北侧，属丘陵缓坡地貌。场地现状地面高程为1906.42m～1911.11m，高差约4.69m。",
    "geo_strata": "拟建场地地基土自上而下主要为：①素填土；②含砾粉质黏土；②1黏土（软塑局部可塑）；③含砾粉质黏土；④全风化泥质砂岩；④1强风化泥质砂岩；④2中风化泥质砂岩。",
    "geo_water": "场地地下水类型为孔隙水（上层滞水）和基岩裂隙水。勘察钻孔均揭露地下水，稳定水位埋深为1.3m～5.3m，水位高程为1902.02m～1907.59m；雨季施工期间地下水对工程有一定影响，地下水总体向东南侧排泄。",
    "geo_surface_water": "勘察期间场地内未见地表水体。",
    "geo_corrosion": "场地环境类型为Ⅱ类。地下水和地表水对混凝土结构、钢筋混凝土结构中钢筋具微腐蚀性；主要土层对混凝土结构及钢筋混凝土结构中钢筋具微腐蚀性，对钢结构具弱腐蚀性。",
    "geo_site_effect": "场地土类型为中软土，建筑场地类别包括Ⅱ类和Ⅲ类；本工程抗震设计参数按统一技术措施取Ⅲ类场地。场地无可液化粉土、砂土；8度设防时②1黏土应考虑软土震陷影响。",
    "geo_hazard": "拟建场地10km范围内无全新世活动断裂通过；勘察未发现岩溶、滑坡、危岩崩塌、泥石流、采空区及地面塌陷等不良地质作用。",
    "geo_obstacle": "场地既有建（构）筑物、地下管线及其他地下障碍物应以建设单位提供的物探和现状资料为准；施工前应复核并采取保护措施。",
    "geo_stability": "场地总体稳定，适宜本工程建设。①素填土和②1黏土不宜直接作为基础持力层。",
    "geo_risk": "填土固结沉降可能对桩基产生负摩阻力；基岩面起伏较大区段应结合勘察成果优化桩长，并验算嵌岩深度及倾斜岩面桩端抗滑移稳定性。",
}


SOIL_ROWS = [
    ["①素填土（稍密）", "—", "15", "5", "—", "—", "—"],
    ["②含砾粉质黏土（可塑局部硬塑）", "—", "30", "10", "150", "5.212", "—"],
    ["②1黏土（软塑局部可塑）", "—", "20", "5", "70", "3.550", "—"],
    ["③含砾粉质黏土（硬塑局部可塑）", "—", "32", "13", "160", "4.865", "—"],
    ["④全风化泥质砂岩", "—", "28", "14", "180", "5.015", "—"],
    ["④1强风化泥质砂岩", "—", "—", "—", "300", "—", "—"],
    ["④2中风化泥质砂岩", "—", "—", "—", "600", "—", "—"],
]

PILE_ROWS = [
    ["①素填土（稍密）", "—", "22", "—", "0.25", "—", "—"],
    ["②含砾粉质黏土（可塑局部硬塑）", "—", "70", "1200", "—", "5.212", "—"],
    ["②1黏土（软塑局部可塑）", "—", "40", "—", "—", "3.550", "—"],
    ["③含砾粉质黏土（硬塑局部可塑）", "—", "75", "1400", "—", "4.865", "—"],
    ["④全风化泥质砂岩", "—", "80", "1450", "—", "5.015", "—"],
    ["④1强风化泥质砂岩", "—", "160", "1800", "—", "—", "—"],
    ["④2中风化泥质砂岩", "—", "200", "2500", "—", "—", "—"],
]


LOAD_VALUES = {
    "住宅": ("1.0", "2.0", "2.0"),
    "办公楼": ("1.0", "2.5", "2.5"),
    "餐厅、会议室、阅览室、一般资料档案室": ("1.0", "3.0", "3.0"),
    "公共洗衣房": ("—", "3.5", "3.5"),
    "商店、展览厅": ("—", "4.0", "4.0"),
    "无固定座位的看台": ("—", "4.0", "4.0"),
    "健身房、演出舞台": ("—", "4.5", "4.5"),
    "舞厅": ("—", "4.5", "4.5"),
    "书库、档案库、储藏室（书架高度不超过2.5m）": ("—", "6.0", "6.0"),
    "密集柜书库": ("—", "12.0", "12.0"),
    "通风机房、电梯机房": ("—", "8.0", "8.0"),
    "餐厅的厨房": ("—", "4.0", "4.0"),
    "卫生间": ("—", "2.5", "2.5"),
    "宿舍、旅馆、……、走廊、门厅": ("—", "2.0", "2.0"),
    "办公楼、……、走廊、门厅": ("—", "3.0", "3.0"),
    "教学楼及其他可能出现人员密集的情况": ("—", "3.5", "3.5"),
    "多层住宅楼梯": ("—", "2.0", "2.0"),
    "高层住宅、公共建筑等其他楼梯": ("—", "3.5", "3.5"),
    "可能出现人员密集情况的阳台": ("—", "3.5", "3.5"),
    "其他阳台": ("—", "2.5", "2.5"),
    "轻型设备房[8]": ("—", "5.0", "/"),
    "中型设备机房[8]": ("—", "8.0", "/"),
    "重型设备机房[8]": ("—", "12.0", "/"),
    "不上人的屋面": ("—", "0.5", "0.5"),
    "上人的屋面": ("—", "2.0", "2.0"),
    "屋顶花园": ("—", "3.0", "3.0"),
}


def paragraph_text(p: etree._Element) -> str:
    return "".join(p.itertext())


def set_paragraph_text(p: etree._Element, value: str) -> None:
    p_pr = p.find(f"{W}pPr")
    first_run = p.find(f"{W}r")
    run_props = copy.deepcopy(first_run.find(f"{W}rPr")) if first_run is not None and first_run.find(f"{W}rPr") is not None else None
    for child in list(p):
        if child is not p_pr:
            p.remove(child)
    r = etree.Element(f"{W}r")
    if run_props is not None:
        r.append(run_props)
    chunks = str(value).split("\n")
    for index, chunk in enumerate(chunks):
        if index:
            r.append(etree.Element(f"{W}br"))
        t = etree.Element(f"{W}t")
        if chunk.startswith(" ") or chunk.endswith(" "):
            t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        t.text = chunk
        r.append(t)
    p.append(r)


def set_cell_text(cell: etree._Element, value: str) -> None:
    paragraphs = cell.xpath("./w:p", namespaces=NS)
    if paragraphs:
        set_paragraph_text(paragraphs[0], value)
        for p in paragraphs[1:]:
            cell.remove(p)
    else:
        p = etree.SubElement(cell, f"{W}p")
        set_paragraph_text(p, value)


def set_table_rows(table: etree._Element, rows: list[list[str]]) -> None:
    trs = table.xpath("./w:tr", namespaces=NS)
    if len(trs) < 2:
        raise ValueError("table has no data-row template")
    header = trs[0]
    template = trs[-1]
    for tr in trs[1:]:
        table.remove(tr)
    for values in rows:
        tr = copy.deepcopy(template)
        cells = tr.xpath("./w:tc", namespaces=NS)
        if len(cells) != len(values):
            raise ValueError(f"table column mismatch: {len(cells)} != {len(values)}")
        for cell, value in zip(cells, values):
            set_cell_text(cell, value)
        table.append(tr)
    if header.getparent() is None:
        table.insert(0, header)


def is_all_magenta(p: etree._Element) -> bool:
    visible_runs = []
    for run in p.xpath(".//w:r", namespaces=NS):
        text = "".join(run.itertext()).strip()
        if not text:
            continue
        visible_runs.append(run)
    if not visible_runs:
        return False
    colors = []
    for run in visible_runs:
        color = run.find("./w:rPr/w:color", NS)
        colors.append((color.get(f"{W}val") if color is not None else "").upper())
    return bool(colors) and all(value in {"FF3399", "F39", "FF00FF"} for value in colors)


def remove_annotations(root: etree._Element) -> tuple[int, int]:
    removed = 0
    stripped = 0
    for p in list(root.xpath("//w:p", namespaces=NS)):
        style = p.find("./w:pPr/w:pStyle", NS)
        style_id = style.get(f"{W}val") if style is not None else ""
        text = paragraph_text(p)
        if style_id == "a9" or is_all_magenta(p):
            parent = p.getparent()
            parent.remove(p)
            removed += 1
            if parent.tag == f"{W}tc" and not parent.xpath("./w:p", namespaces=NS):
                parent.append(etree.Element(f"{W}p"))
            continue
        if "【注释】" in text:
            cleaned = re.sub(r"[（(]?【注释】.*?[）)]", "", text)
            cleaned = re.sub(r"【注释】.*$", "", cleaned).rstrip()
            set_paragraph_text(p, cleaned)
            stripped += 1
    return removed, stripped


def replace_body_paragraph(root: etree._Element, starts_with: str, value: str) -> None:
    for p in root.find("w:body", NS).findall("w:p", NS):
        if paragraph_text(p).strip().startswith(starts_with):
            set_paragraph_text(p, value)
            return
    raise KeyError(f"paragraph not found: {starts_with}")


def normalize_site_class(value: str) -> str:
    text = value.replace(" ", "").replace("III", "Ⅲ").replace("II", "Ⅱ")
    return text if text.endswith("类") else f"{text}类"


def alpha_triplet(value: str) -> str:
    nums = re.findall(r"\d+(?:\.\d+)?", value)
    return "/".join(nums[-3:]) if len(nums) >= 3 else value


def build(source: Path, output: Path, params: dict[str, str]) -> dict[str, object]:
    with ZipFile(source) as zin:
        infos = zin.infolist()
        blobs = {info.filename: zin.read(info.filename) for info in infos}
    root = etree.fromstring(blobs["word/document.xml"])
    removed, stripped = remove_annotations(root)

    replace_body_paragraph(
        root,
        "工程建设地点：",
        f"工程建设地点：{params['project_location']}；周边情况：{params['site_surround']}",
    )
    replace_body_paragraph(
        root,
        "工程勘察成果文件：",
        f"工程勘察成果文件：名称：{params['geo_report_name']}；编制单位：{params['geo_report_unit']}；项目编号及编制日期以正式报告签章页为准；",
    )
    replace_body_paragraph(root, "地形地貌：", f"地形地貌：{params['geo_landform']}")
    replace_body_paragraph(root, "地基土的组成与特征：", f"地基土的组成与特征：{params['geo_strata']}")
    replace_body_paragraph(root, "【选项1，天然地基,土层】", "土层物理力学指标见下表：")
    replace_body_paragraph(root, "【选项3，桩基】", "桩基设计参数见下表：")
    replace_body_paragraph(root, "【示例】常年平均地下高水位", params["geo_water"])
    replace_body_paragraph(root, "【示例】本工程沿线地表水丰富", params["geo_surface_water"])
    replace_body_paragraph(root, "【示例】拟建场地在III类环境下", params["geo_corrosion"])
    replace_body_paragraph(root, "见第8节；", params["geo_site_effect"])
    replace_body_paragraph(root, "【示例】本次勘察未发现暗浜塘", params["geo_hazard"])
    replace_body_paragraph(root, "【示例】拟建场地内原为虹口区政府机关", params["geo_obstacle"])
    replace_body_paragraph(root, "此外，轨道交通10号线区间隧道", "施工前应结合物探、测量和现场复核成果，确认地下障碍物及周边建（构）筑物基础条件。")
    replace_body_paragraph(root, "XXX；", params["geo_stability"])
    replace_body_paragraph(root, "岩土工程风险提示：", f"岩土工程风险提示：{params['geo_risk']}")

    tables = root.xpath("//w:tbl", namespaces=NS)
    set_table_rows(tables[4], SOIL_ROWS)
    set_table_rows(tables[6], PILE_ROWS)

    grade_rows = tables[7].xpath("./w:tr", namespaces=NS)
    grade_updates = {
        2: params["safety_grade"],
        3: params["importance_factor"],
        6: params["foundation_grade"],
        7: params["foundation_safety"],
        8: params["pile_grade"],
        11: params["seismic_cat"],
        16: params["anti_float_grade"],
    }
    for row_index, value in grade_updates.items():
        cells = grade_rows[row_index].xpath("./w:tc", namespaces=NS)
        set_cell_text(cells[2], value)

    for tr in tables[8].xpath("./w:tr", namespaces=NS)[2:]:
        cells = tr.xpath("./w:tc", namespaces=NS)
        if len(cells) < 4:
            continue
        label = paragraph_text(cells[0]).strip()
        if label in LOAD_VALUES:
            for cell, value in zip(cells[1:4], LOAD_VALUES[label]):
                set_cell_text(cell, value)

    seismic_rows = tables[12].xpath("./w:tr", namespaces=NS)
    seismic_values = [
        (params["pga"], f"{params['tg']}s/{params['tg_rare']}s"),
        (normalize_site_class(params["site_class"]), params["damping"].split("（", 1)[0].strip()),
        (params["eq_group"], alpha_triplet(params["alpha_max"])),
    ]
    for tr, (left, right) in zip(seismic_rows, seismic_values):
        cells = tr.xpath("./w:tc", namespaces=NS)
        set_cell_text(cells[1], left)
        set_cell_text(cells[3], right)

    blobs["word/document.xml"] = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone="yes")
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(delete=False, suffix=".docx", dir=output.parent) as tmp:
        temp_path = Path(tmp.name)
    try:
        with ZipFile(temp_path, "w", ZIP_DEFLATED) as zout:
            for info in infos:
                clone = ZipInfo(info.filename, date_time=info.date_time)
                clone.compress_type = info.compress_type
                clone.comment = info.comment
                clone.extra = info.extra
                clone.create_system = info.create_system
                clone.external_attr = info.external_attr
                clone.internal_attr = info.internal_attr
                clone.flag_bits = info.flag_bits
                zout.writestr(clone, blobs[info.filename])
        shutil.move(str(temp_path), output)
    finally:
        temp_path.unlink(missing_ok=True)

    return {
        "source": str(source),
        "output": str(output),
        "removed_annotation_paragraphs": removed,
        "stripped_inline_annotations": stripped,
        "sha256": hashlib.sha256(output.read_bytes()).hexdigest().upper(),
        "size": output.stat().st_size,
    }


def main() -> None:
    repo = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=repo / "data" / "general-note-01-template.docx")
    parser.add_argument("--output", type=Path, default=repo / "outputs" / "general-note" / "云南旅游职业学院龙泉路校区提升改造项目（一期）_01通用说明_参数联动版.docx")
    parser.add_argument("--params", type=Path)
    args = parser.parse_args()
    params = dict(DEFAULTS)
    if args.params:
        params.update(json.loads(args.params.read_text(encoding="utf-8")))
    report = build(args.source.resolve(), args.output.resolve(), params)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
