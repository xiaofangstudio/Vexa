/** 路径文字冒烟：沿路径排字、左右侧、起点、包围盒、SVG/PDF 与 .vex 往返。 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createDoc } from "../src/core/docOps";
import { convertTextMode, pathTextLayout, textBox } from "../src/core/geom";
import { docToSVG } from "../src/core/svg";
import { exportPDF } from "../src/core/pdf";
import { serializeVex, parseVex } from "../src/core/vex";
import { loadOutlineFace, outlineText } from "../src/core/textOutline";
import { solid, type TextNode, type VexaDoc } from "../src/core/types";

const pathSubpaths = [
  {
    anchors: [
      { x: 100, y: 100, hIn: null, hOut: null, smooth: false },
      { x: 420, y: 100, hIn: null, hOut: null, smooth: false },
    ],
    closed: false,
  },
];
const node: TextNode = {
  kind: "text",
  id: "t1",
  name: "路径文字",
  x: 100,
  y: 100,
  text: "路径文字顺排",
  size: 30,
  font: "Microsoft YaHei",
  textMode: "path",
  pathSubpaths,
  pathStart: 0,
  pathSide: "left",
  baseline: 12,
  fill: solid("#0f76d6"),
  opacity: 1,
  visible: true,
  locked: false,
};

const lay = pathTextLayout(node);
assert.equal(lay.length, 320, "路径长度按弧长计算");
assert.equal(lay.chars.length, 6, "六个字符都应落点");
assert.ok(Math.abs(lay.chars[0].x - 100) < 0.01 && Math.abs(lay.chars[0].y - 88) < 0.01, "左侧基线抬到路径上方");
assert.ok(lay.chars[1].x > lay.chars[0].x + 20, "字符沿路径向前推进");
assert.ok(lay.chars.every((c) => Math.abs(c.angle) < 0.001), "水平路径切线角为 0");
const right = pathTextLayout({ ...node, pathSide: "right" });
assert.ok(Math.abs(right.chars[0].y - 112) < 0.01, "右侧基线压到路径下方");
const shifted = pathTextLayout({ ...node, pathStart: 50 });
assert.ok(Math.abs(shifted.chars[0].x - 150) < 0.01, "起点偏移作用到首字");
const box = textBox(node);
assert.ok(box.x <= 100 && box.y < 100 && box.x + box.w >= 280 && box.h > 30, "路径文字包围盒覆盖路径与字形");

// 路径文字转回单点/区域时清除路径字段。
const point = structuredClone(node);
convertTextMode(point, "point");
assert.equal(point.textMode, "point");
assert.equal(point.pathSubpaths, undefined);
assert.equal(point.pathSide, undefined);

const doc: VexaDoc = createDoc("路径文字", 500, 300);
doc.nodes.t1 = node;
doc.root.push("t1");
const svg = docToSVG(doc);
assert.match(svg, /<text transform="translate\(100 88\) rotate\(0\)/, "SVG 按落点旋转输出字符");
const rt = parseVex(serializeVex(doc));
const t = rt.nodes.t1 as TextNode;
assert.equal(t.textMode, "path");
assert.equal(t.pathSubpaths?.length, 1, ".vex 往返保留路径");
assert.equal(t.pathStart, 0);
assert.equal(t.pathSide, "left");
const pdf = await exportPDF(doc, {
  fontLoader: () => new Uint8Array(fs.readFileSync("C:/Windows/Fonts/msyh.ttc")),
});
assert.equal(pdf.warnings.length, 0, "路径文字 PDF 不应有字体/排版警告");
assert.ok(pdf.bytes.length > 1000, "路径文字 PDF 应写出内容");

const face = await loadOutlineFace(new Uint8Array(fs.readFileSync("C:/Windows/Fonts/msyh.ttc")), false, false);
const glyphs = outlineText(node, face);
assert.equal(glyphs.length, 6, "路径文字转轮廓应得到每个字符的字形");
assert.ok(glyphs.every((g) => g.length > 0), "每个字形应有轮廓");

console.log("路径文字冒烟通过：", lay.chars.map((c) => c.ch).join(""), "路径长度", lay.length);
