import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const here = path.dirname(fileURLToPath(import.meta.url));
const taskRoot = path.resolve(here, "..");
const outputDir = path.join(taskRoot, "outputs", "20260927-chart-refresh");
const outputPath = path.join(outputDir, "主楼钢筋用量_图表排版优化.xlsx");
const previewDir = path.join(taskRoot, "qa", "20260927-chart-refresh");
const font = "Arial";

const rows = [
  ["第1层",5172.58,129.739482,26.496951,66.888256,57.159059],
  ["第2层",5316.43,131.816725,39.603720,22.905579,52.689400],
  ["第3层",3644.74,85.010335,23.031753,16.050943,27.629750],
  ["第4层",3566.08,78.183146,18.752625,13.534346,26.699850],
  ["第5层",4030.40,92.643019,18.122747,8.523769,31.083160],
  ["第6层",3557.61,76.059826,16.135404,8.392113,26.665220],
  ["第7层",4030.40,91.885007,15.069824,8.348592,30.461770],
  ["第8层",3566.08,77.965220,11.560660,8.326150,26.764010],
  ["第9层",4030.40,114.725359,16.244305,9.032581,29.689270],
  ["第10层",3562.17,74.843387,9.632854,8.116605,21.443769],
  ["第11层",3562.17,81.292013,8.537683,8.205057,20.957979],
  ["第12层",3562.17,71.679433,8.672335,8.399154,25.372000],
  ["第13层",3562.17,31.676971,8.292784,7.124235,3.426130],
];

const workbook = Workbook.create();
const share = workbook.worksheets.add("用量总览");
const summary = workbook.worksheets.add("按楼层汇总");
const raw = workbook.worksheets.add("工程量来源");
raw.showGridLines=false;
raw.getRange("A1:F1").merge();
raw.getRange("A1").values=[["钢筋工程量来源（kg）"]];
raw.getRange("A2:F2").merge();
raw.getRange("A2").values=[["沿用任务四既有整理数据；source_id：LEGACY-105-MAIN-REBAR。"]];
raw.getRange("A3:F3").merge();
raw.getRange("A3").values=[["第1层板来源冲突及待复核说明见“用量总览”。"]];
raw.getRange("A5:F5").values=[["楼层","楼面面积(m²)","梁(kg)","柱(kg)","墙(kg)","板(kg)"]];
raw.getRange("A6:F18").values=rows.map(r=>r.map((v,i)=>i>1?v*1000:v));
raw.getRange("A1:F18").format.font={name:font,size:10,color:"#27384D"};
raw.getRange("A1").format.font={name:font,size:16,bold:true,color:"#20364F"};
raw.getRange("A1:F18").format.rowHeightPx=30;
raw.getRange("A:A").format.columnWidthPx=90;
raw.getRange("B:F").format.columnWidthPx=140;
raw.getRange("B6:B18").format.numberFormat="#,##0.00";
raw.getRange("C6:F18").format.numberFormat="#,##0.000";
raw.getRange("A5:F5").format={fill:"#365E85",font:{name:font,size:10,bold:true,color:"#FFFFFF"}};
raw.freezePanes.freezeRows(5);

summary.showGridLines = false;
summary.getRange("A1:H1").values = [["主楼钢筋用量（按构件汇总）",null,null,null,null,null,null,null]];
summary.getRange("A2:H2").values = [["来源：主楼钢筋用量.xls；梁含墙梁，墙含边缘构件和墙身。",null,null,null,null,null,null,null]];
summary.getRange("A3:H3").values = [["数据校验：第1层板来源合计为 21 kg，直径分项求和为 57,159.059 kg；本表按分项求和。",null,null,null,null,null,null,null]];
summary.getRange("A5:H5").values = [["楼层","楼面面积(m²)","梁(kg/m²)","柱(kg/m²)","墙(kg/m²)","板(kg/m²)","合计(kg/m²)","钢筋总量(kg)"]];
for(let r=6;r<=18;r++){
  summary.getRange(`A${r}:B${r}`).formulas=[[`='工程量来源'!A${r}`,`='工程量来源'!B${r}`]];
  for(const c of ['C','D','E','F']) summary.getRange(`${c}${r}`).formulas=[[`=IF(B${r}>0,'工程量来源'!${c}${r}/B${r},"待补面积")`]];
}
summary.getRange("G6").formulas = [['=IF(B6>0,SUM(C6:F6),"待补面积")']];
summary.getRange("G6:G18").fillDown();
summary.getRange("H6").formulas = [["=SUM('工程量来源'!C6:F6)"]];
summary.getRange("H6:H18").fillDown();
summary.getRange("A19:H19").values = [["汇总",null,null,null,null,null,null,null]];
summary.getRange("B19").formulas = [["=SUM(B6:B18)"]];
for(const c of ['C','D','E','F']) summary.getRange(`${c}19`).formulas=[[`=IF(B19>0,SUM('工程量来源'!${c}6:${c}18)/B19,"待补面积")`]];
summary.getRange("G19").formulas = [['=IF(B19>0,H19/B19,"待补面积")']];
summary.getRange("H19").formulas = [["=SUM(H6:H18)"]];

