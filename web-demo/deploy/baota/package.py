"""Build an allowlisted upload ZIP without local data, credentials or dependencies."""
from pathlib import Path
import re, json, zipfile, hashlib, datetime, argparse

parser=argparse.ArgumentParser()
parser.add_argument('--base-path',default='/')
parser.add_argument('--proxy-strips-prefix',action='store_true',help='Existing Nginx removes the public prefix before forwarding')
parser.add_argument('--name',default='structure-workbench-linux-baota.zip')
parser.add_argument('--guide',default='更新说明.md',choices=['更新说明.md','计算书更新说明.md'])
args=parser.parse_args()
if not re.fullmatch(r'/(?:[A-Za-z0-9_-]+/)*',args.base_path):
    parser.error('--base-path must start and end with /')
if Path(args.name).name!=args.name or not args.name.endswith('.zip'):
    parser.error('--name must be a ZIP filename')

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'outputs' / 'baota'
OUT.mkdir(parents=True, exist_ok=True)
EXT = r'(?:m?js|jsx|tsx|ts|css|html|json|png|jpg|svg|woff2|py|ps1|docx)'
LITERAL = re.compile(r'''["']([^"'\n\r<>]+?\.''' + EXT + r'''(?:\?[^"'\n]*)?)["']''')

def allowed(p):
    try: rel = p.resolve().relative_to(ROOT)
    except ValueError: return False
    return p.is_file() and not any(x.startswith('.') or x in ('node_modules','qa','outputs','dist','tmp') or x.startswith(('backup-','baseline-')) for x in rel.parts) and not p.name.endswith(('.test.mjs','.test.js'))

def closure(seeds):
    pending = list(seeds); found = set()
    while pending:
        p = pending.pop().resolve()
        if p in found or not allowed(p): continue
        found.add(p)
        if p.suffix not in ('.js','.mjs','.jsx','.ts','.tsx','.css','.html','.py'): continue
        content = p.read_text(encoding='utf-8', errors='replace')
        for raw in LITERAL.findall(content):
            raw = raw.split('?')[0]
            if '://' in raw or '${' in raw or ':' in raw: continue
            for candidate in [p.parent/raw, ROOT/raw.lstrip('/')]:
                if allowed(candidate): pending.append(candidate)
    return found

server = closure([ROOT/'deploy/baota/start.mjs',ROOT/'server/reference-docx.py',ROOT/'scripts/build-calculation-book.py'])
# Python path compositions aren't JavaScript string-literal imports.
server.update(ROOT/p for p in ['design/reference-expansion/base.docx','design/reference-expansion/native-tables.json','assets/calculation-book/cover-reference.docx'])
front = closure([ROOT/'workbuddy-integrated-studio.html',ROOT/'design/parallel-tasks/06-ppt-report/prototype.html'])
files = {}
for p in server | front: files[p.relative_to(ROOT).as_posix()] = p.read_bytes()
for p in (ROOT/'dist').rglob('*'):
    if p.is_file(): files[p.relative_to(ROOT).as_posix()] = p.read_bytes()
# Vite deliberately does not bundle classic scripts. Include their actual dependencies.
for p in front:
    rel = 'dist/'+p.relative_to(ROOT).as_posix()
    if rel not in files and p.suffix in ('.js','.css','.json','.png','.jpg','.svg','.woff2'): files[rel] = p.read_bytes()
# The current checkout no longer contains this old optional method script.
# Remove only its stale tag in the delivery copy; retain the user's source HTML.
for name in list(files):
    if name.endswith('.html'):
        files[name]=files[name].replace(b'<script src="./expansion-design-method.v1.js"></script>',b'')
for name in ['.env.example','install.sh','requirements.txt','nginx-location.conf','nginx-work.conf','部署说明.md','更新说明.md']:
    files['deploy/baota/'+name]=(ROOT/'deploy/baota'/(args.guide if name=='更新说明.md' else name)).read_bytes()
package = json.loads((ROOT/'package.json').read_text(encoding='utf-8'))
package['scripts']['start']='node deploy/baota/start.mjs'
package['engines']={'node':'>=22.12.0'}
files['package.json']=json.dumps(package,ensure_ascii=False,indent=2).encode('utf-8')
files['pnpm-lock.yaml']=(ROOT/'pnpm-lock.yaml').read_bytes()
files['先读我.md']=(ROOT/'deploy/baota/部署说明.md').read_bytes()
files['deployment.json']=json.dumps({'basePath':'/' if args.proxy_strips_prefix else args.base_path,'publicBasePath':args.base_path,'proxyStripsPrefix':args.proxy_strips_prefix,'builtAt':datetime.datetime.now(datetime.timezone.utc).isoformat()},indent=2).encode('utf-8')
files['dist/workbench-version.json']=json.dumps({'release':args.name.removesuffix('.zip'),'builtAt':datetime.datetime.now(datetime.timezone.utc).isoformat()},indent=2).encode('utf-8')
if args.base_path!='/':
    # Rewrite only browser-delivered literals. Backend API registrations stay /api/.
    # Vite uses relative asset paths, including the nested PPT iframe.
    for name in list(files):
        if name.startswith('dist/') and Path(name).suffix in ('.js','.html','.css'):
            files[name]=re.sub(rb'([\x22\x27\x60])/api/',lambda m:m[1]+args.base_path.encode()+b'api/',files[name])
    files['先读我.md']=(ROOT/'deploy/baota'/args.guide).read_bytes()
    if args.proxy_strips_prefix:
        files['deploy/baota/nginx-work.conf']=(ROOT/'deploy/baota/nginx-work-existing.conf').read_bytes()
manifest={name:{'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()} for name,data in sorted(files.items())}
files['package-manifest.json']=json.dumps(manifest,ensure_ascii=False,indent=2).encode('utf-8')
archive=OUT/args.name
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED) as z:
    for name,data in sorted(files.items()):
        assert not any(part in ('qa','outputs','node_modules','.git','.env') for part in Path(name).parts)
        z.writestr('structure-workbench/'+name,data)
    z.writestr('UPDATE.py',(ROOT/'deploy/baota/update.py').read_bytes())
    z.writestr('先读我.md',files['先读我.md'])
print(json.dumps({'archive':str(archive),'files':len(files),'MB':round(archive.stat().st_size/1024**2,2)},ensure_ascii=False))
