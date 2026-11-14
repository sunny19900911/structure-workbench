"""Publish a reviewed static plan while checking the running instance and data."""
from pathlib import Path
import hashlib
import http.client
import json
import subprocess
import sys

root = Path(__file__).resolve().parents[3]
plan_path = Path(sys.argv[1]).resolve()
qa = plan_path.parent
plan = json.loads(plan_path.read_text(encoding='utf-8'))
app = Path(plan['app'])

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def get_json(route):
    connection = http.client.HTTPConnection('127.0.0.1', 58727, timeout=20)
    try:
        connection.request('GET', route)
        response = connection.getresponse()
        assert response.status == 200
        return json.loads(response.read())
    finally:
        connection.close()

def tree_hashes(folder):
    return {path.relative_to(folder).as_posix(): digest(path) for path in folder.rglob('*') if path.is_file()}

freeze = json.loads((root / 'design/parallel-review-20261114/ppt-semantic-images/源码清单.json').read_text(encoding='utf-8'))
for item in freeze:
    assert digest(root / item['path']) == item['sha256'] == plan['sourceHashes'][item['path']]
health = get_json('/api/portable/health')
assert health['pid'] == 144980 and health['instanceId'] == 'c1728dcc-6225-492e-a0c0-ddf0aea2173f'
projects = Path(health['dataRoot']) / 'projects'
before_projects = tree_hashes(projects)
protected = {**{'server/' + key: value for key, value in tree_hashes(app / 'server').items()},
             **{'scripts/' + key: value for key, value in tree_hashes(app / 'scripts').items()},
             **{'assets/' + key: value for key, value in tree_hashes(app / 'assets').items()}}
old_hashed_assets = tree_hashes(app / 'dist/assets')
before = {'health': health, 'projectHashes': before_projects, 'protectedFiles': protected, 'oldHashedAssets': old_hashed_assets}
(qa / 'before-publication.json').write_text(json.dumps(before, ensure_ascii=False, indent=2), encoding='utf-8')
publisher = root / 'design/parallel-review-20261111/launcher/static-ppt-update.py'
subprocess.run([str(app.parent / 'runtime/python/python.exe'), str(publisher), '--apply', str(plan_path)], check=True, capture_output=True)
assert get_json('/api/portable/health') == health
assert tree_hashes(projects) == before_projects, 'Project data changed during publication'
for file, expected in protected.items():
    assert digest(app / file) == expected, file
for file, expected in old_hashed_assets.items():
    assert digest(app / 'dist/assets' / file) == expected, file
for item in plan['changes']:
    assert digest(app / item['target']) == item['after'], item['target']
result = {'pass': True, 'health': health, 'projectFiles': len(before_projects), 'projectsUnchanged': True,
          'protectedFiles': len(protected), 'preservedHashedAssets': len(old_hashed_assets),
          'changedFiles': len(plan['changes']), 'marker': get_json('/frontend-update.json')['id']}
(qa / 'live-publication-verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False))