summary.getRange("A1:H19").format.font = {name:font,size:10,color:"#27384D"};
summary.getRange("A1").format.font = {name:font,size:16,bold:true,color:"#20364F"};
summary.getRange("A2:H2").format.font = {name:font,size:9,italic:true,color:"#66788A"};
summary.getRange("A3:H3").format = {fill:"#FFF4DF",font:{name:font,size:9,color:"#975F0D"}};
summary.getRange("A5:H5").format = {fill:"#365E85",font:{name:font,size:10,bold:true,color:"#FFFFFF"},horizontalAlignment:"center",verticalAlignment:"center",wrapText:true};
summary.getRange("A6:H18").format.borders = {insideHorizontal:{style:"thin",color:"#E2E8EF"}};
summary.getRange("A19:H19").format = {fill:"#EDF3F8",font:{name:font,size:10,bold:true,color:"#20364F"},borders:{top:{style:"thin",color:"#B9C8D7"}}};
summary.getRange("B6:B19").format.numberFormat = "#,##0.00";
summary.getRange("C6:G19").format.numberFormat = "#,##0.00";
summary.getRange("H6:H19").format.numberFormat = "#,##0.000";
summary.getRange("B6:H19").format.horizontalAlignment = "right";
summary.getRange("A6:A19").format.horizontalAlignment = "center";
summary.getRange("A1:H3").format.rowHeightPx = 24;
summary.getRange("A5:H5").format.rowHeightPx = 30;
summary.getRange("A:A").format.columnWidthPx = 82;
summary.getRange("B:B").format.columnWidthPx = 120;
summary.getRange("C:G").format.columnWidthPx = 92;
summary.getRange("H:H").format.columnWidthPx = 148;
summary.freezePanes.freezeRows(5);

/* Keep raw values and calculation pattern; redesign only the reader-facing report. */
summary.getRange("A1:H1").merge();
summary.getRange("A2:H2").merge();
summary.getRange("A3:H3").merge();
summary.getRange("A3").values = [["待复核：第1层板采用分项求和，原合计冲突详见“用量总览”。"]];
summary.getRange("A6:H19").format.rowHeightPx = 30;
summary.getRange("A5:H5").format.rowHeightPx = 38;
summary.getRange("A6:H18").format.borders = {insideHorizontal:{style:"thin",color:"#E7EDF2"}};
for(let r=6;r<=18;r++) if(r%2===0) summary.getRange(`A${r}:H${r}`).format.fill="#F7F9FB";
summary.getRange("G6:H18").format.fill="#EDF3F8";
summary.getRange("A21:H21").merge();
summary.getRange("A21").values=[["单方 = 构件钢筋量(kg) ÷ 楼面面积(m²)；汇总按构件总量 ÷ 总面积，不能累加各层单方。"]];
summary.getRange("A22:H22").merge();
summary.getRange("A22").values=[["source_id：LEGACY-105-MAIN-REBAR；历史样本整理，工作草案，待结构负责人复核。"]];
summary.getRange("A21:H22").format.font={name:font,size:9,color:"#66788A"};
summary.getRange("A21:H22").format.rowHeightPx=26;

