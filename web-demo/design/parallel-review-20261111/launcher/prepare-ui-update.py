"""Build a new App and a saved-data snapshot while preserving the running service."""
from pathlib import Path
import datetime
import hashlib
import json
import os
import shutil
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[3]
OLD_STAGE = ROOT / 'outputs/portable/结构工作台-统一客户端测试-20261111-build-080853'
OLD_DATA = ROOT / 'qa/portable-release/launcher-20261111/unified/独立演示项目库'
STAMP = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
QA = ROOT / 'qa/portable-release/launcher-20261111' / ('ui-update-' + STAMP)
STAGE = ROOT / 'outputs/portable' / ('结构工作台-网页修复-' + STAMP)
NODE = OLD_STAGE / 'runtime/node/node.exe'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_files():
    files = list(ROOT.glob('*.js')) + list(ROOT.glob('*.html')) + list(ROOT.glob('*.css'))
    for folder in ['server', 'deploy/portable', 'deploy/blackbox', 'deepseek-rewrite']:
        files.extend(path for path in (ROOT / folder).rglob('*')
                     if path.is_file() and path.suffix in ['.mjs', '.js', '.py', '.html', '.css', '.ps1', '.cmd'])
    return {path.relative_to(ROOT).as_posix(): digest(path) for path in sorted(set(files))}


def run(command, log, env=None):
    with log.open('wb') as output:
        subprocess.run([str(value) for value in command], cwd=ROOT, env=env,
                       stdout=output, stderr=subprocess.STDOUT, check=True)


QA.mkdir(parents=True, exist_ok=False)
STAGE.mkdir(parents=True, exist_ok=False)
before = source_files()
env = {**os.environ, 'WORKBENCH_PORTABLE_BUILD': '1'}
run([NODE, ROOT / 'node_modules/vite/bin/vite.js', 'build'], QA / 'vite-build.log', env)
archive_name = 'portable-ui-update-' + STAMP + '.zip'
run([sys.executable, ROOT / 'deploy/baota/package.py', '--name', archive_name], QA / 'app-build.log')
app = STAGE / 'app'
app.mkdir()
with zipfile.ZipFile(ROOT / 'outputs/baota' / archive_name) as archive:
    for member in archive.infolist():
        if member.is_dir() or not member.filename.startswith('structure-workbench/'):
            continue
        relative = Path(member.filename).relative_to('structure-workbench')
        if relative.name == '.env.example':
            continue
        target = app / relative
        if not target.resolve().is_relative_to(app.resolve()):
            raise ValueError('Invalid archive path')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(archive.read(member))

for folder in ['server', 'deploy/portable', 'deploy/blackbox']:
    for original in (ROOT / folder).rglob('*'):
        if not original.is_file() or original.suffix not in ['.mjs', '.js', '.py', '.ps1', '.md', '.html', '.css'] or '.test.' in original.name:
            continue
        target = app / original.relative_to(ROOT)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(original, target)

shutil.copytree(OLD_STAGE / 'app/dist/vendor', app / 'dist/vendor', dirs_exist_ok=True)
shutil.copy2(ROOT / 'portable-projects-ui.js', app / 'dist/portable-projects-ui.js')
run([NODE, ROOT / 'deploy/portable/copy-node-deps.mjs', ROOT, app], QA / 'node-dependencies.log')
for name in ['launch.ps1', 'mcp.cmd', '启动工作台.cmd', '生成MCP配置.cmd', '使用说明.txt']:
    text = (ROOT / 'deploy/portable' / name).read_text(encoding='utf-8-sig')
    (STAGE / name).write_text(text, encoding='utf-8-sig' if name.endswith('.ps1') else 'utf-8', newline='\r\n')
(STAGE / 'data-folder.txt').write_text('StructureWorkbenchUIFix20261111', encoding='utf-8')
run([NODE, '-e', 'require("fs").symlinkSync(process.argv[1],process.argv[2],"junction")',
     OLD_STAGE / 'runtime', STAGE / 'runtime'], QA / 'runtime-link.log')

data = QA / '已保存数据副本'
copied = {}
snapshot_started = datetime.datetime.now(datetime.timezone.utc).isoformat()
project_revisions = {}
for folder in ['projects', 'project-assets', 'calculation-sources', 'calculation-uploads', 'legacy-expansion']:
    source = OLD_DATA / folder
    if not source.exists():
        continue
    for original in source.rglob('*'):
        if not original.is_file() or original.is_symlink() or original.name.endswith('.tmp'):
            continue
        relative = original.relative_to(OLD_DATA)
        # Directory bindings grant write access to original external output folders.
        if 'folder-binding' in relative.parts or '.locks' in relative.parts:
            continue
        target = data / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        expected = digest(original)
        shutil.copy2(original, target)
        if digest(target) != expected or digest(original) != expected:
            raise RuntimeError('Source changed during snapshot: ' + str(relative))
        copied[relative.as_posix()] = expected
        if len(relative.parts) == 4 and relative.parts[0] == 'projects' and original.suffix == '.json':
            stored = json.loads(target.read_text(encoding='utf-8'))
            key = stored.get('projectId', '') + '/' + stored.get('part', '')
            revision = stored.get('revision', 0)
            if revision > project_revisions.get(key, {}).get('revision', 0):
                project_revisions[key] = {'revision': revision, 'savedAt': stored.get('savedAt')}

after = source_files()
if before != after:
    raise RuntimeError('Source changed during App build')
manifest = {path.relative_to(app).as_posix(): digest(path) for path in app.rglob('*')
            if path.is_file() and 'node_modules' not in path.relative_to(app).parts}
record = {
    'builtAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'stage': str(STAGE), 'dataRoot': str(data), 'sourceDataRoot': str(OLD_DATA),
    'runtimeSource': str(OLD_STAGE / 'runtime'), 'runtimeReused': True,
    'snapshotStarted': snapshot_started,
    'snapshotCompleted': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'projectRevisions': project_revisions,
    'sourceFiles': before, 'appFiles': manifest, 'snapshotFiles': copied,
    'excluded': ['preferences.json', 'mcp', 'cache', 'exports', 'folder-binding', '.locks', '*.tmp'],
    'sourceSignature': hashlib.sha256(json.dumps(before, sort_keys=True).encode()).hexdigest(),
}
(QA / 'sync-manifest.json').write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf-8')
(STAGE / '增量来源.json').write_text(json.dumps({key: record[key] for key in ['builtAt', 'runtimeSource', 'sourceSignature']}, ensure_ascii=False, indent=2), encoding='utf-8')
(ROOT / 'qa/portable-release/launcher-20261111/latest-ui-update.json').write_text(json.dumps({'qa': str(QA), 'stage': str(STAGE), 'dataRoot': str(data)}, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'qa': str(QA), 'stage': str(STAGE), 'dataRoot': str(data), 'sourceSignature': record['sourceSignature']}, ensure_ascii=False))
