// SuperDoc 1.47.2 may emit w15:restartNumberingAfterBreak without declaring
// w15 in numbering.xml after creating a list. Repair only that known omission.
export function normalizeNumberingNamespace(xml) {
 if(!/\bw15:restartNumberingAfterBreak\s*=/.test(xml)||/\bxmlns:w15\s*=/.test(xml))return xml;
 return xml.replace(/<w:numbering(?=[\s>])/, '<w:numbering xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"');
}

export async function normalizeWordExport(blob,Zip) {
 if(!Zip)throw Error('DOCX 打包组件未加载，未保存。');
 const zip=await Zip.loadAsync(blob),part=zip.file('word/numbering.xml');
 if(!part)return blob;
 const original=await part.async('string'),fixed=normalizeNumberingNamespace(original);
 const parsed=new DOMParser().parseFromString(fixed,'application/xml');
 if(parsed.querySelector('parsererror'))throw Error('DOCX 列表编号格式无效，当前修改未保存。');
 if(fixed===original)return blob;
 zip.file('word/numbering.xml',fixed);
 return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',compression:'DEFLATE'});
}
