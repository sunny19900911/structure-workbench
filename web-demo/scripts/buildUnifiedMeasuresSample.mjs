import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Packer } from 'docx';
import { buildUnifiedMeasuresDocument } from '../src/docxExporter.js';
import { humanMeasureGroups, referenceDocuments } from '../src/data/projectData.js';

const workingParameters = {
  intensity: '8度',
  pga: '0.20',
  designGroup: '第三组',
  basicWind: '0.30',
  basicSnow: '0.30',
  snowZone: 'Ⅲ',
  diningLiveLoad: '3.0',
};

function projectValue(row) {
  if (row.item === '抗震设防参数') return `${workingParameters.intensity}；${workingParameters.pga}g；${workingParameters.designGroup}；Ⅲ类场地`;
  if (row.item === '食堂、餐厅') return `${workingParameters.diningLiveLoad}kN/m²`;
  if (row.item === '基本风压') return `${workingParameters.basicWind}kN/m²；地面粗糙度B类`;
  if (row.item === '基本雪压') return `${workingParameters.basicSnow}kN/m²；准永久值分区${workingParameters.snowZone}`;
  return row.project;
}

const groups = humanMeasureGroups.map((group) => ({
  ...group,
  rows: group.rows.map((row) => ({ ...row, project: projectValue(row) })),
}));
const references = Object.entries(referenceDocuments).map(([source_id, reference]) => ({ source_id, ...reference }));
const document = buildUnifiedMeasuresDocument({ groups, references });
const outputDir = resolve('outputs');
const outputPath = resolve(outputDir, '2号学生食堂_结构计算统一措施_A3横向双栏_示例.docx');

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, await Packer.toBuffer(document));
console.log(outputPath);
