import {browserOperation} from './mcp-browser-operations.js';
export const bridgeError=(message,code='INVALID_ARGUMENT',status=400)=>Object.assign(Error(message),{code,status});
const forbidden=new Set(['__proto__','prototype','constructor']);
export function validateBridgeValue(value,schema,path='args'){
 if(schema.const!==undefined&&value!==schema.const)throw bridgeError(path+'必须为'+schema.const);
 if(schema.enum&&!schema.enum.includes(value))throw bridgeError(path+'取值不支持');
 if(schema.type){const kinds=Array.isArray(schema.type)?schema.type:[schema.type];const actual=value===null?'null':Array.isArray(value)?'array':typeof value;if(!kinds.includes(actual)&&!(actual==='number'&&Number.isInteger(value)&&kinds.includes('integer')))throw bridgeError(path+'类型不正确');}
 if(typeof value==='string'&&(schema.maxLength!==undefined&&value.length>schema.maxLength))throw bridgeError(path+'内容过长');
 if(typeof value==='number'&&(!Number.isFinite(value)||schema.minimum!==undefined&&value<schema.minimum||schema.maximum!==undefined&&value>schema.maximum||schema.exclusiveMinimum!==undefined&&value<=schema.exclusiveMinimum))throw bridgeError(path+'数值超出范围');
 if(Array.isArray(value)){if(schema.minItems!==undefined&&value.length<schema.minItems||schema.maxItems!==undefined&&value.length>schema.maxItems)throw bridgeError(path+'数量超出范围');for(const [i,item]of value.entries())validateBridgeValue(item,schema.items||{},path+'['+i+']');}
 if(value&&typeof value==='object'&&!Array.isArray(value)){for(const key of schema.required||[])if(!Object.hasOwn(value,key))throw bridgeError(path+'缺少'+key);for(const [key,item]of Object.entries(value)){if(forbidden.has(key))throw bridgeError('不支持的字段名');const child=schema.properties?.[key]||schema.additionalProperties;if(child===false||child===undefined&&schema.additionalProperties===false)throw bridgeError(path+'包含未知字段'+key);if(child&&typeof child==='object')validateBridgeValue(item,child,path+'.'+key);}}
 return value;
}
export function validateBridgeRequest(task){const operation=browserOperation(task.operation);if(!operation)throw bridgeError('未知工作台操作');if(!/^[a-f0-9]{32}$/.test(task.projectId||''))throw bridgeError('项目ID无效');if(operation.requiresUnit&&task.unit===undefined)throw bridgeError('此操作必须显式指定unit；整体使用项目整体','UNIT_REQUIRED');if(task.unit!==undefined&&(typeof task.unit!=='string'||!task.unit.trim()||task.unit.length>120||forbidden.has(task.unit)))throw bridgeError('单体名称无效');validateBridgeValue(task.args||{},operation.schema);return operation;}
export function validateRevisionSnapshot(spec,expected,remote,local,expansionPart){
 for(const name of spec.requiredParts){const part=name==='expansion'?expansionPart:name==='assets'?'portable-assets':name;const supplied=expected?.[part];if(!Number.isInteger(supplied)||supplied<0)throw bridgeError('请先读取project.context并提交'+part+'修订','REVISION_REQUIRED',409);if(supplied!==(remote[part]||0))throw bridgeError(part+'已保存新版本，请重新读取','REVISION_CONFLICT',409);}
 for(const [part,revision]of Object.entries(local))if(Number.isInteger(revision)&&revision!==(remote[part]||0))throw bridgeError('网页'+part+'版本已落后，请先在网页载入最新保存','BROWSER_STALE',409);
}
export function checkedImage(data){if(typeof data!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(data)||data.length>5700000)throw bridgeError('请选择不超过4MB的PNG/JPEG/WebP图片');return data;}
export function validateProtectedRewrite(original,text){
 for(const marker of String(original).match(/\{\{[pfmrt]:[^{}]+\}\}|\[\[(?:table|image|measures):[^\]]+\]\]/g)||[])if(!text.includes(marker))throw bridgeError('改写丢失受保护引用或图表位置：'+marker,'PROTECTED_REFERENCE');
 if(/<\/?(?:script|iframe|object|style)\b/i.test(text))throw bridgeError('正文含不允许的标记');
}
export function validateSeismicUpdate({previous={},values={},heightBasis}){
 if(Object.hasOwn(values,'height')&&String(values.height??'').trim()&&heightBasis!=='main-roof-above-outdoor')throw bridgeError('输入房屋高度时需明确heightBasis=main-roof-above-outdoor（室外地面至主要屋面板顶），不能用消防或规划高度','HEIGHT_BASIS_REQUIRED');
 const merged={...previous,...values};
 if(String(merged.height??'').trim()&&(!merged.basis||merged.basis==='auto')&&!['residential','other'].includes(merged.buildingUse))throw bridgeError('自动选抗规/高规需明确buildingUse为residential或other','BUILDING_USE_REQUIRED');
 return merged;
}
