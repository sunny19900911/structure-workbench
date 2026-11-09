// Route source documents only; this does not infer or adopt engineering values.
export function documentKind(name,text=''){
 const heading=String(text).slice(0,12000);
 const geo=/岩土工程勘察报告|岩土工程勘察|工程地质勘察报告|地质勘察报告|地勘报告/;
 const building=/建筑设计总说明|建筑设计说明|建筑施工图设计说明|建筑专业设计说明|建筑总说明|建筑说明/;
 const hasGeo=geo.test(heading),hasBuilding=building.test(heading);
 if(hasGeo&&!hasBuilding)return 'geo';
 if(hasBuilding&&!hasGeo)return 'bldg';
 const geoName=/地勘|勘察|岩土/.test(name),buildingName=/建筑|建施/.test(name);
 if(geoName&&!buildingName)return 'geo';
 if(buildingName&&!geoName)return 'bldg';
 // Repeated domain words are insufficient to distinguish a combined report.
 return null;
}

export function isModelFile(name,text=''){
 if(/\.(out|dat)$/i.test(name))return true;
 if(!/\.(txt|md)$/i.test(name))return false;
 if(/(?:^|[^A-Z])(?:WMASS|WZQ|WDISP)(?:[^A-Z]|$)/i.test(name))return true;
 return /设计参数输出[\s\S]*地震信息|结构总质量|恒载总质量|振型[^\n]*周期|层间位移角[^\n]*位移比/.test(String(text));
}
