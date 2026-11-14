"""Read-only DOCX sample structure and format comparison; never adopt project values."""
from __future__ import annotations
import argparse
from collections import Counter
import hashlib
import importlib.util
import json
from pathlib import Path
import posixpath
import re
import sys
from zipfile import ZipFile
from lxml import etree as E

ROOT = Path(__file__).resolve().parents[3]
READER = ROOT / 'server/word-source.py'
spec = importlib.util.spec_from_file_location('workbench_word_source', READER)
reader = importlib.util.module_from_spec(spec)
previous_bytecode = sys.dont_write_bytecode
try:
    sys.dont_write_bytecode = True
    spec.loader.exec_module(reader)
finally:
    sys.dont_write_bytecode = previous_bytecode
SPECIAL = re.compile(r'隔震|减震|消能|超限|高层|装配式|人防|钢结构|预应力')
NUMBER = re.compile(r'^\s*(?:第[一二三四五六七八九十百\d]+章\s*|\d+(?:[.．]\d+)*[.、．]?\s*)')


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def label(value):
    return re.sub(r'\s+', '', NUMBER.sub('', value)).strip('：:')


def caption_label(value):
    return re.sub(r'\s+', '', re.sub(r'^[图表照片]+\s*[\d.．\-—]+\s*', '', value)).strip('：:')


def attrs(element):
    return {} if element is None else {E.QName(k).localname: v for k, v in element.attrib.items()}


def shape(element):
    if element is None:
        return None
    return {'tag': E.QName(element).localname, 'attrs': attrs(element), 'children': [shape(c) for c in element]}


