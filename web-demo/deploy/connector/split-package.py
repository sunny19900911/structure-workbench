"""Split an already verified portable bundle into a web base and optional connector."""
from pathlib import Path
import argparse, hashlib, json, zipfile

root=Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('--source',required=True);a=p.parse_args()
out=root/'outputs/portable';out.mkdir(exist_ok=True)
base='结构工作台-离线网页版-20261110';addon='结构工作台-小黑箱连接包-20261110'
base_readme='''结构工作台 · 离线网页版

完整解压后，双击“启动工作台.cmd”。
无需安装WorkBuddy或Kimi，无需部署网站。浏览器打开本机工作台，可导入资料、编制及导出成果。
程序附带本地运行组件，因此不是只有一个HTML文件。项目独立保存在各自电脑的 %LOCALAPPDATA%\\StructureWorkbench。

需要自然语言调用：另下载“小黑箱连接包”，与本文件夹放在一起后启动小黑箱。
两种入口共用运行环境和项目数据。后续更新运行环境只需更新本包。

旧DOC转换、精确Word分页依赖本机Word；扫描件增强OCR仍需配置本机识别环境。
'''
excluded={'启动小黑箱.cmd','生成MCP配置.cmd','MCP连接与使用.md','MCP接口清单.json','文件校验清单.json','使用说明.txt'}
manifest={}
def add(z,folder,name,data):
 z.writestr(folder+'/'+name,data)
 manifest[name]={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
with zipfile.ZipFile(a.source) as src,zipfile.ZipFile(out/(base+'.zip'),'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for info in src.infolist():
  parts=info.filename.split('/',1)
  if len(parts)!=2:continue
  rel=parts[1]
  if rel in excluded or rel.startswith('MCP结构设计Skill/'):continue
  add(z,base,rel,src.read(info))
 add(z,base,'使用说明.txt',base_readme.encode('utf-8-sig'))
 z.writestr(base+'/文件校验清单.json',json.dumps(manifest,ensure_ascii=False).encode())
base_count=len(manifest);manifest={}
with zipfile.ZipFile(out/(addon+'.zip'),'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for name in ['connect.ps1','启动小黑箱.cmd','使用说明.txt']:
  data=(root/'deploy/connector'/name).read_text('utf-8').replace('\r\n','\n').replace('\n','\r\n').encode('utf-8-sig' if name.endswith('.ps1') else 'utf-8')
  add(z,addon,name,data)
 z.writestr(addon+'/文件校验清单.json',json.dumps(manifest,ensure_ascii=False).encode())
for name in [base,addon]:
 path=out/(name+'.zip')
 with zipfile.ZipFile(path) as z:
  check=json.loads(z.read(name+'/文件校验清单.json'))
  for rel,item in check.items():assert hashlib.sha256(z.read(name+'/'+rel)).hexdigest()==item['sha256'],rel
 print(json.dumps({'path':str(path),'bytes':path.stat().st_size,'files':len(check)},ensure_ascii=False))
