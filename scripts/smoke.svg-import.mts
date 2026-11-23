/** SVG 渐变导入冒烟：Node 里用 @xmldom/xmldom 提供 DOMParser，断言颜色、透明度、径向、href 继承与失效回退。 */
import assert from "node:assert/strict";
import { DOMParser } from "@xmldom/xmldom";

(globalThis as { DOMParser?: unknown }).DOMParser = DOMParser;
const { svgToPathNodes } = await import("../src/core/svg");

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="240" height="160">
  <defs>
    <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ff0000" stop-opacity="0.8"/>
      <stop offset="50%" stop-color="rgb(0, 128, 255)"/>
      <stop offset="1" stop-color="#0000ff" stop-opacity="35%"/>
    </linearGradient>
    <radialGradient id="rg">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.5"/>
    </radialGradient>
    <linearGradient id="alias" xlink:href="#lg"/>
    <linearGradient id="one">
      <stop offset="0" stop-color="#abcdef" stop-opacity="0.6"/>
    </linearGradient>
  </defs>
  <g fill-opacity="0.5" opacity="0.9">
    <rect x="0" y="0" width="120" height="60" fill="url(#lg)" stroke="url(#rg)" stroke-opacity="0.7"/>
    <circle cx="160" cy="40" r="24" fill="url(#rg)"/>
    <path d="M10 120 L70 120 L40 80 Z" fill="url(#alias)"/>
    <rect x="110" y="100" width="100" height="40" fill="#ff0000" fill-opacity="0.2"/>
    <rect x="110" y="140" width="100" height="10" fill="url(#missing)"/>
    <rect x="0" y="140" width="40" height="10" fill="url(#one)"/>
  </g>
</svg>`;

const { nodes, nextSeq } = svgToPathNodes(SVG, 7, "导入路径");
assert.equal(nodes.length, 6);
assert.equal(nextSeq, 13);
assert.equal(nodes[0].name, "导入路径 1");

const linear = nodes[0].fill;
assert.equal(linear.kind, "linear");
assert.equal(linear.opacity, 0.5);
assert.equal(linear.grad?.angle, 90);
assert.deepEqual(
  linear.grad?.stops.map((s) => [s.offset, s.color, s.alpha ?? 1]),
  [
    [0, "#ff0000", 0.8],
    [0.5, "#0080ff", 1],
    [1, "#0000ff", 0.35],
  ],
);
assert.equal(nodes[0].opacity, 0.9);
assert.equal(nodes[0].stroke.kind, "solid");
assert.equal(nodes[0].stroke.color, "#ffffff");
assert.equal(nodes[0].stroke.opacity, 0.7);

const radial = nodes[1].fill;
assert.equal(radial.kind, "radial");
assert.deepEqual(
  radial.grad?.stops.map((s) => [s.offset, s.color, s.alpha ?? 1]),
  [
    [0, "#ffffff", 1],
    [1, "#000000", 0.5],
  ],
);

assert.equal(nodes[2].fill.kind, "linear");
assert.equal(nodes[2].fill.grad?.stops.length, 3); // xlink:href 继承
assert.equal(nodes[3].fill.kind, "solid");
assert.equal(nodes[3].fill.opacity, 0.2);
assert.equal(nodes[4].fill.kind, "none"); // 引用失效
assert.equal(nodes[5].fill.kind, "solid"); // 单色标退化成实色
assert.equal(nodes[5].fill.color, "#abcdef");
assert.equal(nodes[5].fill.opacity, 0.3); // 单色标透明度 0.6 × 组 fill-opacity 0.5

const bad = svgToPathNodes("<svg><g>", 1).nodes;
assert.equal(bad.length, 0);
const empty = svgToPathNodes('<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>', 1).nodes;
assert.equal(empty.length, 0);

console.log(
  `svg import: nodes=${nodes.length} linear=${linear.grad?.stops.length} radial=${radial.grad?.stops.length} ` +
    `alpha=${linear.grad?.stops[0].alpha} angle=${linear.grad?.angle} href=true oneStop=solid bad=0 empty=0`,
);
