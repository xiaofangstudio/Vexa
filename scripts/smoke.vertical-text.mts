/** 直排文字冒烟：逐字向下、换列向左、区域自动换列、SVG/PDF/轮廓与 .vex 往返。 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { convertTextMode, isVerticalUpright, textBox, textLayout, verticalTextLayout } from "../src/core/geom";
import { createDoc } from "../src/core/docOps";
import { docToSVG } from "../src/core/svg";
import { exportPDF } from "../src/core/pdf";
import { parseVex, serializeVex } from "../src/core/vex";
import { loadOutlineFace, outlineText } from "../src/core/textOutline";
import { solid, type TextNode, type VexaDoc } from "../src/core/types";

assert.equal(isVerticalUpright("汉"), true);
assert.equal(isVerticalUpright("。"), true);
assert.equal(isVerticalUpright("A"), false);

const point: TextNode = {
  kind: "text",
  id: "t1",
  name: "直排",
  x: 200,
  y: 100,
  text: "直排\n文字",
  size: 20,
  font: "Microsoft YaHei",
  textDirection: "vertical",
  fill: solid("#111111"),
  opacity: 1,
  visible: true,
  locked: false,
};

const pl = textLayout(point);
assert.equal(pl.mode, "point");
assert.equal(pl.lines.length, 0, "直排不产生横排行");
assert.equal(pl.vertical?.chars.length, 4);
const pv = verticalTextLayout(point);
assert.equal(pv.chars[0].x, 200, "第一列以锚点为中心");
assert.equal(pv.chars[0].y, 100, "首字从锚点顶端向下");
assert.equal(pv.chars[1].y, 120, "同列逐字向下");
assert.equal(pv.chars[2].x, 175, "第二列向左一列距");
assert.equal(pv.chars[2].y, 100, "新列回到顶端");
assert.deepEqual(textBox(point), { x: 162.5, y: 100, w: 50, h: 40 });

const latin: TextNode = { ...point, text: "A中", textDirection: "vertical" };
const ll = verticalTextLayout(latin);
assert.equal(ll.chars[0].rotate, true, "拉丁字母随列旋转");
assert.equal(ll.chars[1].rotate, false, "汉字保持正立");
assert.ok(ll.chars[1].y > 100, "后一字沿列继续向下");

const punct: TextNode = { ...point, text: "，。「」（）", textDirection: "vertical" };
const ptl = verticalTextLayout(punct);
assert.equal(ptl.chars.length, 6);
assert.ok(Math.abs((ptl.chars[0].dx ?? 0) - 4.4) < 0.01, "逗号在字格内向右上偏");
assert.ok(Math.abs((ptl.chars[0].dy ?? 0) + 3.6) < 0.01, "逗号上移 0.18em");
assert.ok(Math.abs((ptl.chars[1].dx ?? 0) - 4.4) < 0.01, "句号同样右上偏");
assert.equal(ptl.chars[2].dx ?? 0, 0, "引号保持居中");
assert.equal(ptl.chars[2].rotate, false, "引号不旋转");
assert.equal(ptl.chars[4].rotate, true, "左括号旋转 90°");
assert.equal(ptl.chars[5].rotate, true, "右括号旋转 90°");

const area: TextNode = {
  ...point,
  text: "区域直排文字",
  x: 100,
  y: 80,
  textMode: "area",
  boxW: 60,
  boxH: 70,
  lineHeight: 1.25,
};
const al = textLayout(area);
assert.equal(al.mode, "area");
assert.equal(al.vertical?.columns, 2, "宽度只够两列");
const av = al.vertical!;
assert.equal(av.chars.length, 6);
assert.ok(Math.abs(av.chars[0].x - 143.5) < 0.01, "第一列贴右内框");
assert.ok(Math.abs(av.chars[3].x - 118.5) < 0.01, "第二列向左");
assert.ok(av.chars[3].y < av.chars[2].y, "换列后回到顶端");
assert.equal(al.overflow, false, "两列放得下不误报溢出");
assert.equal(textLayout({ ...area, text: "区域直排文字溢出测试" }).overflow, true, "两列放不下应溢出");

const bottom: TextNode = { ...area, text: "直排", areaVAlign: "bottom" };
assert.ok(textLayout(bottom).vertical!.chars[0].y > 84, "底对齐把短列下移");

const uneven: TextNode = { ...area, text: "直\n区域", areaVAlign: "bottom" };
const ul = textLayout(uneven).vertical!;
assert.equal(ul.columns, 2, "段落分成两列");
const col0 = ul.chars.filter((c) => c.col === 0);
const col1 = ul.chars.filter((c) => c.col === 1);
assert.equal(col0.length, 1);
assert.equal(col1.length, 2);
const bottomOf = (list: typeof col0) => list[list.length - 1].y + list[list.length - 1].advance;
assert.ok(Math.abs(bottomOf(col0) - bottomOf(col1)) < 0.01, "底对齐让两列各自贴底");
const unevenTop = textLayout({ ...uneven, areaVAlign: "top" }).vertical!;
const topCol0 = unevenTop.chars.filter((c) => c.col === 0);
assert.ok(bottomOf(col0) > bottomOf(topCol0) + 0.5, "短列被单独下移");
assert.ok(bottomOf(unevenTop.chars.filter((c) => c.col === 0)) < bottomOf(unevenTop.chars.filter((c) => c.col === 1)), "顶对齐时两列底端不齐");

const vkinBase: TextNode = {
  ...area,
  text: "一二三。四",
  boxW: 100,
  boxH: 110,
  size: 26,
  lineHeight: 1.25,
};
const vkinOff = verticalTextLayout(vkinBase);
const offCol1 = vkinOff.chars.filter((c) => c.col === 1);
assert.equal(offCol1[0].ch, "。", "未开启直排避头尾时句号落到新列顶部");
const vkinOn = verticalTextLayout({ ...vkinBase, kinsoku: true });
const onCol0 = vkinOn.chars.filter((c) => c.col === 0);
const onCol1 = vkinOn.chars.filter((c) => c.col === 1);
assert.equal(onCol0.length, 2, "直排避头尾把上一字一起推到下一列");
assert.equal(onCol1[0].ch, "三", "上一字移到新列顶部");
assert.equal(onCol1[1].ch, "。", "句号跟在上一字之后，不落列首");
assert.ok(onCol1.every((c) => c.ch !== "。" || c.y > onCol1[0].y), "句号不在列顶");

const doc: VexaDoc = createDoc("直排文字", 400, 300);
const saved: TextNode = { ...point, text: "直排 A1" };
doc.nodes.t1 = saved;
doc.root.push("t1");
const svg = docToSVG(doc);
assert.match(svg, /dominant-baseline="central"/);
assert.match(svg, /rotate\(90\)/);
assert.match(svg, /text-anchor="middle"/);

const roundtrip = parseVex(serializeVex(doc));
const rt = roundtrip.nodes.t1 as TextNode;
assert.equal(rt.textDirection, "vertical");

const punctDoc: VexaDoc = createDoc("竖排标点", 400, 300);
punctDoc.nodes.t1 = { ...punct, y: 100 };
punctDoc.root.push("t1");
const punctSvg = docToSVG(punctDoc);
assert.match(punctSvg, /translate\(204\.4 /, "SVG 标点按偏移落点");
assert.match(punctSvg, /rotate\(90\)/, "SVG 括号旋转");
const punctPdf = await exportPDF(punctDoc, {
  fontLoader: () => new Uint8Array(fs.readFileSync("C:/Windows/Fonts/simhei.ttf")),
});
assert.equal(punctPdf.warnings.length, 0, "标点 PDF 不应有字体警告");
assert.ok(punctPdf.bytes.length > 1000, `标点 PDF 应写出内容，实际 ${punctPdf.bytes.length} 字节`);
const horizontal: TextNode = { ...saved, textDirection: "horizontal" };
const hdoc: VexaDoc = createDoc("横排", 400, 300);
hdoc.nodes.t1 = horizontal;
hdoc.root.push("t1");
assert.equal((parseVex(serializeVex(hdoc)).nodes.t1 as TextNode).textDirection, undefined, "横排不写方向字段");

const moved = { ...point };
convertTextMode(moved, "area");
assert.equal(moved.textDirection, "vertical", "转区域后保持直排");
convertTextMode(moved, "point");
assert.equal(moved.textDirection, "vertical", "转回单点仍保持直排");

const pdf = await exportPDF(doc, {
  fontLoader: () => new Uint8Array(fs.readFileSync("C:/Windows/Fonts/simhei.ttf")),
});
assert.equal(pdf.warnings.length, 0, "直排 PDF 不应有字体/排版警告");
assert.ok(pdf.bytes.length > 2000, `直排 PDF 应写出有效内容，实际 ${pdf.bytes.length} 字节`);

const face = await loadOutlineFace(new Uint8Array(fs.readFileSync("C:/Windows/Fonts/simhei.ttf")), false, false);
const outlines = outlineText(saved, face);
assert.equal(outlines.length, 4, "四个字形都应转出轮廓");
assert.ok(outlines.every((g) => g.length > 0));

console.log("直排文字冒烟通过：", av.chars.map((c) => c.ch).join(""));
