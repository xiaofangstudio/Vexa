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

const tight: TextNode = { ...node, boxH: 28 };
assert.equal(textLayout(tight).overflow, true, "压缩框高应检出溢出");

const point: TextNode = { ...node };
convertTextMode(point, "area");
assert.equal(point.textMode, "area");
assert.ok(point.boxW! >= 50);
const back = { ...point };
convertTextMode(back, "point");
assert.equal(back.textMode ?? "point", "point");
assert.ok(!back.boxW && !back.boxH);

const doc: VexaDoc = createDoc("区域文字", 400, 300);
doc.nodes.t1 = node;
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

const pdf = await exportPDF(doc, {
  fontLoader: () => new Uint8Array(fs.readFileSync("C:/Windows/Fonts/simhei.ttf")),
});
assert.equal(pdf.warnings.length, 0, "区域文字 PDF 不应有字体/排版警告");
assert.ok(pdf.bytes.length > 8000, "区域文字 PDF 应写出有效内容");

console.log("区域文字冒烟通过：", lay.lines.map((l) => l.text).join(" / "));
