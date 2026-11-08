"""Reproducible Windows x64 local edition. No user projects or credentials enter it."""
from pathlib import Path
import argparse,hashlib,importlib.metadata as md,json,os,re,shutil,subprocess,sys,tarfile,time,urllib.request,zipfile

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'outputs'/'portable'
parser=argparse.ArgumentParser()
parser.add_argument('--python-runtime',required=True)
parser.add_argument('--poppler-runtime',required=True)
parser.add_argument('--node',default=shutil.which('node'))
parser.add_argument('--name',default='结构工作台离线MCP版-20261108')
parser.add_argument('--stage-only',action='store_true')
parser.add_argument('--data-folder',help='Optional independent per-user data folder for a local preview')
args=parser.parse_args()
if args.data_folder and not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,60}',args.data_folder):raise ValueError('Invalid data folder')
if Path(args.name).name!=args.name or any(c in args.name for c in '\\/:'):raise ValueError('Invalid package name')
OUT.mkdir(parents=True,exist_ok=True)
CACHE=OUT/'download-cache';CACHE.mkdir(exist_ok=True)
stage=OUT/(args.name+'-build-'+time.strftime('%H%M%S'))
stage.mkdir(exist_ok=False)
if args.data_folder:(stage/'data-folder.txt').write_text(args.data_folder,encoding='utf-8')
app=stage/'app';app.mkdir()
sources=[]

def download(url,name):
    dest=CACHE/name
    if not dest.exists():
        for attempt in range(3):
            try:
                request=urllib.request.Request(url,headers={'User-Agent':'StructureWorkbench/portable-builder'})
                with urllib.request.urlopen(request,timeout=60) as response:raw=response.read()
                dest.write_bytes(raw);break
            except Exception:
                if attempt==2:raise
                time.sleep(2)
    sources.append({'url':url,'file':name,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest()})
    return dest

# Reuse the reviewed allowlist, then add the portable-specific APIs and launcher.
subprocess.run([sys.executable,str(ROOT/'deploy/baota/package.py'),'--name','portable-app-base.zip'],cwd=ROOT,check=True)
with zipfile.ZipFile(ROOT/'outputs/baota/portable-app-base.zip') as archive:
    for item in archive.infolist():
        if not item.filename.startswith('structure-workbench/'):continue
        relative=Path(item.filename).relative_to('structure-workbench')
        if relative.name=='.env.example' or relative.parts[:2]==('deploy','baota') and relative.suffix not in ('.mjs','.py'):continue
        dest=app/relative;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(archive.read(item))
for folder in ['server','deploy/portable']:
    for original in (ROOT/folder).rglob('*'):
        if not original.is_file() or original.suffix not in ('.mjs','.js','.py','.ps1','.md') or '.test.' in original.name:continue
        dest=app/original.relative_to(ROOT);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(original,dest)
for name in ['portable-projects-ui.js']:
    shutil.copy2(ROOT/name,app/'dist'/name)
for path in app.rglob('*.ps1'):
    text=path.read_text(encoding='utf-8-sig');path.write_text(text,encoding='utf-8-sig')
for name in ['launch.ps1','启动工作台.cmd','启动工作台.vbs','生成MCP配置.cmd','使用说明.txt']:
    original=ROOT/'deploy/portable'/name
    data=original.read_text(encoding='utf-8')
    # Windows PowerShell 5 and WSH need an explicit encoding for Chinese text.
    encoding='utf-16' if name.endswith('.vbs') else 'utf-8-sig' if name.endswith('.ps1') else 'utf-8'
    (stage/name).write_text(data,encoding=encoding,newline='\r\n')
subprocess.run([args.node,str(ROOT/'deploy/portable/copy-node-deps.mjs'),str(ROOT),str(app)],check=True)

# Vendor browser libraries, including Chinese PDF maps and local OCR language data.
assets=[
 ('xlsx','0.18.5',[('dist/xlsx.full.min.js','xlsx.full.min.js'),('LICENSE','LICENSE')]),
 ('pdfjs-dist','3.11.174',[('build/pdf.min.js','pdf.min.js'),('build/pdf.worker.min.js','pdf.worker.min.js'),('cmaps/','cmaps/'),('standard_fonts/','standard_fonts/'),('LICENSE','LICENSE')]),
 ('tesseract.js','5.1.1',[('dist/tesseract.min.js','tesseract.min.js'),('dist/worker.min.js','worker.min.js'),('LICENSE','LICENSE')]),
 ('tesseract.js-core','5.1.1',[('tesseract-core','tesseract-core'),('LICENSE','LICENSE')]),
]
for package,version,mappings in assets:
    archive=download(f'https://registry.npmjs.org/{package}/-/{package}-{version}.tgz',f'{package}-{version}.tgz')
    folder={'pdfjs-dist':'pdfjs','tesseract.js':'tesseract','tesseract.js-core':'tesseract-core'}.get(package,package)+'-'+version
    with tarfile.open(archive,'r:gz') as tar:
        for member in tar.getmembers():
            if not member.isfile() or not member.name.startswith('package/'):continue
            rel=member.name[8:]
            for source,destination in mappings:
                prefix=source.endswith('/') or source=='tesseract-core'
                if rel==source or prefix and rel.startswith(source):
                    tail=rel[len(source):] if prefix else ''
                    if '..' in Path(tail).parts:raise ValueError('Invalid dependency archive')
                    dest=app/'dist/vendor'/folder/(destination+tail);dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(tar.extractfile(member).read());break
for lang in ['chi_sim','eng']:
    original=download(f'https://tessdata.projectnaptha.com/4.0.0/{lang}.traineddata.gz',lang+'.traineddata.gz')
    dest=app/'dist/vendor/tessdata-4.0.0'/original.name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(original,dest)

