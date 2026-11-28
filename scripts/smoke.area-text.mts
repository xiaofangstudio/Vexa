/** 区域文字冒烟：换行、溢出、模式转换、SVG/PDF 导出与 .vex 往返。 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { AREA_INSET, convertTextMode, textBox, textLayout } from "../src/core/geom";
import { createDoc } from "../src/core/docOps";
import { docToSVG } from "../src/core/svg";
import { exportPDF } from "../src/core/pdf";
import { parseVex, serializeVex } from "../src/core/vex";
import { solid, type TextNode, type VexaDoc } from "../src/core/types";

const node: TextNode = {
  kind: "text",
  id: "t1",
  name: "区域文本",
  x: 100,
  y: 80,
  text: "这是一段需要在区域文本框内自动换行的示例文字，包含 English words too.",
  size: 20,
  font: "Microsoft YaHei",
  textMode: "area",
  boxW: 180,
  boxH: 80,
  fill: solid("#111111"),
  opacity: 1,
  visible: true,
  locked: false,
};

const lay = textLayout(node);
assert.equal(lay.mode, "area");
assert.ok(lay.lines.length >= 2, "区域文字应自动换行");
const innerW = node.boxW! - AREA_INSET * 2;
for (const line of lay.lines) {
  assert.ok(line.width * 1 <= innerW + 0.01, `行宽 ${line.width} 应不超过 ${innerW}`);
}
assert.deepEqual(textBox(node), { x: 100, y: 80, w: 180, h: 80 });

const center: TextNode = { ...node, align: "center" };
const centered = textLayout(center);
for (const line of centered.lines) {
  assert.ok(line.x >= 100 + AREA_INSET, "居中行不越过左内框");
  assert.ok(line.x + line.width <= 100 + 180 - AREA_INSET + 0.01, "居中行不越过右内框");
}

const paragraphs: TextNode = {
  ...node,
  text: "第一段\n第二段",
  boxH: 140,
  firstIndent: 30,
  paraSpace: 20,
  areaVAlign: "middle",
};
const pl = textLayout(paragraphs);
assert.equal(pl.lines.length, 2, "两个段落各一行");
assert.equal(pl.lines[0].x, 100 + AREA_INSET + 30, "首行缩进只作用于段落第一行");
assert.equal(
  Math.round((pl.lines[1].baseline - pl.lines[0].baseline) * 100) / 100,
  20 * 1.25 + 20,
  "段间距叠加在行距上",
);
const top = textLayout({ ...paragraphs, areaVAlign: "top" });
assert.ok(pl.lines[0].baseline > top.lines[0].baseline, "垂直居中把文本块下移");

const spaced = textLayout({ ...paragraphs, firstIndent: 0, paraSpace: 0, spaceBefore: 8, spaceAfter: 14, areaVAlign: "top" });
assert.equal(spaced.lines[0].baseline, 80 + AREA_INSET + 20 * 1.2 + 8, "段前间距把首段基线向下推");
assert.equal(
  Math.round((spaced.lines[1].baseline - spaced.lines[0].baseline) * 100) / 100,
  20 * 1.25 + 14 + 8,
  "段后与下一段段前叠加",
);

const tight: TextNode = { ...node, boxH: 28 };
assert.equal(textLayout(tight).overflow, true, "压缩框高应检出溢出");

const kinsokuText: TextNode = {
  ...node,
  text: "这是测试文本内容。后续文字继续排。",
  boxW: 180,
  boxH: 200,
};
const rawWrap = textLayout(kinsokuText);
assert.equal(rawWrap.lines[0].text, "这是测试文本内容", "未开启避头尾时先排满 8 字");
assert.ok(rawWrap.lines[1].text.startsWith("。"), "未开启避头尾时句号落到行首");
const kinWrap = textLayout({ ...kinsokuText, kinsoku: true });
assert.equal(kinWrap.lines[0].text, "这是测试文本内", "避头尾把上一字一起推到下一行");
assert.equal(kinWrap.lines[1].text[0], "容", "句号不再落行首");
assert.ok(kinWrap.lines.every((l) => !l.text.startsWith("。") && !l.text.startsWith("，")), "所有行首都不落收尾标点");

const hanging = textLayout({ ...kinsokuText, firstIndent: 30, hangingIndent: 12 });
assert.ok(hanging.lines.length >= 3, "悬挂缩进样本应有多行");
assert.equal(hanging.lines[0].x, 100 + AREA_INSET + 30, "首行用首行缩进");
assert.equal(hanging.lines[1].x, 100 + AREA_INSET + 12, "后续行用悬挂缩进");

const inset = textLayout({ ...node, leftIndent: 20, rightIndent: 30 });
const innerIndented = node.boxW! - AREA_INSET * 2 - 20 - 30;
for (const line of inset.lines) {
  assert.equal(line.x, 100 + AREA_INSET + 20, "左右缩进让整段从更靠右的内框起排");
  assert.ok(line.width <= innerIndented + 0.01, `左右缩进行宽 ${line.width} 不越过 ${innerIndented}`);
}

const padded = textLayout({ ...node, textInset: 12 });
const paddedW = node.boxW! - 24;
for (const line of padded.lines) {
  assert.equal(line.x, 100 + 12, "内边距让整段从框内 12px 起排");
  assert.ok(line.width <= paddedW + 0.01, `内边距行宽 ${line.width} 不越过 ${paddedW}`);
}

const columns: TextNode = {
  ...node,
  text: "区域文字分栏会先把第一栏填满再流到第二栏，跨栏保留段落顺序并继续换行。",
  boxW: 300,
  boxH: 100,
  size: 20,
  columns: 2,
  columnGutter: 10,
};
const cl = textLayout(columns);
const colW = (300 - AREA_INSET * 2 - 10) / 2;
assert.ok(cl.lines.length > 3, "分栏文字应产生多行");
assert.equal(cl.lines[0].x, 100 + AREA_INSET, "第一栏从内框左边开始");
assert.ok(cl.lines.some((l) => Math.abs(l.x - (100 + AREA_INSET + colW + 10)) < 0.01), "第二栏从内框右半边开始");
for (const line of cl.lines) assert.ok(line.width <= colW + 0.01, `分栏行宽 ${line.width} 不应超过 ${colW}`);
assert.ok(cl.lines.filter((l) => l.x < 200).length > 0 && cl.lines.filter((l) => l.x > 200).length > 0, "两栏都有文字");
assert.equal(cl.overflow, false, "文字在两栏内排完不应误报溢出");
assert.equal(cl.lines.map((l) => l.text).join(""), columns.text.replace(/\n/g, ""), "跨栏不丢字且顺序保持");
assert.equal(textLayout({ ...columns, text: columns.text.repeat(4), boxH: 80 }).overflow, true, "四栏都填满后应溢出");

const colIndent = textLayout({ ...columns, leftIndent: 18, rightIndent: 22 });
const colWIndent = (300 - AREA_INSET * 2 - 18 - 22 - 10) / 2;
assert.equal(colIndent.lines[0].x, 100 + AREA_INSET + 18, "分栏整体左缩进");
assert.ok(colIndent.lines.some((l) => Math.abs(l.x - (100 + AREA_INSET + 18 + colWIndent + 10)) < 0.01), "第二栏跟随左缩进");
assert.ok(colIndent.lines.every((l) => l.width <= colWIndent + 0.01), "分栏行宽扣掉左右缩进");

const point: TextNode = { ...node };
convertTextMode(point, "area");
assert.equal(point.textMode, "area");
assert.ok(point.boxW! >= 50);
const back = { ...point };
convertTextMode(back, "point");
assert.equal(back.textMode ?? "point", "point");
assert.ok(!back.boxW && !back.boxH);
assert.equal(back.areaVAlign, undefined);
assert.equal(back.firstIndent, undefined);
assert.equal(back.hangingIndent, undefined);
assert.equal(back.leftIndent, undefined);
assert.equal(back.rightIndent, undefined);
assert.equal(back.textInset, undefined);
assert.equal(back.spaceBefore, undefined);
assert.equal(back.spaceAfter, undefined);
assert.equal(back.paraSpace, undefined);
assert.equal(back.columns, undefined);
assert.equal(back.columnGutter, undefined);

const doc: VexaDoc = createDoc("区域文字", 400, 300);
const saved: TextNode = { ...node, areaVAlign: "middle", firstIndent: 24, hangingIndent: 36, leftIndent: 18, rightIndent: 22, textInset: 10, paraSpace: 12, spaceBefore: 9, spaceAfter: 11, columns: 2, columnGutter: 10, kinsoku: true };
doc.nodes.t1 = saved;
doc.root.push("t1");
const svg = docToSVG(doc);
assert.match(svg, /clipPath id="tc\d+"/);
assert.match(svg, /<tspan x="[^"]+" y="[^"]+">/);
assert.doesNotMatch(svg, /<tspan x="0" dy="0">/);
const roundtrip = parseVex(serializeVex(doc));
const rt = roundtrip.nodes.t1 as TextNode;
assert.equal(rt.textMode, "area");
assert.equal(rt.boxW, 180);
assert.equal(rt.boxH, 80);
assert.equal(rt.areaVAlign, "middle");
assert.equal(rt.firstIndent, 24);
assert.equal(rt.hangingIndent, 36, ".vex 往返保留悬挂缩进");
assert.equal(rt.leftIndent, 18, ".vex 往返保留左缩进");
assert.equal(rt.rightIndent, 22, ".vex 往返保留右缩进");
assert.equal(rt.textInset, 10, ".vex 往返保留内边距");
assert.equal(rt.paraSpace, 12);
assert.equal(rt.spaceBefore, 9, ".vex 往返保留段前");
assert.equal(rt.spaceAfter, 11, ".vex 往返保留段后");
assert.equal(rt.columns, 2);
assert.equal(rt.columnGutter, 10);
assert.equal(rt.kinsoku, true, ".vex 往返保留避头尾");

const pdf = await exportPDF(doc, {
  fontLoader: () => new Uint8Array(fs.readFileSync("C:/Windows/Fonts/simhei.ttf")),
});
assert.equal(pdf.warnings.length, 0, "区域文字 PDF 不应有字体/排版警告");
assert.ok(pdf.bytes.length > 2000, `区域文字 PDF 应写出有效内容，实际 ${pdf.bytes.length} 字节`);

console.log("区域文字冒烟通过：", lay.lines.map((l) => l.text).join(" / "));
