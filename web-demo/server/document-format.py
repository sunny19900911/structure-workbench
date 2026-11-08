"""Read format signatures and bounded package structures. Never runs Office/macros.

The result describes the file format, not the Office release installed on a PC.
Only a successful downstream parser can establish that all requested content was read.
"""
from __future__ import annotations

import io
import json
import logging
import posixpath
import re
import struct
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

MAX_BYTES = 64 * 1024 * 1024
MAX_EXPANDED = 256 * 1024 * 1024
CFB_MAGIC = bytes.fromhex('d0cf11e0a1b11ae1')
END = 0xFFFFFFFE
FREE = 0xFFFFFFFF


class FormatError(ValueError):
    def __init__(self, message, code='INVALID_FILE', detected=None):
        super().__init__(message)
        self.code = code
        self.detected = detected


def xml(data):
    if len(data) > 16 * 1024 * 1024:
        raise FormatError('文档内部 XML 超过识别上限，请拆分文件后导入', 'RESOURCE_LIMIT')
    if re.search(br'<!\s*(?:DOCTYPE|ENTITY)', data, re.I):
        raise FormatError('文档含不支持的 XML 实体声明，请另存为标准 Office 文件')
    try:
        return ET.fromstring(data)
    except ET.ParseError as exc:
        raise FormatError('文档内部 XML 损坏，未导入任何内容') from exc


def result(family, fmt, version, container, **values):
    return dict(family=family, format=fmt, formatVersion=version, container=container,
                encrypted=False, macros=False, warnings=[], creator={}, **values)


CONTENT_TYPES = {
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml': ('word', 'docx'),
    'application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml': ('word', 'dotx'),
    'application/vnd.ms-word.document.macroEnabled.main+xml': ('word', 'docm'),
    'application/vnd.ms-word.template.macroEnabledTemplate.main+xml': ('word', 'dotm'),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml': ('excel', 'xlsx'),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml': ('excel', 'xltx'),
    'application/vnd.ms-excel.sheet.macroEnabled.main+xml': ('excel', 'xlsm'),
    'application/vnd.ms-excel.template.macroEnabled.main+xml': ('excel', 'xltm'),
    'application/vnd.ms-excel.sheet.binary.macroEnabled.main': ('excel', 'xlsb'),
    'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml': ('powerpoint', 'pptx'),
    'application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml': ('powerpoint', 'ppsx'),
    'application/vnd.openxmlformats-officedocument.presentationml.template.main+xml': ('powerpoint', 'potx'),
    'application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml': ('powerpoint', 'pptm'),
    'application/vnd.ms-powerpoint.slideshow.macroEnabled.main+xml': ('powerpoint', 'ppsm'),
    'application/vnd.ms-powerpoint.template.macroEnabled.main+xml': ('powerpoint', 'potm'),
}