# Python's isolated search path prevents dependence on the author's installation.
py=Path(args.python_runtime).resolve();target=stage/'runtime/python';target.mkdir(parents=True)
for p in py.iterdir():
    if p.is_file() and (p.suffix in ('.dll','.exe') or p.name=='LICENSE.txt'):shutil.copy2(p,target/p.name)
shutil.copytree(py/'DLLs',target/'DLLs',ignore=shutil.ignore_patterns('__pycache__','*.pyc','_tkinter.pyd'))
version=subprocess.check_output([str(py/'python.exe'),'-c','import sys;print(str(sys.version_info.major)+str(sys.version_info.minor))'],text=True).strip()
with zipfile.ZipFile(target/('python'+version+'.zip'),'w',zipfile.ZIP_DEFLATED) as archive:
    for p in (py/'Lib').rglob('*'):
        rel=p.relative_to(py/'Lib')
        if p.is_file() and p.suffix!='.pyc' and not any(x in ('site-packages','__pycache__','test','tests','idlelib','tkinter','turtledemo','ensurepip') for x in rel.parts):archive.write(p,rel.as_posix())
(target/('python'+version+'._pth')).write_text('python'+version+'.zip\nDLLs\nLib/site-packages\n.\nimport site\n',encoding='utf-8')
site=py/'Lib/site-packages';records=[]
for name in ['python-docx','lxml','Pillow','openpyxl','et_xmlfile','typing_extensions','pypdf']:
    dist=next((d for d in md.distributions(path=[str(site)]) if d.metadata['Name'].lower().replace('-','_')==name.lower().replace('-','_')),None)
    if not dist:raise RuntimeError('Python dependency missing: '+name)
    records.append({'name':name,'version':dist.version})
    for relative in dist.files or []:
        if '..' in relative.parts or '__pycache__' in relative.parts or str(relative).endswith('.pyc'):continue
        source=site/relative
        if source.is_file():dest=target/'Lib/site-packages'/relative;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,dest)
(target/'dependencies.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
subprocess.run([str(target/'python.exe'),'-I','-c','import docx,lxml,PIL,openpyxl,pypdf;print("portable python OK")'],check=True)
nodeTarget=stage/'runtime/node';nodeTarget.mkdir();shutil.copy2(args.node,nodeTarget/'node.exe')
nodeVersion=subprocess.check_output([args.node,'--version'],text=True).strip()
shutil.copy2(download(f'https://nodejs.org/dist/{nodeVersion}/SHASUMS256.txt','node-'+nodeVersion+'-SHASUMS256.txt'),nodeTarget/'upstream-SHASUMS256.txt')
shutil.copy2(download(f'https://raw.githubusercontent.com/nodejs/node/{nodeVersion}/LICENSE','node-'+nodeVersion+'-LICENSE'),nodeTarget/'LICENSE')
pop=Path(args.poppler_runtime).resolve();shutil.copytree(pop,stage/'runtime/poppler',ignore=shutil.ignore_patterns('include','cmake','pkgconfig','*.lib','*.pdb'))

shutil.copy2(ROOT/'design/mcp/连接与使用.md',stage/'MCP连接与使用.md')
shutil.copy2(ROOT/'design/mcp/接口清单.json',stage/'MCP接口清单.json')
if (ROOT/'design/mcp/structure-workbench-skill').exists():
    shutil.copytree(ROOT/'design/mcp/structure-workbench-skill',stage/'MCP结构设计Skill')
release=re.search(r"export const RELEASE='([^']+)'",(ROOT/'deploy/portable/runtime.mjs').read_text(encoding='utf-8')).group(1)
if (ROOT/'node_modules/superdoc/LICENSE').is_file():
    notice=stage/'第三方组件';notice.mkdir(exist_ok=True)
    shutil.copy2(ROOT/'node_modules/superdoc/LICENSE',notice/'SuperDoc-1.47.2-LICENSE.txt')
    (notice/'SuperDoc来源.txt').write_text('SuperDoc 1.47.2\nAGPL-3.0\nhttps://registry.npmjs.org/superdoc/-/superdoc-1.47.2.tgz\nhttps://github.com/superdoc/docx-editor\n本包为本机开发试用；正式对外分发前应完成对应源码与项目许可证整理。\n',encoding='utf-8')
manifest={'product':'结构工程办公工作台（本机试用）','version':release,'platform':'Windows x64','node':nodeVersion,'python':version,'buildDate':'2026-11-08','dataLocation':'%LOCALAPPDATA%/'+(args.data_folder or 'StructureWorkbench'),'sources':sources}
(stage/'发行版本.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
files={}
for p in stage.rglob('*'):
    if not p.is_file():continue
    rel=p.relative_to(stage).as_posix()
    if any(part in ('.env','qa','outputs','.git') for part in p.relative_to(stage).parts) or p.suffix in ('.pem','.key'):raise ValueError('Disallowed release file: '+rel)
    files[rel]={'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
(stage/'文件校验清单.json').write_text(json.dumps(files,ensure_ascii=False),encoding='utf-8')
if not args.stage_only:
    output=OUT/(args.name+'.zip')
    with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
        for p in stage.rglob('*'):
            if p.is_file():archive.write(p,args.name+'/'+p.relative_to(stage).as_posix())
    print(json.dumps({'archive':str(output),'MB':round(output.stat().st_size/1024**2,1),'files':len(files),'stage':str(stage)},ensure_ascii=False))
else:print(json.dumps({'stage':str(stage),'files':len(files)},ensure_ascii=False))