share.showGridLines = false;
share.getRange("A1:D1").values = [["钢筋构件占比",null,null,null]];
share.getRange("A2:D2").values = [["与“按楼层汇总”联动；构件单方单位为 kg/m²。",null,null,null]];
share.getRange("A4:C4").values = [["构件","单方(kg/m²)","占比"]];
share.getRange("A5:A8").values = [["梁"],["柱"],["墙"],["板"]];
share.getRange("B5:B8").formulas = [["='按楼层汇总'!C19"],["='按楼层汇总'!D19"],["='按楼层汇总'!E19"],["='按楼层汇总'!F19"]];
share.getRange("C5").formulas = [["=B5/SUM($B$5:$B$8)"]];
share.getRange("C5:C8").fillDown();
share.getRange("A9:C9").values = [["合计",null,null]];
share.getRange("B9").formulas = [["=SUM(B5:B8)"]];
share.getRange("C9").formulas = [["=SUM(C5:C8)"]];
share.getRange("A1:L18").format.font = {name:font,size:10,color:"#27384D"};
share.getRange("A1").format.font = {name:font,size:16,bold:true,color:"#20364F"};
share.getRange("A2:D2").format.font = {name:font,size:9,italic:true,color:"#66788A"};
share.getRange("A4:C4").format = {fill:"#365E85",font:{name:font,size:10,bold:true,color:"#FFFFFF"},horizontalAlignment:"center"};
share.getRange("A5:C8").format.borders = {insideHorizontal:{style:"thin",color:"#E2E8EF"}};
share.getRange("A9:C9").format = {fill:"#EDF3F8",font:{name:font,size:10,bold:true,color:"#20364F"}};
share.getRange("B5:B9").format.numberFormat = "#,##0.00";
share.getRange("C5:C9").format.numberFormat = "0.0%";
share.getRange("A:A").format.columnWidthPx = 90;
share.getRange("B:C").format.columnWidthPx = 105;
const chart = share.charts.add("bar", share.getRange("A4:B8"));
chart.title = "构件钢筋单方（kg/m²）";
chart.titleTextStyle.fontSize = 12;
chart.titleTextStyle.typeface = font;
chart.hasLegend=false;
chart.series.items[0].fill="#6789AA";
chart.xAxis={axisType:"textAxis",textStyle:{typeface:font,fontSize:11}};
chart.yAxis={numberFormatCode:"#,##0",numberFormatSourceLinked:false,textStyle:{typeface:font,fontSize:10}};
chart.setPosition("E4","I15");
share.getRange("A1").values=[["主楼钢筋用量总览"]];
share.getRange("A1:H1").merge();
share.getRange("A2:H2").merge();
share.getRange("A2").values=[["13 层历史样本 · 按楼层与构件汇总 · 数据待复核"]];
share.getRange("A10:C10").values=[["统计面积（m²）",null,null]];
share.getRange("B10").formulas=[["='按楼层汇总'!B19"]];
share.getRange("A11:C11").values=[["整体含钢量",null,"kg/m²"]];
share.getRange("B11").formulas=[["='按楼层汇总'!G19"]];
share.getRange("B10:B11").format.numberFormat="#,##0.00";
share.getRange("A1:I34").format.font={name:font,size:10,color:"#27384D"};
share.getRange("A1").format.font={name:font,size:17,bold:true,color:"#20364F"};
share.getRange("A2").format.font={name:font,size:10,color:"#66788A"};
share.getRange("A1:I34").format.rowHeightPx=26;
share.getRange("A1:I1").format.rowHeightPx=34;
share.getRange("A:A").format.columnWidthPx=145;
share.getRange("B:C").format.columnWidthPx=110;
share.getRange("D:D").format.columnWidthPx=24;
share.getRange("E:H").format.columnWidthPx=100;
share.getRange("I:I").format.columnWidthPx=20;
share.getRange("A4:C4").format.font={name:font,size:10,bold:true,color:"#FFFFFF"};
share.getRange("A4:C4").format.rowHeightPx=32;
share.getRange("A5:C11").format.rowHeightPx=30;
share.getRange("B5:C11").format.horizontalAlignment="right";
share.getRange("A9:C11").format.fill="#EDF3F8";
share.getRange("A9:C11").format.font={name:font,size:10,bold:true,color:"#20364F"};
const floorChart=share.charts.add("line",[summary.getRange("A5:A18"),summary.getRange("G5:G18")]);
floorChart.title="各层含钢量（kg/m²）";
floorChart.hasLegend=false;
floorChart.titleTextStyle.fontSize=12;
floorChart.titleTextStyle.typeface=font;
floorChart.series.items[0].fill="#6789AA";
floorChart.xAxis={axisType:"textAxis",textStyle:{typeface:font,fontSize:10}};
floorChart.yAxis={numberFormatCode:"0",numberFormatSourceLinked:false,textStyle:{typeface:font,fontSize:10}};
floorChart.setPosition("A16","I27");
const notes=[
  "统计说明与待复核项",
  "来源：主楼钢筋用量.xls；source_id：LEGACY-105-MAIN-REBAR。",
  "原文事实（既有整理记录）：第1层板原合计为 21 kg，直径分项合计为 57,159.059 kg。",
  "当前沿用分项求和，仅作工作草案；两项取值均保留，尚待结构负责人确认。",
  "单方 = 构件钢筋量(kg) ÷ 楼面面积(m²)；汇总按总量 ÷ 总面积，非各层单方平均。",
  "图表读取明细公式；各层差异供复核，不代表设计质量或优劣排名。"
];
notes.forEach((text,i)=>{const r=29+i;share.getRange(`A${r}:H${r}`).merge();share.getRange(`A${r}`).values=[[text]];});
share.getRange("A29:H34").format.font={name:font,size:9,color:"#66788A"};
share.getRange("A29").format.font={name:font,size:11,bold:true,color:"#20364F"};
share.getRange("A31:H32").format.fill="#FFF4DF";

await fs.mkdir(outputDir,{recursive:true});
await fs.mkdir(previewDir,{recursive:true});
for (const item of [{name:"按楼层汇总",file:"rebar-summary.png",range:"A1:H22"},{name:"用量总览",file:"rebar-share.png",range:"A1:I34"},{name:"工程量来源",file:"rebar-source.png",range:"A1:F18"}]) {
  const png = await workbook.render({sheetName:item.name,range:item.range,scale:1.5,format:"png"});
  await fs.writeFile(path.join(previewDir,item.file),new Uint8Array(await png.arrayBuffer()));
}
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
const inspect = await workbook.inspect({kind:"table",range:"按楼层汇总!A1:H19",include:"values,formulas",tableMaxRows:22,tableMaxCols:8,maxChars:12000});
const errors = await workbook.inspect({kind:"match",searchTerm:"#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",options:{useRegex:true,maxResults:100},summary:"final formula error scan"});
console.log(JSON.stringify({outputPath,inspect:inspect.ndjson,errorScan:errors.ndjson}));
