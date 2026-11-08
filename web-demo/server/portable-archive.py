"""Bounded ZIP I/O for offline project transfer; never extracts unvalidated paths."""
import hashlib
import json
import re
import stat
import sys
import zipfile
from pathlib import Path

MAX_FILES = 6000
MAX_TOTAL = 1024 * 1024 * 1024
MAX_FILE = 128 * 1024 * 1024
MAX_MANIFEST = 4 * 1024 * 1024
RESERVED = re.compile(r"^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)", re.I)


def valid_name(name):
    parts = name.split("/")
    if (len(name) > 1500 or len(parts) > 18 or not name or
            any(not p or p in (".", "..") or p[-1:] in (".", " ") or
                RESERVED.match(p) or re.search(r'[\\:\x00-\x1f<>"|?*]', p) for p in parts)):
        raise ValueError("项目包包含不安全的文件路径")
    return name


def digest(path):
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def pack(source, target):
    manifest = json.loads((source / "manifest.json").read_text(encoding="utf-8"))
    names = []
    total = 0
    for path in sorted(source.rglob("*")):
        if path.is_symlink():
            raise ValueError("项目包不能包含链接文件")
        if not path.is_file() or path.name == "manifest.json":
            continue
        name = valid_name(path.relative_to(source).as_posix())
        size = path.stat().st_size
        if size > MAX_FILE:
            raise ValueError("单个文件超过项目包上限 128 MB")
        total += size
        names.append((name, path, size))
    if len(names) > MAX_FILES or total > MAX_TOTAL:
        raise ValueError("项目包超过 6000 个文件或 1 GB，请先整理项目")
    manifest["entries"] = [{"path": name, "bytes": size, "sha256": digest(path)} for name, path, size in names]
    raw = json.dumps(manifest, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(raw) > MAX_MANIFEST or total + len(raw) > MAX_TOTAL:
        raise ValueError("项目清单过大")
    with zipfile.ZipFile(target, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        archive.writestr("manifest.json", raw)
        for name, path, _ in names:
            archive.write(path, name)


def unpack(source, target):
    with zipfile.ZipFile(source) as archive:
        infos = archive.infolist()
        names = {}
        folded = set()
        total = 0
        if len(infos) > MAX_FILES + 1:
            raise ValueError("项目包文件过多")
        for info in infos:
            name = valid_name(info.filename)
            key = name.casefold()
            if key in folded or info.is_dir() or stat.S_ISLNK(info.external_attr >> 16):
                raise ValueError("项目包含重复、链接或异常目录条目")
            if info.flag_bits & 1:
                raise ValueError("项目包已加密，请先解密")
            if info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
                raise ValueError("项目包压缩格式不支持")
            if info.file_size > (MAX_MANIFEST if name == "manifest.json" else MAX_FILE):
                raise ValueError("项目包单文件过大")
            total += info.file_size
            folded.add(key)
            names[name] = info
        if total > MAX_TOTAL or "manifest.json" not in names:
            raise ValueError("项目包超过 1 GB 或缺少清单")
        raw = archive.read(names["manifest.json"])
        manifest = json.loads(raw)
        if manifest.get("format") != "structure-workbench-project" or manifest.get("schema") != 1:
            raise ValueError("这不是受支持的工作台项目包")
        entries = manifest.get("entries")
        if not isinstance(entries, list) or len(entries) > MAX_FILES:
            raise ValueError("项目包清单无效")
        expected = set()
        for entry in entries:
            if not isinstance(entry, dict):
                raise ValueError("项目包文件清单无效")
            name = valid_name(entry.get("path", ""))
            if name in expected or name == "manifest.json" or name not in names:
                raise ValueError("项目包文件与清单不一致")
            if not re.fullmatch(r"[a-f0-9]{64}", str(entry.get("sha256", ""))):
                raise ValueError("项目包缺少有效的完整性校验")
            if entry.get("bytes") != names[name].file_size:
                raise ValueError("项目包文件大小校验失败")
            expected.add(name)
        if expected != set(names) - {"manifest.json"}:
            raise ValueError("项目包含清单外文件")
        # All paths and sizes are checked before the first member is written.
        target.mkdir(parents=True, exist_ok=False)
        (target / "manifest.json").write_bytes(raw)
        for entry in entries:
            name = entry["path"]
            path = target.joinpath(*name.split("/"))
            path.parent.mkdir(parents=True, exist_ok=True)
            checksum = hashlib.sha256()
            count = 0
            with archive.open(name) as reader, path.open("xb") as writer:
                while chunk := reader.read(1024 * 1024):
                    count += len(chunk)
                    if count > entry["bytes"]:
                        raise ValueError("项目包解压大小异常")
                    checksum.update(chunk)
                    writer.write(chunk)
            if count != entry["bytes"] or checksum.hexdigest() != entry["sha256"]:
                raise ValueError("项目包完整性校验失败，请重新导出")
    return manifest


if __name__ == "__main__":
    try:
        operation, source, target = sys.argv[1:]
        if operation == "pack":
            pack(Path(source), Path(target))
        elif operation == "unpack":
            unpack(Path(source), Path(target))
        else:
            raise ValueError("操作不支持")
        print(json.dumps({"ok": True}))
    except (ValueError, OSError, KeyError, TypeError, zipfile.BadZipFile, RuntimeError) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
