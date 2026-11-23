/** SVG 文本 / use 引用导入冒烟。 */
import assert from "node:assert/strict";
import { DOMParser } from "@xmldom/xmldom";

(globalThis as { DOMParser?: unknown }).DOMParser = DOMParser;
const { svgToNodes } = await import("../src/core/svg");

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="300" height="220">
  <defs>
    <linearGradient id="tg" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#e5484d"/>
      <stop offset="1" stop-color="#00d0f8"/>
    </linearGradient>
    <g id="icon">
      <rect x="0" y="0" width="20" height="12" fill="#336699"/>
      <circle cx="30" cy="8" r="8" fill="#00d0f8"/>
    </g>
  </defs>
  <g font-family="Arial" font-size="20" fill="#336699">
    <text x="10" y="30" font-weight="bold" text-anchor="middle" letter-spacing="2">标题 A</text>
    <text x="10" y="60">
      <tspan x="10" y="60" fill="url(#tg)">渐变行一</tspan>
      <tspan x="10" dy="22">第二行</tspan>
    </text>
  </g>
  <use href="#icon" x="100" y="100"/>
  <g id="alias"><use xlink:href="#icon" x="20" y="20"/></g>
  <text transform="translate(40 180) scale(1.5 1)" fill="#ff0000" font-size="10">缩放文字</text>
</svg>`;

const { nodes, nextSeq } = svgToNodes(SVG, 1, "导入路径");
assert.equal(nodes.length, 8);
assert.equal(nextSeq, 9);

const title = nodes[0];
assert.equal(title.kind, "text");
if (title.kind !== "text") throw new Error("title not text");
assert.equal(title.name, "导入文字 1");
assert.equal(title.text, "标题 A");
assert.equal(title.x, 10);
assert.equal(title.y, 30);
assert.equal(title.size, 20);
assert.equal(title.font, "Arial");
assert.equal(title.bold, true);
assert.equal(title.align, "center");
assert.equal(title.tracking, 2);
assert.equal(title.fill.kind, "solid");
assert.equal(title.fill.color, "#336699");

const gradLine = nodes[1];
assert.equal(gradLine.kind, "text");
if (gradLine.kind !== "text") throw new Error("gradient line not text");
assert.equal(gradLine.text, "渐变行一");
assert.equal(gradLine.fill.kind, "linear");
assert.equal(gradLine.fill.grad?.stops.length, 2);
assert.equal(gradLine.fill.grad?.angle, 0);

const secondLine = nodes[2];
assert.equal(secondLine.kind, "text");
if (secondLine.kind !== "text") throw new Error("second line not text");
assert.equal(secondLine.text, "第二行");
assert.equal(secondLine.y, 82);

const usedRect = nodes[3];
assert.equal(usedRect.kind, "path");
if (usedRect.kind !== "path") throw new Error("use rect not path");
const rectX = usedRect.subpaths[0].anchors.map((a) => [a.x, a.y]);
assert.deepEqual(rectX, [
  [100, 100],
  [120, 100],
  [120, 112],
  [100, 112],
]);

const usedCircle = nodes[4];
assert.equal(usedCircle.kind, "path");
if (usedCircle.kind !== "path") throw new Error("use circle not path");
const circleLeft = Math.min(...usedCircle.subpaths[0].anchors.map((a) => a.x));
assert.equal(circleLeft, 122);

const aliasRect = nodes[5];
assert.equal(aliasRect.kind, "path");
if (aliasRect.kind !== "path") throw new Error("nested use not path");
assert.equal(aliasRect.subpaths[0].anchors[0].x, 20);
assert.equal(aliasRect.subpaths[0].anchors[0].y, 20);

const scaled = nodes[7];
assert.equal(scaled.kind, "text");
if (scaled.kind !== "text") throw new Error("scaled text not text");
assert.equal(scaled.text, "缩放文字");
assert.equal(scaled.x, 40);
assert.equal(scaled.y, 180);
assert.equal(scaled.size, 10);
assert.equal(scaled.hScale, 150);
assert.equal(scaled.fill.color, "#ff0000");

const empty = svgToNodes('<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>', 1).nodes;
assert.equal(empty.length, 0);
const bad = svgToNodes("<svg><g>", 1).nodes;
assert.equal(bad.length, 0);

console.log(
  `svg text/use: nodes=${nodes.length} text=${nodes.filter((n) => n.kind === "text").length} ` +
    `usePaths=${nodes.filter((n) => n.kind === "path").length} title=${title.bold}/${title.align} ` +
    `grad=${gradLine.fill.kind} scale=${scaled.hScale} bad=0 empty=0`,
);