def inspect_zip(data):
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            entries = z.infolist()
            if len(entries) > 20000 or sum(e.file_size for e in entries) > MAX_EXPANDED:
                raise FormatError('文档展开后超过识别上限，请拆分文件后导入', 'RESOURCE_LIMIT')
            names = [e.filename for e in entries]
            if len(names) != len(set(names)):
                raise FormatError('文档压缩包有重复内容项，不能确定应读取的版本')
            if any(e.flag_bits & 1 for e in entries):
                raise FormatError('文件已加密，请使用有权限的 Office 程序另存为未加密副本', 'ENCRYPTED_FILE')
            if any(n.startswith(('/', '\\')) or '..' in n.replace('\\', '/').split('/') for n in names):
                raise FormatError('文档压缩包含异常内部路径')
            if '[Content_Types].xml' not in names:
                raise FormatError('这是 ZIP 压缩包，不是可识别的 Word、Excel 或 PPT 文件', 'UNSUPPORTED_FORMAT')
            types = xml(z.read('[Content_Types].xml'))
            mains = [(e.get('PartName', '').lstrip('/'), CONTENT_TYPES[e.get('ContentType')])
                     for e in types if e.get('ContentType') in CONTENT_TYPES]
            if len(mains) != 1 or mains[0][0] not in names:
                raise FormatError('Office 文件的主文档缺失或类型不唯一，未导入任何内容')
            part, (family, fmt) = mains[0]
            if '_rels/.rels' not in names:
                raise FormatError('Office 文件缺少主文档关系，文件可能不完整')
            root_rels = xml(z.read('_rels/.rels'))
            document_rels = [e for e in root_rels if e.get('Type', '').endswith('/officeDocument')]
            if len(document_rels) != 1 or document_rels[0].get('TargetMode') == 'External' or posixpath.normpath(document_rels[0].get('Target', '').lstrip('/')) != part:
                raise FormatError('Office 文件主文档关系与声明不一致，未导入任何内容')
            strict = False
            if fmt != 'xlsb':
                main = xml(z.read(part))
                strict = main.tag.startswith('{http://purl.oclc.org/ooxml/')
                expected = {'word': 'document', 'excel': 'workbook', 'powerpoint': 'presentation'}[family]
                if main.tag.split('}')[-1] != expected:
                    raise FormatError('Office 文件正文类型与声明不一致')
            # Read every archive entry to check CRC and truncation, with a hard total limit.
            # Do not extract any paths or interpret embedded executables.
            count = 0
            for e in entries:
                with z.open(e) as f:
                    while chunk := f.read(512 * 1024):
                        count += len(chunk)
                        if count > MAX_EXPANDED:
                            raise FormatError('文档展开内容超过识别上限', 'RESOURCE_LIMIT')
            version = 'Office Open XML Strict' if strict else 'Office Open XML Transitional'
            if fmt == 'xlsb':
                version = 'Excel Binary Workbook（XLSB，2007 起）'
            out = result(family, fmt, version, 'ZIP/OPC', mainPart=part)
            out['macros'] = any(n.lower().endswith('vbaproject.bin') for n in names)
            if out['macros']:
                out['warnings'].append('文件含宏；工作台仅读取资料，不执行宏，也不重新计算宏结果。')
            if any(any(e.get('TargetMode') == 'External' for e in xml(z.read(n))) for n in names if n.lower().endswith('.rels')):
                out['warnings'].append('文件包含外部引用；离线读取不会更新外部数据。')
            if 'docProps/app.xml' in names:
                app = xml(z.read('docProps/app.xml'))
                props = {e.tag.split('}')[-1]: (e.text or '')[:120] for e in app}
                out['creator'] = {'application': props.get('Application', ''), 'version': props.get('AppVersion', ''), 'meaning': '文件自报的创建软件信息，不代表当前电脑安装版本'}
            return out
    except FormatError:
        raise
    except (zipfile.BadZipFile, RuntimeError, NotImplementedError, OSError, EOFError, KeyError) as exc:
        raise FormatError('Office 压缩包损坏、截断或压缩方式不受支持，未导入任何内容') from exc


