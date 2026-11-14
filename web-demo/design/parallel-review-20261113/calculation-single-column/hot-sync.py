"""Publish the frozen Python/template and the calculation-book description."""
from pathlib import Path
import argparse
import datetime
import hashlib
import http.client
import json
import os
import re
import shutil

ROOT = Path(__file__).resolve().parents[3]
APP = ROOT / 'outputs/portable/结构工作台-网页修复-20261111-220948/app'
parser = argparse.ArgumentParser()
parser.add_argument('--native-only', action='store_true')
parser.add_argument('--label', default='single-column')
parser.add_argument('--freeze', type=Path, default=Path(__file__).parent / 'freeze.json')
args = parser.parse_args()
if not re.fullmatch(r'[a-z0-9-]{1,40}', args.label):
    parser.error('Invalid publication label')
QA = ROOT / 'qa/portable-release/launcher-20261113' / (args.label + '-' + datetime.datetime.now().strftime('%H%M%S'))
QA.mkdir(parents=True, exist_ok=False)

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def get_json(route):
    connection = http.client.HTTPConnection('127.0.0.1', 58727, timeout=15)
    try:
        connection.request('GET', route)
        response = connection.getresponse()
        assert response.status == 200
        return json.loads(response.read())
    finally:
        connection.close()

def project_hashes(data_root):
    projects = Path(data_root) / 'projects'
    return {path.relative_to(projects).as_posix(): digest(path)
            for path in projects.rglob('*') if path.is_file()}

def replace(source, target):
    temporary = target.with_name('.' + target.name + '.single-column-update')
    shutil.copy2(source, temporary)
    os.replace(temporary, target)

health = get_json('/api/portable/health')
assert health['pid'] == 144980
assert health['instanceId'] == 'c1728dcc-6225-492e-a0c0-ddf0aea2173f'
status = get_json('/api/launcher/status')
assert not status['browser']['tasks']
assert not any(client.get('busy') for client in status['browser']['clients'] + status['clients'])
before_projects = project_hashes(health['dataRoot'])
freeze = json.loads(args.freeze.read_text(encoding='utf-8'))
if freeze.get('assetBaselineSha256'):
    assert digest(APP / 'assets/calculation-book/cover-reference.docx') == freeze['assetBaselineSha256']
changes = []
for item in freeze['files']:
    source = ROOT / item['path']
    assert digest(source) == item['sha256'], item['path']
    staged = QA / 'prepared' / item['path']
    staged.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, staged)
    changes.append({'target': item['path'], 'source': str(staged),
                    'before': digest(APP / item['path']), 'after': digest(staged)})

if not args.native_only:
    old_description = '独立组卷入口：目录可增删，实时查看A3横向双栏快照；人工确认后直接导出Word。'
    new_description = '目录可增删，查看计算书内容，人工确认后导出 Word。'
    assert new_description in (ROOT / 'workbuddy-integrated-studio.html').read_text(encoding='utf-8')
    for relative in ['workbuddy-integrated-studio.html', 'dist/workbuddy-integrated-studio.html']:
        target = APP / relative
        original = target.read_bytes()
        assert original.count(old_description.encode('utf-8')) == 1, relative
        staged = QA / 'prepared' / relative
        staged.parent.mkdir(parents=True, exist_ok=True)
        staged.write_bytes(original.replace(old_description.encode('utf-8'), new_description.encode('utf-8')))
        changes.append({'target': relative, 'source': str(staged), 'before': digest(target), 'after': digest(staged)})

marker = APP / 'dist/frontend-update.json'
previous_marker = json.loads(marker.read_text(encoding='utf-8'))
backup = QA / 'original-app-backup'
for item in changes + [{'target': 'dist/frontend-update.json', 'before': digest(marker)}]:
    target = APP / item['target']
    assert digest(target) == item['before']
    saved = backup / item['target']
    saved.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(target, saved)
plan = {'app': str(APP), 'freeze': freeze, 'changes': changes, 'beforeHealth': health,
        'previousMarkerHash': digest(marker), 'serviceRestartRequired': False}
(QA / 'plan.json').write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding='utf-8')
(QA / 'before-project-hashes.json').write_text(json.dumps(before_projects, indent=2), encoding='utf-8')

completed = []
try:
    # Both template versions use the same five-table form. Publish the asset first.
    for item in sorted(changes, key=lambda entry: (Path(entry['target']).suffix == '.html', entry['target'])):
        assert digest(Path(item['source'])) == item['after']
        replace(Path(item['source']), APP / item['target'])
        completed.append(item['target'])
    stamp = {**previous_marker, 'id': 'calculation-' + args.label + '-20261113-' + QA.name.split('-')[-1],
             'publishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
             'previousUpdate': previous_marker['id'], 'serviceRestartRequired': False,
             'sourceHashes': {**previous_marker['sourceHashes'], **{item['target']: item['after'] for item in changes}}}
    prepared_marker = QA / 'frontend-update.json'
    prepared_marker.write_text(json.dumps(stamp, ensure_ascii=False, indent=2), encoding='utf-8')
    replace(prepared_marker, marker)
except Exception:
    for relative in reversed(completed):
        replace(backup / relative, APP / relative)
    replace(backup / 'dist/frontend-update.json', marker)
    raise

after_health = get_json('/api/portable/health')
assert after_health == health, 'Service identity changed during hot sync'
assert project_hashes(health['dataRoot']) == before_projects, 'Project file changed during hot sync'
for item in changes:
    assert digest(APP / item['target']) == item['after']
ppt_files = {file: expected for file, expected in previous_marker['sourceHashes'].items()
             if any(word in file for word in ['ppt', 'cafeteria', 'single-image-layout'])}
for file, expected in ppt_files.items():
    assert digest(APP / file) == expected, file
result = {'qa': str(QA), 'health': after_health, 'changes': completed, 'marker': stamp['id'],
          'projectFiles': len(before_projects), 'projectsUnchanged': True,
          'preservedPptFiles': len(ppt_files), 'serviceRestarted': False}
(QA / 'publication.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False))
