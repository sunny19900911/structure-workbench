"""Extend a compiled frontend plan with the frozen cover runtime files."""
from pathlib import Path
import hashlib
import json
import shutil
import sys

root = Path(__file__).resolve().parents[3]
plan_path = Path(sys.argv[1]).resolve()
plan = json.loads(plan_path.read_text(encoding='utf-8'))
app = Path(plan['app'])
freeze = json.loads((root / 'design/parallel-review-20261112/calculation-cover/freeze.json').read_text(encoding='utf-8'))

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

for item in freeze['files']:
    source = root / item['path']
    if digest(source) != item['sha256']:
        raise RuntimeError('Frozen source changed: ' + item['path'])
    if item['path'] == 'calculation-book.js':
        if plan['sourceHashes'][item['path']] != item['sha256']:
            raise RuntimeError('Compiled frontend differs from freeze')
        continue
    staged = plan_path.parent / 'runtime-files' / item['path']
    staged.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, staged)
    target = app / item['path']
    change = {'target': item['path'], 'source': str(staged),
              'before': digest(target), 'after': digest(staged)}
    existing = next((entry for entry in plan['changes'] if entry['target'] == item['path']), None)
    if existing is not None:
        existing.update(change)
    else:
        plan['changes'].append(change)
    plan['sourceHashes'][item['path']] = item['sha256']
plan['serviceRestartRequired'] = True
plan['freeze'] = freeze
plan_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'plan': str(plan_path), 'changes': len(plan['changes'])}, ensure_ascii=False))