def extract(path, source_name=''):
    """Return observed requirements, with OOXML locations, never body values/images."""
    path = Path(path).resolve()
    before = digest(path)
    raw = reader.extract(path)  # Existing heading inheritance, table merges and ordered reading.
    source_id = 'docx:' + before
    with ZipFile(path) as package:
        relationships = reader.parse(package.read('_rels/.rels'))
        part = next(x.get('Target', '').lstrip('/') for x in relationships
                    if x.get('Type', '').endswith('/officeDocument') and x.get('TargetMode') != 'External')
        document = reader.parse(package.read(part))
        w = E.QName(document).namespace
        ns = {'w': w}
        q = lambda name: '{' + w + '}' + name
        body = document.find('w:body', ns)
        blocks = list(body)
        text = lambda el: ''.join(el.xpath('.//w:t[not(ancestor::w:del)]/text()', namespaces=ns))
        styles_part = posixpath.join(posixpath.dirname(part), 'styles.xml')
        styles_root = reader.parse(package.read(styles_part)) if styles_part in package.namelist() else E.Element('styles')
        styles = {s.get(q('styleId')): s for s in styles_root.findall('w:style', ns)}
        defaults = styles_root.find('w:docDefaults', ns)

        def paragraph_format(p):
            pr = p.find('w:pPr', ns)
            sid = p.find('w:pPr/w:pStyle', ns)
            key = sid.get(q('val')) if sid is not None else next((k for k, s in styles.items() if s.get(q('type')) == 'paragraph' and s.get(q('default')) == '1'), None)
            chain, seen = [], set()
            while key and key in styles and key not in seen:
                seen.add(key); chain.insert(0, styles[key])
                base = styles[key].find('w:basedOn', ns)
                key = base.get(q('val')) if base is not None else None
            pformat, rformat = {}, {}

            def merge(target, parent, allowed):
                if parent is not None:
                    for child in parent:
                        name = E.QName(child).localname
                        if name in allowed:
                            value = attrs(child)
                            if name == 'rFonts':
                                value.pop('hint', None)  # Script hint is not a font family/size requirement.
                            target[name] = {**target.get(name, {}), **value}
            pkeys = {'jc', 'spacing', 'ind', 'keepNext', 'keepLines', 'pageBreakBefore'}
            rkeys = {'rFonts', 'sz', 'szCs', 'b', 'i'}
            if defaults is not None:
                merge(pformat, defaults.find('w:pPrDefault/w:pPr', ns), pkeys)
                merge(rformat, defaults.find('w:rPrDefault/w:rPr', ns), rkeys)
            for style in chain:
                merge(pformat, style.find('w:pPr', ns), pkeys)
                merge(rformat, style.find('w:rPr', ns), rkeys)
            merge(pformat, pr, pkeys)
            # Paragraph-mark rPr does not override the text runs in Word.
            runs = []
            for run in p.findall('w:r', ns):
                if not text(run).strip():
                    continue
                values = {k: dict(v) for k, v in rformat.items()}
                merge(values, run.find('w:rPr', ns), rkeys)
                if values not in runs:
                    runs.append(values)
            return {'paragraph': pformat, 'runs': sorted(runs, key=lambda v: json.dumps(v, sort_keys=True))}

        requirements, heading_stack = [], []
        paragraph_index = table_index = 0
        warnings = list(raw.get('warnings', []))
        excluded = []

        def locator(i, suffix=''):
            return {'part': part, 'xpath': f'/w:document/w:body/*[{i + 1}]' + suffix, 'body_index': i + 1}

        def add(kind, title, i, observed, *, match_key='', confidence='原文事实', location=None):
            context = [h['title'] for h in heading_stack]
            conditional = sorted(set(SPECIAL.findall('/'.join(context + [title]))))
            if re.search(r'[#＃]|连廊\d', '/'.join(context + [title])):
                conditional.append('样稿特定单体')
            item = {'id': f'{kind}-{len(requirements) + 1:03}', 'kind': kind, 'title': title,
                    'source_id': source_id, 'locator': location or locator(i), 'section': context,
                    'scope': 'applicability_unknown' if conditional else 'sample_only',
                    'conditions': conditional, 'mandatory': False,
                    'statement_type': confidence, 'requirement_status': '待采用的样稿结构或格式参考',
                    'match_key': match_key, 'observed': observed}
            requirements.append(item)
            return item

        def nearby_caption(index, kind):
            candidates = range(index - 1, max(-1, index - 4), -1) if kind == '表' else range(index + 1, min(len(blocks), index + 4))
            for j in candidates:
                node = blocks[j]
                if node.tag != q('p'):
                    break
                value = text(node).strip()
                if re.match(r'^' + kind + r'\s*\d', value):
                    return value, locator(j)
                if value:
                    break
            return '', None

        for i, block in enumerate(blocks):
            value = text(block).strip()
            if block.tag == q('p') and value:
                meta = raw['paragraphMeta'][paragraph_index]
                paragraph_index += 1
                level = meta.get('headingLevel')
                method = 'Word outline/style'
                numeric = re.match(r'^(\d+(?:\.\d+)*)(?:[.、]?\s+)\S', value)
                if level is None and numeric and len(value) < 90:
                    level = numeric.group(1).count('.')
                    method = 'numbered paragraph inference'
                if level is not None and (len(value) > 70 or re.search(r'[。；，;]', value)):
                    excluded.append({'kind': 'heading_candidate', 'locator': locator(i), 'reason': '长句或叙述句沿用标题样式，不作为可复用章节；请按原定位复核'})
                    level = None
                style_id = block.find('w:pPr/w:pStyle', ns)
                is_toc = style_id is not None and re.match(r'(?i)toc', style_id.get(q('val'), ''))
                if level is not None and not is_toc and not re.match(r'^[图表]\s*\d', value):
                    while heading_stack and heading_stack[-1]['level'] >= level:
                        heading_stack.pop()
                    is_title = bool(re.match(r'^第[一二三四五六七八九十百\d]+章', value))
                    path_key = ('document-title:' if is_title else '') + '/'.join([label(h['title']) for h in heading_stack] + [label(value)])
                    add('heading', value, i, {'level': level + 1, 'detection': method, 'format': paragraph_format(block)}, match_key=path_key,
                        confidence='AI推断' if method.endswith('inference') else '原文事实')
                    if not is_title:
                        heading_stack.append({'level': level, 'title': value})
            if block.tag == q('tbl'):
                meta = raw['tableMeta'][table_index]
                table_index += 1
                caption, caption_loc = nearby_caption(i, '表')
                # Geometry only: no sample project values, design parameters or conclusions.
                rows = [{'header': row['header'], 'cells': [{k: c[k] for k in ('column', 'span', 'verticalMerge')} for c in row['cells']]} for row in meta['rows']]
                section_key = '/'.join(label(h['title']) for h in heading_stack)
                add('table', caption or f'无题注表格 {table_index}', i,
                    {'caption_locator': caption_loc, 'grid_twips': [int(x.get(q('w'), 0)) for x in block.findall('w:tblGrid/w:gridCol', ns)],
                     'table_properties': shape(block.find('w:tblPr', ns)), 'rows': rows,
                     'row_count_policy': '样稿观察值，项目数据行允许变化，不自动判缺漏'},
                    match_key=section_key + '|' + caption_label(caption) if caption else '')
            # Keep unsupported EMF/VML slots as locations; never silently lose them because preview decoding failed.
            images = block.xpath('.//*[local-name()="drawing"] | .//*[local-name()="imagedata"]')
            for index, image in enumerate(images):
                caption, caption_loc = nearby_caption(i, '图')
                extent = next(iter(image.xpath('.//*[local-name()="extent"]')), None)
                ids = image.xpath('.//@*[local-name()="embed" or local-name()="link"]')
                if E.QName(image).localname == 'imagedata':
                    ids = [v for k, v in image.attrib.items() if E.QName(k).localname == 'id']
                if not ids or image.xpath('ancestor::w:del', namespaces=ns):
                    excluded.append({'kind': 'drawing', 'locator': locator(i), 'reason': '无图像关系的绘图对象或修订删除图像，不计作内嵌图片图位'})
                    continue
                # Prefer one supported branch of AlternateContent, never count its fallback twice.
                if image.xpath('ancestor::*[local-name()="Fallback"]/preceding-sibling::*[local-name()="Choice"]//*[local-name()="blip"]'):
                    continue
                localname = E.QName(image).localname
                same_kind_index = sum(E.QName(n).localname == localname for n in images[:index + 1])
                image_location = locator(i)
                image_location['xpath'] = f'({image_location["xpath"]}//*[local-name()="{localname}"])[{same_kind_index}]'
                section_key = '/'.join(label(h['title']) for h in heading_stack)
                add('image', caption or '无题注图位', i,
                    {'caption_locator': caption_loc, 'extent_emu': attrs(extent), 'relationship_ids': ids,
                     'content_policy': '只比较图位和尺寸；不复制或要求历史工程图片内容'},
                    match_key=section_key + '|' + caption_label(caption) if caption else '',
                    location=image_location)
            sections = block.findall('w:pPr/w:sectPr', ns) if block.tag == q('p') else [block] if block.tag == q('sectPr') else []
            for section in sections:
                add('page', '页面与分栏', i, {name: shape(section.find('w:' + name, ns)) for name in ('pgSz', 'pgMar', 'cols', 'type')})
        if body.findall('w:sdt', ns) or body.findall('w:customXml', ns):
            warnings.append('存在正文内容控件或 customXml 包装；本版未展开其章节/表格，不能据此认定完整。')
        if document.xpath('.//*[local-name()="altChunk"]'):
            warnings.append('存在 altChunk，未展开外部正文。')
    if digest(path) != before:
        raise RuntimeError('读取期间输入文件发生变化，请重新运行')
    return {'schema': 'sample-requirements/1', 'source': {'source_id': source_id, 'path': str(path), 'sha256': before, 'name': source_name or path.name},
            'reader': {'path': str(READER), 'sha256': digest(READER)}, 'requirements': requirements,
            'counts': dict(Counter(r['kind'] for r in requirements)), 'warnings': warnings, 'excluded_candidates': excluded,
            'boundaries': ['全部为样稿观察或结构推断，未自动成为所有项目必选要求', '不提取正文工程数值为参数，不判规范现行性或设计合格',
                           '参数到成果位置映射暂缓；历史项目内容不作为当前事实', 'XML位置不是Word页码；未检查页内溢出、字体替换、页眉页脚或实际分页']}


