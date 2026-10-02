import {existsSync,readFileSync,statSync} from 'node:fs';

// Server-only: never copy the credential into the repository or return it to the browser.
export function localDeepSeekConfig(env={},io={existsSync,readFileSync,statSync}){
  if(env.DEEPSEEK_API_KEY?.trim())return env;
  const path=env.DEEPSEEK_API_KEY_FILE||'E:/00-key/deep seek key.txt';
  if(!io.existsSync(path))return env;
  if(io.statSync(path).size>65536)throw Error('DeepSeek本地配置文件过大，请只保留所需密钥');
  const bytes=io.readFileSync(path);
  const text=bytes.toString(bytes[0]===255&&bytes[1]===254?'utf16le':'utf8');
  const keys=[...new Set(text.match(/\bsk-[A-Za-z0-9_-]{16,}\b/g)||[])];
  if(keys.length!==1)throw Error('DeepSeek本地配置未识别到唯一密钥，请检查指定文件；内容未输出');
  return {...env,DEEPSEEK_API_KEY:keys[0]};
}
