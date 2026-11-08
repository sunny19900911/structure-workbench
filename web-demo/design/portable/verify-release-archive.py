"""Read-only release ZIP verification, independent from the packaging command."""
import hashlib
import json
import sys
import zipfile
from pathlib import Path, PurePosixPath

archive=Path(sys.argv[1]).resolve()
output=Path(sys.argv[2]).resolve()
blocked_dirs={'qa','outputs','.git','.codex','.aws','workbench-data','projects','project-assets','calculation-uploads','603-进行项目'}
blocked_names={'.env','.env.local','preferences.json','credentials.json','token.json','api_key','client_id','id_rsa','id_ed25519'}
with zipfile.ZipFile(archive) as z:
    names=z.namelist()
    assert names and len(names)==len(set(names)),'Duplicate or empty archive'
    roots={PurePosixPath(n).parts[0] for n in names}
    assert len(roots)==1,'Archive has multiple roots'
    root=roots.pop()
    violations=[]
    for n in names:
        p=PurePosixPath(n)
        if p.is_absolute() or '..' in p.parts or '\\' in n or ':' in n:
            violations.append(n)
        lowered=[x.lower() for x in p.parts]
        if any(x in blocked_dirs for x in lowered) or p.name.lower() in blocked_names or p.suffix.lower() in {'.pem','.key','.pfx','.p12'}:
            violations.append(n)
    # Do not open any credential-like member if a packaging violation is found.
    assert not violations,'Disallowed private/data paths in archive: '+repr(violations)
    manifest_name=root+'/文件校验清单.json'
    manifest=json.loads(z.read(manifest_name))
    assert isinstance(manifest,dict),'Invalid checksum manifest'
    expected={root+'/'+key for key in manifest}|{manifest_name}
    assert set(names)==expected,'Manifest does not cover exactly all release files'
    for name,record in manifest.items():
        member=z.getinfo(root+'/'+name)
        assert member.file_size==record['bytes'],('Declared size mismatch',name)
        digest=hashlib.sha256()
        with z.open(member) as stream:
            while data:=stream.read(1024*1024):
                digest.update(data)
        assert digest.hexdigest()==record['sha256'],('SHA256 mismatch',name)
    # Every z.open above checks CRC; testzip independently traverses all members.
    bad=z.testzip()
    assert bad is None,('ZIP CRC mismatch',bad)
    result={'passed':True,'archive':str(archive),'archiveBytes':archive.stat().st_size,'archiveSha256':hashlib.file_digest(archive.open('rb'),'sha256').hexdigest(),'zipEntries':len(names),'manifestFiles':len(manifest),'crc':'all passed','manifestSha256':'all passed','privateDataPathCheck':'No QA, project data, preferences, credential or private-key paths present','root':root}
output.parent.mkdir(parents=True,exist_ok=True)
output.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=True))
