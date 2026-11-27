/** 文字转路径冒烟：真实字形轮廓、区域文字、文档替换、SVG 与 PDF。 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createDoc } from "../src/core/docOps";
import { textLayout } from "../src/core/geom";
import { groupBox } from "../src/engine/pick";
import { docToSVG } from "../src/core/svg";
import { exportPDF } from "../src/core/pdf";
import { parseVex, serializeVex } from "../src/core/vex";
import { loadOutlineFace, outlineText, replaceTextWithOutlines } from "../src/core/textOutline";
import { linearPaint, solid, type PathNode, type TextNode, type VexaDoc } from "../src/core/types";

const bytes = new Uint8Array(fs.readFileSync("C:/Windows/Fonts/msyh.ttc"));
const face = await loadOutlineFace(bytes, false, false);
assert.ok(face.font.unitsPerEm > 0, "应解析出本机字体");

const point: TextNode = {
  kind: "text",
  id: "t1",
  name: "轮廓测试",
  x: 100,
  y: 140,
  text: "Ag中",
  size: 40,
  font: "Microsoft YaHei",
  fill: solid("#c2410c"),
  opacity: 1,
  visible: true,
  locked: false,
};
const glyphs = outlineText(point, face);
assert.equal(glyphs.length, 3, "三个字符应生成三组字形轮廓");
for (const subs of glyphs) {
  assert.ok(subs.length >= 1, "每个字形至少一条子路径");
  assert.ok(subs.some((s) => s.closed), "字母/汉字轮廓应闭合");
  for (const sub of subs) {
    assert.ok(sub.anchors.length >= 2, "轮廓锚点数量不足");
    for (const a of sub.anchors) {
      assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y), "轮廓坐标必须有限");
    }
  }
}
const all = glyphs.flatMap((s) => s.flatMap((p) => p.anchors));
assert.ok(all.every((a) => a.y > 60 && a.y < 155), "轮廓应落在基线附近");

const area: TextNode = { ...point, textMode: "area", boxW: 220, boxH: 120, text: "第一行文字\n第二行文字" };
const areaGlyphs = outlineText(area, face);
const areaLayout = textLayout(area);
assert.equal(areaLayout.lines.length, 2);
const firstLine = areaGlyphs.slice(0, areaLayout.lines[0].text.length);
const secondLine = areaGlyphs.slice(firstLine.length);
const topOf = (gs: typeof areaGlyphs) => Math.min(...gs.flatMap((s) => s.flatMap((p) => p.anchors.map((a) => a.y))));
assert.ok(topOf(secondLine) > topOf(firstLine) + 10, "第二行轮廓应在第一行下方");

const doc: VexaDoc = createDoc("文字转路径", 400, 300);
doc.nodes.t1 = point;
doc.root.push("t1");
const ids = replaceTextWithOutlines(doc, "t1", glyphs);
assert.equal(doc.nodes.t1, undefined, "原文字节点应被替换");
assert.ok(ids.length === 1, "多个字形应包成一个组");
const group = doc.nodes[ids[0]];
assert.ok(group?.kind === "group", "替换结果应为组");
assert.equal(group.children.length, 3, "组内每个字符一个路径");
for (const id of group.children) {
  const node = doc.nodes[id] as PathNode;
  assert.equal(node.kind, "path");
  assert.equal(node.fill.color, "#c2410c", "路径应继承文字填充");
  assert.equal(node.stroke.kind, "none");
  assert.ok(node.subpaths.length >= 1);
}
const box = groupBox(doc, group);
assert.ok(box && box.w > 20 && box.h > 20, "转路径后的组应有真实包围盒");

const svg = docToSVG(doc);
assert.doesNotMatch(svg, /<text\b/, "转路径后不应再输出 <text>");
assert.match(svg, /<path\b/);
const rt = parseVex(serializeVex(doc));
assert.equal(rt.nodes.t1, undefined);
assert.equal(rt.root.length, 1);
assert.equal(Object.values(rt.nodes).filter((n) => n.kind === "path").length, 3, "路径应随 .vex 往返保留");
const rtGroup = Object.values(rt.nodes).find((n) => n.kind === "group");
assert.ok(rtGroup && rtGroup.kind === "group" && rtGroup.children.length === 3);

const pdf = await exportPDF(doc);
assert.equal(pdf.warnings.length, 0, "纯路径文档 PDF 不应有字体警告");
assert.ok(pdf.bytes.length > 1000, "PDF 应写出有效内容");

const gradDoc: VexaDoc = createDoc("渐变文字转路径", 400, 300);
const gradText: TextNode = { ...point, id: "t2", text: "渐变", fill: linearPaint("#ff0000", "#0000ff") };
gradDoc.nodes.t2 = gradText;
gradDoc.root.push("t2");
const gradIds = replaceTextWithOutlines(gradDoc, "t2", outlineText(gradText, face));
assert.equal(gradIds.length, 1, "渐变文字应合成一个复合路径，避免渐变逐字重复");
const gradPath = gradDoc.nodes[gradIds[0]] as PathNode;
assert.equal(gradPath.kind, "path");
assert.equal(gradPath.fill.kind, "linear");
assert.ok(gradPath.subpaths.length >= 2, "多个字形应保留在同一个复合路径里");

console.log("文字转路径冒烟通过：", glyphs.length, "个字形，", svg.length, "字节 SVG");
