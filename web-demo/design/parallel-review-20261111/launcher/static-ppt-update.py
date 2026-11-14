"""Prepare and publish frontend files on the existing service, with backups."""
from pathlib import Path
from html.parser import HTMLParser
import argparse
import datetime
import hashlib
import json
import os
import re
import shutil
import subprocess
import time
import urllib.parse

ROOT = Path(__file__).resolve().parents[3]
APP = ROOT / 'outputs/portable/结构工作台-网页修复-20261111-220948/app'
LIVE = APP / 'dist'
NODE = APP.parent / 'runtime/node/node.exe'
parser = argparse.ArgumentParser()
parser.add_argument('--apply', type=Path)
parser.add_argument('--label', default='ppt-performance')
args = parser.parse_args()
if not re.fullmatch(r'[a-z0-9-]{1,60}', args.label):
    parser.error('Invalid publication label')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def publish(source, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name('.' + target.name + '.ppt-update-tmp')
    shutil.copy2(source, temporary)
    for attempt in range(4):
        try:
            os.replace(temporary, target)
            return
        except PermissionError:
            if attempt == 3:
                raise
            time.sleep(0.15)


if args.apply:
    plan_path = args.apply.resolve()
    plan = json.loads(plan_path.read_text(encoding='utf-8'))
    if Path(plan['app']).resolve() != APP.resolve():
        raise ValueError('App does not match the inspected service')
    backup = plan_path.parent / 'original-app-backup'
    backup.mkdir(exist_ok=False)
    marker = LIVE / 'frontend-update.json'
    if (digest(marker) if marker.exists() else None) != plan.get('previousMarkerHash'):
        raise RuntimeError('Publication marker changed since preparation')
    if marker.exists():
        (backup / 'dist').mkdir(exist_ok=True)
        shutil.copy2(marker, backup / 'dist/frontend-update.json')
    # Validate before changing any files. Preserve old hashed resources.
    for item in plan['changes']:
        target = APP / item['target']
        if not target.resolve().is_relative_to(APP.resolve()):
            raise ValueError('Target outside App')
        expected = item['before']
        if (digest(target) if target.exists() else None) != expected:
            raise RuntimeError('Live file changed: ' + item['target'])
        if digest(Path(item['source'])) != item['after']:
            raise RuntimeError('Prepared file changed: ' + item['source'])
        if expected:
            saved = backup / item['target']
            saved.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target, saved)
    changes = sorted(plan['changes'], key=lambda item: (Path(item['target']).suffix == '.html', item['target']))
    completed = []
    try:
        for item in changes:
            publish(Path(item['source']), APP / item['target'])
            completed.append(item['target'])
        stamp = {
            'id': plan['id'], 'publishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'sourceHashes': plan['sourceHashes'], 'serviceRestartRequired': bool(plan.get('serviceRestartRequired', False)),
        }
        stamp_file = plan_path.parent / 'frontend-update.json'
        stamp_file.write_text(json.dumps(stamp, ensure_ascii=False, indent=2), encoding='utf-8')
        publish(stamp_file, LIVE / 'frontend-update.json')
    except Exception:
        for relative in reversed(completed):
            saved = backup / relative
            if saved.exists():
                publish(saved, APP / relative)
        if (backup / 'dist/frontend-update.json').exists():
            publish(backup / 'dist/frontend-update.json', LIVE / 'frontend-update.json')
        raise
    result = {'id': plan['id'], 'completed': completed, 'backup': str(backup), 'publishedAt': stamp['publishedAt']}
    (plan_path.parent / 'publication.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))
else:
    stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    qa = ROOT / 'qa/portable-release' / ('launcher-' + stamp[:8]) / ('ppt-static-' + stamp)
    output = qa / 'dist'
    qa.mkdir(parents=True, exist_ok=False)
    backend_changes = []
    for original in (ROOT / 'server').rglob('*'):
        if original.is_file() and original.suffix in ['.mjs', '.js', '.py', '.ps1'] and '.test.' not in original.name:
            packaged = APP / original.relative_to(ROOT)
            if not packaged.exists() or digest(original) != digest(packaged):
                backend_changes.append(original.relative_to(ROOT).as_posix())
    if backend_changes:
        raise RuntimeError('Backend differs; static-only update needs review: ' + ', '.join(backend_changes))
    # Existing non-hashed static routes are part of the reviewed App allowlist.
    candidates = {}
    for old in LIVE.rglob('*'):
        relative = old.relative_to(LIVE)
        if old.is_file() and relative.parts[0] not in ['assets', 'vendor']:
            source = ROOT / relative
            if source.is_file() and source.suffix in ['.js', '.mjs', '.css', '.json', '.png', '.jpg', '.svg', '.woff2', '.pptx']:
                candidates[relative] = source
    frontend = [path for path in ROOT.iterdir() if path.is_file() and path.suffix in ['.js', '.css', '.html']]
    frontend.extend(path for path in (ROOT / 'design/parallel-tasks/06-ppt-report').rglob('*')
                    if path.is_file() and path.suffix in ['.js', '.css', '.html'] and '.test.' not in path.name)
    for source in frontend:
        if source.is_relative_to(ROOT / 'design/parallel-tasks/06-ppt-report'):
            candidates[source.relative_to(ROOT)] = source
    templates = [path for path in (ROOT / 'design/ppt-template').rglob('*')
                 if path.is_file() and path.suffix in ['.js', '.json', '.pptx']]
    frontend.extend(templates)
    for source in templates:
        candidates[source.relative_to(ROOT)] = source
    source_hashes = {path.relative_to(ROOT).as_posix(): digest(path) for path in frontend}
    with (qa / 'vite-build.log').open('wb') as log:
        subprocess.run([str(NODE), str(ROOT / 'node_modules/vite/bin/vite.js'), 'build', '--outDir', str(output)],
                       cwd=ROOT, env={**os.environ, 'WORKBENCH_PORTABLE_BUILD': '1'}, stdout=log, stderr=subprocess.STDOUT, check=True)

    class StaticReferences(HTMLParser):
        def __init__(self, relative):
            super().__init__()
            self.relative = relative

        def handle_starttag(self, tag, attributes):
            for key, value in attributes:
                if key not in ['src', 'href'] or not value or urllib.parse.urlsplit(value).scheme:
                    continue
                url = urllib.parse.urlsplit(value).path
                target = (self.relative.parent / url).as_posix()
                source = (ROOT / target).resolve()
                if source.is_relative_to(ROOT.resolve()) and source.is_file() and source.suffix in ['.js', '.css', '.json']:
                    if not any(part in ['node_modules', 'outputs', 'qa'] or part.startswith('.') for part in source.relative_to(ROOT).parts):
                        candidates[source.relative_to(ROOT)] = source

    for html in output.rglob('*.html'):
        reader = StaticReferences(html.relative_to(output))
        reader.feed(html.read_text(encoding='utf-8'))
    for relative, source in candidates.items():
        target = output / relative
        if not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
    if source_hashes != {path.relative_to(ROOT).as_posix(): digest(path) for path in frontend}:
        raise RuntimeError('Frontend source changed while building')
    changes = []
    for source in output.rglob('*'):
        if not source.is_file():
            continue
        target = APP / 'dist' / source.relative_to(output)
        before = digest(target) if target.exists() else None
        after = digest(source)
        if before != after:
            changes.append({'target': target.relative_to(APP).as_posix(), 'source': str(source), 'before': before, 'after': after})
    for source in frontend:
        target = APP / source.relative_to(ROOT)
        if (target.is_file() and digest(source) != digest(target)) or (not target.exists() and (source.is_relative_to(ROOT / 'design/parallel-tasks/06-ppt-report') or source in templates)):
            changes.append({'target': target.relative_to(APP).as_posix(), 'source': str(source), 'before': digest(target) if target.exists() else None, 'after': digest(source)})
    marker = LIVE / 'frontend-update.json'
    plan = {'id': args.label + '-' + stamp, 'app': str(APP), 'output': str(output), 'sourceHashes': source_hashes, 'previousMarkerHash': digest(marker) if marker.exists() else None, 'changes': changes}
    path = qa / 'plan.json'
    path.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'plan': str(path), 'files': len(changes)}, ensure_ascii=False))
