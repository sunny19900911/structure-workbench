import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Packer } from 'docx';
import { buildWorkBuddyDocument } from '../src/workbuddyDocxBuilder.js';

const snapshotPath = resolve('qa', 'mengbo-template', 'default-snapshot.json');
const outputDir = resolve('outputs');
const outputPath = resolve(outputDir, '云南旅游学校2号学生食堂_结构计算统一措施_A3横向双栏_版式验收样本.docx');
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, await Packer.toBuffer(buildWorkBuddyDocument(snapshot)));
console.log(outputPath);
