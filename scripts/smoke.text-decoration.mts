/** 文字下划线/删除线冒烟：横排、区域换行、直排、SVG/PDF 与 .vex 往返。 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { textDecorationLines, textLayout } from "../src/core/geom";
import { createDoc } from "../src/core/docOps";
import { docToSVG } from "../src/core/svg";
import { exportPDF } from "../src/core/pdf";
import { parseVex, serializeVex } from "../src/core/vex";
import { solid, type TextNode, type VexaDoc } from "../src/core/types";

const base: TextNode = {
  kind: "text",
  id: "d1",
  name: "装饰",
  x: 100,
  y: 200,
  text: "下划线\n删除线",
  size: 40,
  font: "Microsoft YaHei",
  fill: solid("#e5484d"),
  opacity: 1,
  visible: true,
  locked: false,
};

const plain = textDecorationLines(base);
assert.equal(plain.length, 0, "未开启装饰时不产生线");

const both: TextNode = { ...base, underline: true, strike: true };
const lay = textLayout(both);
const lines = textDecorationLines(both, lay);
assert.equal(lines.length, 4, "两行 × 下划线/删除线");
assert.equal(lay.lines.length, 2);
assert.ok(Math.abs(lines[0].y1 - (lay.lines[0].baseline + 4.8)) < 0.01, "下划线在基线下 0.12em");
assert.ok(Math.abs(lines[1].y1 - (lay.lines[0].baseline - 12)) < 0.01, "删除线在基线上 0.3em");
assert.equal(lines[0].x1, lay.lines[0].x);
assert.equal(lines[0].x2, lay.lines[0].x + lay.lines[0].width);
assert.equal(lines[0].thickness, 2.4, "线宽为 0.06em");

const onlyStrike: TextNode = { ...base, strike: true };
assert.equal(textDecorationLines(onlyStrike).length, 2, "只开删除线时每行一条");

const area: TextNode = {
  ...both,
  textMode: "area",
  boxW: 180,
  boxH: 90,
  text: "区域文字自动换行会变成多行",
};
const areaLay = textLayout(area);
assert.ok(areaLay.lines.length > 1, "区域文字应换行");
assert.equal(textDecorationLines(area, areaLay).length, areaLay.lines.length * 2, "每条横排文字行各一条");

const vertical: TextNode = {
  ...base,
  text: "直排装饰",
  y: 100,
  textDirection: "vertical",
  underline: true,
  strike: true,
};
const vLay = textLayout(vertical);
assert.equal(vLay.vertical?.columns, 1);
const vLines = textDecorationLines(vertical, vLay);
assert.equal(vLines.length, 2, "直排每列一条下划线 + 一条删除线");
assert.equal(vLines[0].x1, vLay.vertical!.chars[0].x + 18, "直排下划线在列右侧 0.45em");
assert.equal(vLines[0].y1, 100, "从首字顶端开始");
assert.equal(vLines[0].y2, 260, "覆盖整列 4 字（4 × 40px）");
assert.equal(vLines[1].x1, vLay.vertical!.chars[0].x, "删除线穿过列中心");

const doc: VexaDoc = createDoc("文字装饰", 420, 320);
doc.nodes.d1 = both;
doc.root.push("d1");
const svg = docToSVG(doc);
assert.match(svg, /<line /, "SVG 应输出装饰线");
assert.match(svg, /stroke="#e5484d"/);
assert.match(svg, /stroke-width="2.4"/);
assert.equal((svg.match(/<line /g) ?? []).length, 4);

const pdf = await exportPDF(doc, {
  fontLoader: () => new Uint8Array(fs.readFileSync("C:/Windows/Fonts/simhei.ttf")),
});
assert.equal(pdf.warnings.length, 0, "装饰文字 PDF 不应有字体警告");
assert.ok(pdf.bytes.length > 2000, `装饰文字 PDF 应有内容，实际 ${pdf.bytes.length} 字节`);

const saved = parseVex(serializeVex(doc)).nodes.d1 as TextNode;
assert.equal(saved.underline, true);
assert.equal(saved.strike, true);
assert.equal((parseVex(serializeVex({ ...doc, nodes: { ...doc.nodes, d1: { ...both, underline: undefined, strike: undefined } } })).nodes.d1 as TextNode).underline, undefined, "未开启不写字段");

const pathText: TextNode = {
  ...both,
  textMode: "path",
  pathSubpaths: [{ anchors: [{ x: 40, y: 40 }, { x: 340, y: 40 }], closed: false }],
};
assert.equal(textDecorationLines(pathText).length, 0, "路径文字暂不输出装饰线");

console.log("文字装饰冒烟通过：", lines.length, "条横排线 /", vLines.length, "条直排线");
