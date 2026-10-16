"""Exercise the upload updater only inside temporary program/data directories."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


UPDATER = Path(__file__).with_name('update.py')


def snapshot(root):
    return {
        p.relative_to(root).as_posix(): p.read_bytes()
        for p in root.rglob('*') if p.is_file()
    }


class UpdatePackageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='workbench-update-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.delivery = self.root / 'delivery'
        self.source = self.delivery / 'structure-workbench'
        self.target = self.root / 'running-workbench'
        self.source.mkdir(parents=True)
        self.target.mkdir()
        self.script = self.delivery / 'UPDATE.py'
        shutil.copy2(UPDATER, self.script)
        self.files = {
            'deploy/baota/start.mjs': b'// new server\n',
            'dist/workbuddy-integrated-studio.html': b'<h1>new page</h1>\n',
            'dist/new-module.js': b'export const version = 2;\n',
            'dist/unchanged.css': b'body { color: black; }\n',
            'deploy/baota/.env.example': b'DEEPSEEK_API_KEY=\n',
        }
        for name, content in self.files.items():
            self.put(self.source, name, content)
        self.manifest = {
            name: {'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest()}
            for name, content in self.files.items()
        }
        self.write_manifest()
        for name, content in {
            'deploy/baota/start.mjs': b'// old server\n',
            'dist/workbuddy-integrated-studio.html': b'<h1>old page</h1>\n',
            'dist/unchanged.css': self.files['dist/unchanged.css'],
            'dist/old-custom-file.js': b'// user extension, retain\n',
            '.env': b'WORKBENCH_USER=fixture-user\n',
            'projects/project-fixture/main/0000000001-fixture.json': b'{"revision":1}',
            'workbench-data/projects/fixture.json': b'{"saved":true}',
            'outputs/user-export.txt': b'user export fixture',
            'node_modules/local-dependency/index.js': b'// existing dependency',
        }.items():
            self.put(self.target, name, content)
        self.before = snapshot(self.target)

    @staticmethod
    def put(root, name, data):
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def write_manifest(self):
        (self.source / 'package-manifest.json').write_text(
            json.dumps(self.manifest), encoding='utf-8'
        )

    def run_update(self, apply=False):
        command = [sys.executable, str(self.script), str(self.target)]
        if apply:
            command.append('--apply')
        return subprocess.run(
            command, cwd=self.root, env={**os.environ, 'PYTHONUTF8': '1'},
            capture_output=True, text=True, encoding='utf-8', timeout=20,
        )

    def backups(self):
        return sorted(self.root.glob(self.target.name + '-program-backup-*'))

    def assert_untouched(self):
        self.assertEqual(snapshot(self.target), self.before)
        self.assertEqual(self.backups(), [])

    def test_dry_run_does_not_modify_program_or_data(self):
        source_before = snapshot(self.source)
        result = self.run_update()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('--apply', result.stdout)
        self.assert_untouched()
        self.assertEqual(snapshot(self.source), source_before)

    def test_apply_preserves_config_projects_and_backs_up_old_program(self):
        result = self.run_update(apply=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        for name, data in self.files.items():
            self.assertEqual((self.target / name).read_bytes(), data, name)
        for name, data in self.before.items():
            if name not in self.files:
                self.assertEqual((self.target / name).read_bytes(), data, name)
        backups = self.backups()
        self.assertEqual(len(backups), 1)
        backup = backups[0]
        for name in ('deploy/baota/start.mjs', 'dist/workbuddy-integrated-studio.html'):
            self.assertEqual((backup / name).read_bytes(), self.before[name])
        self.assertFalse((backup / 'dist/new-module.js').exists())
        self.assertFalse((backup / '.env').exists())
        self.assertFalse((backup / 'projects').exists())
        self.assertFalse((backup / 'dist/unchanged.css').exists())
        record = json.loads((backup / 'update-record.json').read_text(encoding='utf-8'))
        self.assertEqual(Path(record['target']), self.target)
        self.assertEqual({x['path']: x['existed'] for x in record['files']}, {
            'deploy/baota/start.mjs': True,
            'dist/workbuddy-integrated-studio.html': True,
            'dist/new-module.js': False,
            'deploy/baota/.env.example': False,
        })

    def test_tampered_package_is_rejected_before_any_target_change(self):
        # A valid changed server precedes the tampered file in manifest order.
        # Validation must complete before writing even that earlier valid file.
        (self.source / 'dist/workbuddy-integrated-studio.html').write_bytes(b'tampered')
        result = self.run_update(apply=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('dist/workbuddy-integrated-studio.html', result.stderr)
        self.assert_untouched()

    def test_traversal_and_absolute_paths_are_rejected_before_writes(self):
        for bad_path in ('../outside.txt', 'dist/../../outside.txt', str(self.root / 'absolute.txt')):
            with self.subTest(path=bad_path):
                original = dict(self.manifest)
                self.manifest[bad_path] = {'bytes': 0, 'sha256': hashlib.sha256(b'').hexdigest()}
                self.write_manifest()
                result = self.run_update(apply=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('ValueError', result.stderr)
                self.assert_untouched()
                self.assertFalse((self.root / 'outside.txt').exists())
                self.assertFalse((self.root / 'absolute.txt').exists())
                self.manifest = original

    def test_protected_paths_are_rejected_before_writes(self):
        for bad_path in (
            '.env', 'nested/.env', 'projects/current.json',
            'workbench-data/project.json', 'node_modules/module.js',
            '.venv/bin/python', 'outputs/export.docx', 'qa/project.json', '.git/config',
        ):
            with self.subTest(path=bad_path):
                original = dict(self.manifest)
                self.manifest[bad_path] = {'bytes': 0, 'sha256': hashlib.sha256(b'').hexdigest()}
                self.write_manifest()
                result = self.run_update(apply=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('ValueError', result.stderr)
                self.assert_untouched()
                self.manifest = original


if __name__ == '__main__':
    unittest.main(verbosity=2)