def compare(reference, actual):
    """Conservative exact context/caption matching; ambiguous items remain unassessed."""
    checks, used = [], set()
    for r in reference['requirements']:
        item = {'requirement_id': r['id'], 'kind': r['kind'], 'title': r['title'], 'source_id': r['source_id'],
                'source_locator': r['locator'], 'scope': r['scope'], 'mandatory': False}
        candidates = [a for a in actual['requirements'] if a['kind'] == r['kind'] and r['match_key'] and a['match_key'] == r['match_key']]
        if r['kind'] == 'page':
            refs = [x for x in reference['requirements'] if x['kind'] == 'page']
            pages = [x for x in actual['requirements'] if x['kind'] == 'page']
            candidates = pages if len(refs) == len(pages) == 1 else []
        if len(candidates) != 1:
            item.update(status='ambiguous' if len(candidates) > 1 else 'not_assessed' if not r['match_key'] and r['kind'] != 'heading' else 'not_found',
                        reason='同章同名项目不唯一，未自动选择' if len(candidates) > 1 else '无稳定匹配标识或存在多节，未按序号强行配对' if not r['match_key'] and r['kind'] != 'heading' else '未找到同章同名项目；改名、移章或未采用均可能，不能直接判漏项')
            if r['scope'] == 'applicability_unknown':
                item['status'] = 'applicability_unknown'
                item['reason'] = '样稿含专项条件，当前项目适用性未提供，不判必需或缺失'
            checks.append(item)
            continue
        a = candidates[0]; used.add(a['id'])
        item.update(actual_id=a['id'], actual_source_id=a['source_id'], actual_locator=a['locator'])
        if r['kind'] == 'heading':
            fields = ['level', 'format']
        elif r['kind'] == 'table':
            fields = ['grid_twips', 'table_properties']
            if len(r['observed']['rows']) == len(a['observed']['rows']):
                fields.append('rows')
            item['row_structure'] = {'reference_rows': len(r['observed']['rows']), 'actual_rows': len(a['observed']['rows']),
                                     'equal': r['observed']['rows'] == a['observed']['rows'], 'status': 'observed_only'}
        elif r['kind'] == 'image':
            fields = ['extent_emu']
        else:
            fields = ['pgSz', 'pgMar', 'cols', 'type']
        changes = [{'property': key, 'reference': r['observed'].get(key), 'actual': a['observed'].get(key)}
                   for key in fields if r['observed'].get(key) != a['observed'].get(key)]
        item.update(status='difference' if changes else 'same', differences=changes,
                    meaning='仅表示本次结构/格式属性比较，不表示内容完整或工程合格')
        checks.append(item)
    previous = None
    for check in checks:
        if 'actual_locator' not in check or check['kind'] != 'heading':
            continue
        position = check['actual_locator']['body_index']
        if previous and position < previous['position']:
            check['status'] = 'difference'
            check['differences'].append({'property': 'heading_order', 'reference': '位于 ' + previous['title'] + ' 之后', 'actual': '位于该标题之前'})
        previous = {'position': position, 'title': check['title']}
    return {'schema': 'sample-comparison/1', 'reference': reference['source'], 'actual': actual['source'], 'checks': checks,
            'counts': dict(Counter(c['status'] for c in checks)), 'extra_actual': [a['id'] for a in actual['requirements'] if a['id'] not in used],
            'warnings': list(dict.fromkeys(reference['warnings'] + actual['warnings'])), 'pass_rate': None,
            'excluded_checks': reference['boundaries']}