class Compound:
    """Bounded CFB FAT/miniFAT reader, only for signature and encryption detection."""
    def __init__(self, data):
        self.data = data
        if len(data) < 512 or data[:8] != CFB_MAGIC:
            raise FormatError('旧版 Office 文件头损坏')
        major, order, shift, mini = struct.unpack_from('<HHHH', data, 26)
        if order != 0xFFFE or (major, shift) not in ((3, 9), (4, 12)) or mini != 6:
            raise FormatError('旧版 Office 复合文件版本不受支持', 'UNSUPPORTED_VERSION')
        self.size = 1 << shift
        self.major = major
        self.count = (len(data) - self.size) // self.size
        if self.count < 1:
            raise FormatError('旧版 Office 文件被截断')
        fat_count = self.u32(44)
        difat_count = self.u32(72)
        if fat_count > self.count or difat_count > self.count:
            raise FormatError('旧版 Office 文件扇区表损坏')
        difat = list(struct.unpack_from('<109I', data, 76))
        current = self.u32(68)
        seen = set()
        for _ in range(difat_count):
            if current in seen:
                raise FormatError('旧版 Office 文件扇区循环')
            seen.add(current)
            entries = struct.unpack('<' + 'I' * (self.size // 4), self.sector(current))
            difat.extend(entries[:-1])
            current = entries[-1]
        selected = [x for x in difat if x != FREE]
        if len(selected) != fat_count or len(set(selected)) != len(selected):
            raise FormatError('旧版 Office 文件分配表不完整')
        self.fat = []
        for index in selected:
            self.fat.extend(struct.unpack('<' + 'I' * (self.size // 4), self.sector(index)))
        directory = self.chain(self.u32(48), self.fat)
        self.entries = []
        for offset in range(0, len(directory), 128):
            entry = directory[offset:offset+128]
            if len(entry) != 128:
                raise FormatError('旧版 Office 目录被截断')
            length = struct.unpack_from('<H', entry, 64)[0]
            kind = entry[66]
            if kind and (length < 2 or length > 64 or length % 2):
                raise FormatError('旧版 Office 目录名称损坏')
            name = entry[:max(0, length-2)].decode('utf-16le', errors='strict') if kind else ''
            self.entries.append(dict(name=name, kind=kind, left=struct.unpack_from('<I', entry, 68)[0], right=struct.unpack_from('<I', entry, 72)[0], child=struct.unpack_from('<I', entry, 76)[0], start=struct.unpack_from('<I', entry, 116)[0], size=struct.unpack_from('<Q', entry, 120)[0]))
        if not self.entries or self.entries[0]['kind'] != 5:
            raise FormatError('旧版 Office 缺少根目录')
        self.root = self.entries[0]
        self.mini_stream = None
        self.mini_fat = None
        self.streams = {}
        self.names = set()
        visited = set()

        def walk(index, prefix=''):
            if index == FREE:
                return
            if index >= len(self.entries) or index in visited:
                raise FormatError('旧版 Office 目录结构损坏')
            visited.add(index)
            entry = self.entries[index]
            walk(entry['left'], prefix)
            path = prefix + entry['name']
            self.names.add(path)
            if entry['kind'] == 2:
                self.streams[path] = entry
            elif entry['kind'] == 1:
                walk(entry['child'], path + '/')
            else:
                raise FormatError('旧版 Office 目录项类型损坏')
            walk(entry['right'], prefix)
        try:
            walk(self.root['child'])
        except RecursionError as exc:
            raise FormatError('旧版 Office 目录层级异常') from exc

    def u32(self, offset):
        return struct.unpack_from('<I', self.data, offset)[0]

    def sector(self, index):
        if index >= self.count:
            raise FormatError('旧版 Office 文件被截断或存在越界扇区')
        start = (index + 1) * self.size
        return self.data[start:start+self.size]

    def chain(self, start, table, wanted=None, mini=False):
        if wanted == 0:
            return b''
        parts, seen = [], set()
        current = start
        while current != END:
            if current in seen or current >= len(table):
                raise FormatError('旧版 Office 文件流损坏')
            seen.add(current)
            if mini:
                part = self.mini_stream[current*64:(current+1)*64]
                if len(part) != 64:
                    raise FormatError('旧版 Office 小文件流被截断')
            else:
                part = self.sector(current)
            parts.append(part)
            if len(parts) * len(part) > MAX_BYTES:
                raise FormatError('旧版 Office 文件流超过读取上限', 'RESOURCE_LIMIT')
            current = table[current]
        data = b''.join(parts)
        if wanted is not None and len(data) < wanted:
            raise FormatError('旧版 Office 文件流长度不足')
        return data if wanted is None else data[:wanted]

    def read(self, name):
        entry = self.streams[name]
        if entry['size'] > MAX_BYTES:
            raise FormatError('旧版 Office 文件流超过读取上限', 'RESOURCE_LIMIT')
        if entry['size'] < self.u32(56):
            if self.mini_fat is None:
                self.mini_stream = self.chain(self.root['start'], self.fat, self.root['size'])
                raw = self.chain(self.u32(60), self.fat, self.u32(64)*self.size)
                self.mini_fat = list(struct.unpack('<'+'I'*(len(raw)//4), raw))
            return self.chain(entry['start'], self.mini_fat, entry['size'], mini=True)
        return self.chain(entry['start'], self.fat, entry['size'])


def inspect_cfb(data):
    cfb = Compound(data)
    if 'EncryptedPackage' in cfb.streams and 'EncryptionInfo' in cfb.streams:
        out = result('office', 'encrypted-ooxml', '加密 Office Open XML', 'CFB')
        out['encrypted'] = True
        return out
    families = [n for n in ('WordDocument', 'Workbook', 'Book', 'PowerPoint Document') if n in cfb.streams]
    if len(families) != 1:
        raise FormatError('复合文件不是可唯一识别的 Word、Excel 或 PPT 文档', 'UNSUPPORTED_FORMAT')
    name = families[0]
    body = cfb.read(name)
    if name == 'WordDocument':
        if len(body) < 32 or struct.unpack_from('<H', body)[0] != 0xA5EC:
            raise FormatError('DOC 的 WordDocument 标识损坏')
        nfib, flags = struct.unpack_from('<H', body, 2)[0], struct.unpack_from('<H', body, 10)[0]
        if nfib not in (0xC1,0xD9,0x101,0x10C,0x112):
            raise FormatError(f'已识别为 DOC，但当前不支持 nFib=0x{nfib:04X} 格式，请先另存为 DOCX 副本', 'UNSUPPORTED_VERSION')
        out = result('word', 'dot' if flags & 1 else 'doc', f'Word 97–2007 二进制保存格式（nFib=0x{nfib:04X}）', 'CFB')
        out['encrypted'] = bool(flags & 0x100)
        out['nFib'] = nfib
        table = '1Table' if flags & 0x200 else '0Table'
        if not out['encrypted'] and table not in cfb.streams:
            raise FormatError('DOC 缺少文字位置表，无法保证完整读取')
        if not out['encrypted']:
            # MS-DOC FibRgCswNew can supersede nFib. Preserve the actual code;
            # it still identifies a saved format, not the installed Word release.
            offset = 32
            for width in (2,4,8):
                if offset+2 > len(body):
                    raise FormatError('DOC 文件信息块被截断')
                count = struct.unpack_from('<H',body,offset)[0]
                offset += 2+count*width
            if offset+2 > len(body):
                raise FormatError('DOC 文件信息块被截断')
            csw_new = struct.unpack_from('<H',body,offset)[0]
            if csw_new:
                if offset+2+csw_new*2 > len(body):
                    raise FormatError('DOC 扩展版本信息被截断')
                nfib_new = struct.unpack_from('<H',body,offset+2)[0]
                if nfib_new not in (0xC1,0xD9,0x101,0x10C,0x112):
                    raise FormatError(f'DOC 扩展保存格式 nFibNew=0x{nfib_new:04X} 暂不支持，请另存 DOCX', 'UNSUPPORTED_VERSION')
                out['nFibNew'] = nfib_new
                out['formatVersion'] = f'Word 97–2007 二进制保存格式（nFib=0x{nfib:04X}；nFibNew=0x{nfib_new:04X}）'
    elif name in ('Workbook', 'Book'):
        if len(body) < 8:
            raise FormatError('XLS 工作簿被截断')
        record, length, version = struct.unpack_from('<HHH', body)
        if record != 0x0809 or version not in (0x0500, 0x0600) or length < 4:
            raise FormatError('已识别为旧版 XLS，但当前不支持此 BIFF 版本，请另存 XLSX', 'UNSUPPORTED_VERSION')
        out = result('excel', 'xls', 'BIFF8（Excel 97–2003 保存格式）' if version == 0x0600 else 'BIFF5/7（Excel 5.0/95 保存格式）', 'CFB')
        offset, ended = 0, False
        while offset + 4 <= len(body):
            typ, size = struct.unpack_from('<HH', body, offset)
            if offset+4+size > len(body):
                raise FormatError('XLS 记录被截断')
            if typ == 0x002F:
                out['encrypted'] = True
                break
            if typ == 0x000A:
                ended = True
                break
            offset += 4 + size
        if not ended and not out['encrypted']:
            raise FormatError('XLS 全局记录未完整结束')
    else:
        if 'Current User' not in cfb.streams:
            raise FormatError('PPT 缺少当前版本定位信息')
        current = cfb.read('Current User')
        if len(current) < 28 or struct.unpack_from('<H', current, 2)[0] != 0x0FF6:
            raise FormatError('PPT 当前版本定位信息损坏')
        token = struct.unpack_from('<I', current, 12)[0]
        if token not in (0xE391C05F, 0xF3D1C4DF):
            raise FormatError('PPT 文件加密状态无法可靠识别')
        file_version = struct.unpack_from('<H', current, 22)[0]
        out = result('powerpoint', 'ppt', f'PowerPoint 97–2003 二进制保存格式（docFileVersion={file_version}）', 'CFB')
        out['encrypted'] = token == 0xF3D1C4DF
    out['macros'] = any(re.search(r'(^|/)(?:VBA|Macros|_VBA_PROJECT_CUR)(/|$)', n, re.I) for n in cfb.names)
    if out['macros']:
        out['warnings'].append('文件含宏；工作台不执行宏，也不更新宏计算结果。')
    if len(data) % cfb.size:
        out['warnings'].append('文件尾部有非完整扇区；读取时保留原文件，旧 DOC 由 Office 兼容读取。')
    return out


def inspect_pdf(data):
    match = re.match(br'%PDF-(\d\.\d)', data)
    if not match:
        raise FormatError('PDF 文件头不完整')
    header = match[1].decode('ascii')
    if header not in [f'1.{i}' for i in range(8)] + ['2.0']:
        raise FormatError(f'PDF {header} 格式版本暂不支持', 'UNSUPPORTED_VERSION')
    if b'%%EOF' not in data[-8192:]:
        raise FormatError('PDF 缺少完整结束标记，文件可能未下载完成')
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise FormatError('本地 PDF 校验组件缺失，请重新解压完整工作台包', 'INSPECTION_UNAVAILABLE') from exc
    logging.getLogger('pypdf').setLevel(logging.ERROR)
    try:
        reader = PdfReader(io.BytesIO(data), strict=True)
        out = result('pdf', 'pdf', f'PDF {header}', 'PDF', headerVersion=header)
        out['encrypted'] = reader.is_encrypted
        if out['encrypted']:
            return out
        root = reader.trailer['/Root']
        declared = str(root.get('/Version', '')).lstrip('/')
        if declared:
            if declared not in [f'1.{i}' for i in range(8)] + ['2.0']:
                raise FormatError('PDF 目录声明了不支持的格式版本', 'UNSUPPORTED_VERSION')
            effective = max(header, declared, key=lambda v: tuple(map(int, v.split('.'))))
            out['formatVersion'] = f'PDF {effective}'
            out['catalogVersion'] = declared
        count = len(reader.pages)
        if not count:
            raise FormatError('PDF 没有可读取页面')
        for page in reader.pages:
            if float(page.mediabox.width) <= 0 or float(page.mediabox.height) <= 0:
                raise FormatError('PDF 页面尺寸无效')
        out['pageCount'] = count
        out['warnings'].append('格式识别已校验页面结构；文字提取需逐页解析，扫描页需 OCR。')
        return out
    except FormatError:
        raise
    except Exception as exc:
        raise FormatError('PDF 页面结构损坏或无法完整读取，请用原软件重新导出 PDF') from exc


def inspect(data, filename=''):
    if not data:
        raise FormatError('文件为空，未导入任何内容', 'EMPTY_FILE')
    if len(data) > MAX_BYTES:
        raise FormatError('文件超过 64 MB，请拆分后导入', 'RESOURCE_LIMIT')
    try:
        if data.startswith(CFB_MAGIC):
            out = inspect_cfb(data)
        elif data.startswith(b'PK'):
            out = inspect_zip(data)
        elif data.startswith(b'%PDF-'):
            out = inspect_pdf(data)
        elif data.lstrip().startswith(b'{\\rtf'):
            raise FormatError('实际内容是 RTF，请用 Word/WPS 另存为 DOCX 后导入；不要只修改后缀', 'UNSUPPORTED_FORMAT', result('word', 'rtf', 'Rich Text Format', 'RTF'))
        else:
            raise FormatError('无法识别为完整的 Word、Excel、PPT 或 PDF 文件；请用原软件另存标准格式', 'UNSUPPORTED_FORMAT')
    except (struct.error, UnicodeError, OverflowError, IndexError) as exc:
        raise FormatError('文件结构损坏或被截断，未导入任何内容') from exc
    ext = Path(filename).suffix.lower().lstrip('.')
    allowed = {out['format']}
    if out['format'] == 'xls':
        allowed.add('xlt')
    if out['format'] == 'ppt':
        allowed.update(('pps', 'pot'))
    out['extensionMatches'] = not ext or ext in allowed
    if out['encrypted']:
        raise FormatError('文件已加密，请先在有权限的原软件中另存为未加密副本再导入', 'ENCRYPTED_FILE', out)
    if not out['extensionMatches']:
        raise FormatError(f"文件后缀为 .{ext}，实际内容是 {out['format'].upper()}，请用原软件另存正确格式；不要只改文件名", 'FORMAT_MISMATCH', out)
    return out


if __name__ == '__main__':
    try:
        detected = inspect(Path(sys.argv[1]).read_bytes(), sys.argv[2] if len(sys.argv) > 2 else '')
        payload = {'detected': detected}
    except FormatError as exc:
        payload = {'error': str(exc), 'code': exc.code}
        if exc.detected:
            payload['detected'] = exc.detected
    print(json.dumps(payload, ensure_ascii=True))
