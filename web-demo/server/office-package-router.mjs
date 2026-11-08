import {inspectOfficePackage,editOfficePackage} from './office-package.mjs';
import {inspectExcelPackage,editExcelPackage} from './office-excel-package.mjs';
import {inspectPptPackage,editPptPackage} from './office-ppt-package.mjs';
export const inspectPackage=(bytes,type,env)=>type==='xlsx'?inspectExcelPackage(bytes,env):type==='pptx'?inspectPptPackage(bytes,type,env):inspectOfficePackage(bytes,type,env);
export const editPackage=(bytes,type,command,env)=>type==='xlsx'?editExcelPackage(bytes,command,env):type==='pptx'?editPptPackage(bytes,type,command,env):editOfficePackage(bytes,type,command,env);