def report(result):
    status = {'same': '所查属性一致', 'difference': '格式差异', 'not_found': '未匹配到', 'not_assessed': '未自动比较', 'ambiguous': '匹配歧义', 'applicability_unknown': '专项适用性未定'}
    lines = ['# 已有样稿结构与格式对照', '', '本次只检查结构与格式；未提供当前项目内容，不检查参数对应关系，也不计算通过率。', '',
             f"样稿：{result['reference']['path']}", f"SHA256：{result['reference']['sha256']}", '',
             f"实际 Word：{result['actual']['path']}", f"SHA256：{result['actual']['sha256']}", '',
             '记录数量：' + '；'.join(f'{status[k]} {v} 项' for k, v in result['counts'].items()) + '。', '',
             '“未匹配到”可能源于改名、移章或不同适用范围，不等同于当前项目漏项。专项内容不自动列为必选。', '',
             '下表只列格式差异和未匹配项目；一致项、专项适用性未定和无稳定标识项保留在完整 JSON。', '',
             '| 检查项 | 结果 | 样稿定位 | 实际定位或说明 |', '|---|---|---|---|']
    for check in result['checks']:
        if check['status'] not in ('difference', 'not_found', 'ambiguous'):
            continue
        actual = check.get('actual_locator', {}).get('xpath', check.get('reason', ''))
        props = '、'.join({'format': '标题字体/段落属性', 'rows': '表格合并/行属性', 'grid_twips': '列宽', 'heading_order': '章节顺序'}.get(x['property'], x['property']) for x in check.get('differences', []))
        cells = [check['title'], status[check['status']] + ('：' + props if props else ''), check['source_locator']['xpath'], actual]
        lines.append('| ' + ' | '.join(str(c).replace('|', '\\|').replace('\n', ' ') for c in cells) + ' |')
    lines += ['', '标题属性差异可能仅涉及复杂文字字号 szCs，不等同于中文显示变化；需实际渲染才能判断视觉影响。', '',
              '全部值与来源定位见 comparison.json；结构清单见 requirements.json。', '', '未检查项：']
    lines += ['- ' + text for text in result['excluded_checks']]
    lines += ['- ' + text for text in result['warnings']]
    return '\n'.join(lines) + '\n'


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--sample', required=True, type=Path)
    cli.add_argument('--actual', type=Path)
    cli.add_argument('--output', required=True, type=Path)
    args = cli.parse_args()
    # New output directory prevents silent overwrites of evidence or source material.
    args.output.mkdir(parents=True, exist_ok=False)
    reference = extract(args.sample)
    (args.output / 'requirements.json').write_text(json.dumps(reference, ensure_ascii=False, indent=2), encoding='utf-8')
    if args.actual:
        actual = extract(args.actual)
        result = compare(reference, actual)
        (args.output / 'actual-structure.json').write_text(json.dumps(actual, ensure_ascii=False, indent=2), encoding='utf-8')
        (args.output / 'comparison.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        (args.output / '检查结果.md').write_text(report(result), encoding='utf-8')
    print(json.dumps({'output': str(args.output.resolve()), 'observed': reference['counts']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
