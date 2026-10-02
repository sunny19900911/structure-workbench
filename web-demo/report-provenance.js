import {referenceText} from './reference-report.js';

// Presentation only: source colours never become Word formatting or project facts.
export function lineSource(state, section, line) {
  if (!line.trim() || /^\d+\.\d+\s|^\d+\.\d+\.\d+\s|\[\[|\{\{/.test(line)) return '';
  if (!referenceText(state, section).split('\n').includes(line)) return '';
  if (state.sections?.[section]?.manualSourceLines?.includes(line)) return '';
  if (section === 'overview' && /^(本工程为|本项目建设地点|总建筑面积|各单体建筑面积)/.test(line)) return 'bldg';
  if (section === 'ground' && state.document?.geotech?.text) return 'geo';
  if (section === 'foundation' && state.document?.foundation?.includes(line)) return 'geo';
  if (section === 'loads' && state.document?.waterText?.includes(line)) return 'geo';
  if (section === 'basis' && state.document?.geotech?.report && line.includes(state.document.geotech.report)) return 'geo';
  return '';
}

export function parameterSource(state, key) {
  const original=state.document?.parameters?.[key];
  const normalize=v=>String(v??'').normalize('NFKC').replace(/类|场地|\s/g,'');
  return original && normalize(original)===normalize(state.parameters?.[key]||original) ? 'geo' : '';
}

export function selectionParts(state,line) {
  if (!referenceText(state,'selection').split('\n').includes(line) || state.sections?.selection?.manualSourceLines?.includes(line)) return null;
  const pos=line.indexOf('结构类型：');
  if(pos<0 || /^\d+\./.test(line) || line.includes('{{')) return null;
  const unit=state.document?.units?.find(u=>line.startsWith(u.name+'层数为'));
  if(!unit)return null;
  const original=unit.structuralType;
  return [{text:line.slice(0,pos),source:'bldg'},{text:line.slice(pos),source:original && !state.unitParameters?.[unit.name]?.struct_sys ? 'geo' : ''}];
}

export function tableSource(key, row, ri, ci, state={}) {
  if (!row.values[ci] || row.manual?.[ci]) return '';
  if (key === 'units' && ri >= 2) return 'bldg';
  if (key === 'soil' && ri >= 2 || key === 'site' && ri >= 1) return 'geo';
  if (key === 'grades' && ri >= 2 && ci === 0) return 'bldg';
  if (['earthquake','parameters'].includes(key) && ri>0 && ci===1) {
    const field={'抗震设防烈度':'intensity','基本地震加速度':'pga','设计地震分组':'eq_group','场地类别':'site_class','场地土类别':'site_class'}[row.values[0]];
    return field ? parameterSource(state,field) : '';
  }
  if (key === 'metrics') {
    if (ri >= 3 && ri <= 8) return ci >= 2 ? 'yjk' : '';
    if ([0,1,9,10,11,12,13,14,15,16,17,18,19,20,21,22].includes(ri)) return ci >= row.values.length - (ri >= 11 ? 2 : 1) ? 'yjk' : '';
  }
  return '';
}
