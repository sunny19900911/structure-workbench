"""Apply the supplied program manifest; never delete or copy project/config data."""
import argparse, datetime, hashlib, json, shutil
from pathlib import Path

PROTECTED={'.env','node_modules','.venv','outputs','qa','workbench-data','projects','.git'}

def inside(root,relative):
    rel=Path(relative)
    if rel.is_absolute() or '..' in rel.parts or any(x in PROTECTED for x in rel.parts):
        raise ValueError('更新清单含受保护或越界路径：'+relative)
    dest=root/rel
    # Do not follow symlinks into unrelated folders, even within the target.
    current=root
    for part in rel.parts:
        current=current/part
        if current.is_symlink():raise ValueError('拒绝写入符号链接：'+relative)
    dest.resolve().relative_to(root)
    return dest

def prepare(source,target):
    manifest=json.loads((source/'package-manifest.json').read_text(encoding='utf-8'))
    plan=[]
    for name,info in manifest.items():
        src=inside(source,name);dst=inside(target,name)
        if not src.is_file() or hashlib.sha256(src.read_bytes()).hexdigest()!=info['sha256']:
            raise ValueError('上传包校验失败：'+name)
        if not dst.exists() or hashlib.sha256(dst.read_bytes()).hexdigest()!=info['sha256']:
            plan.append((name,src,dst))
    return plan

def program_dirs(parent,target):
    missing=[]
    while parent!=target and not parent.exists():
        missing.append(parent);parent=parent.parent
    for folder in reversed(missing):
        folder.mkdir();folder.chmod(0o755)

def main():
    p=argparse.ArgumentParser(description='宝塔工作台更新，先停止Node项目；默认只预览。')
    p.add_argument('target',help='宝塔Node项目的实际程序目录')
    p.add_argument('--apply',action='store_true')
    args=p.parse_args()
    source=(Path(__file__).resolve().parent/'structure-workbench').resolve()
    target=Path(args.target).resolve(strict=True)
    if source==target or source in target.parents or target in source.parents:
        raise ValueError('请把更新包解压到独立临时目录，不要解压到运行目录里')
    if not (target/'deploy/baota/start.mjs').is_file():
        raise ValueError('目标不是已有宝塔工作台Node目录，未进行更新')
    plan=prepare(source,target)
    print('程序目录：'+str(target));print('待更新程序文件：'+str(len(plan)))
    print('保留 .env、项目库、密钥配置、依赖和导出文件；不会删除旧文件。')
    if not args.apply:
        print('未修改文件。确认Node项目已停止后，追加 --apply 执行。');return
    backup=target.parent/(target.name+'-program-backup-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f'))
    backup.mkdir(mode=0o700)
    applied=[]
    try:
        for name,src,dst in plan:
            if dst.exists():
                old=backup/name;old.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(dst,old)
            applied.append((name,dst,dst.exists()))
            program_dirs(dst.parent,target);shutil.copy2(src,dst)
            # ZIP tools may restore Windows files as root:root 600. These are
            # allowlisted program files only; www must be able to read them.
            dst.chmod(0o644)
        (backup/'update-record.json').write_text(json.dumps({'target':str(target),'files':[{'path':n,'existed':ex} for n,_,ex in applied]},ensure_ascii=False,indent=2),encoding='utf-8')
    except Exception:
        for name,dst,existed in reversed(applied):
            if existed:shutil.copy2(backup/name,dst)
            elif dst.is_file():dst.unlink()
        raise
    print('程序更新完成。程序备份：'+str(backup))
    print('请按先读我.md安装依赖并重启 structure-workbench.service；本包不自动修改Nginx。')

if __name__=='__main__':main()
