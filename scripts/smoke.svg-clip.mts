/** SVG clipPath 组裁切 / symbol viewBox 缩放导入冒烟。 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DOMParser } from "@xmldom/xmldom";

(globalThis as { DOMParser?: unknown }).DOMParser = DOMParser;
const { svgToNodes, docToSVG } = await import("../src/core/svg");
const { createDoc } = await import("../src/core/docOps");

const SVG = readFileSync(new URL("./fixtures/import-clip-symbol.svg", import.meta.url), "utf8");
const { nodes, roots, nextSeq } = svgToNodes(SVG, 1, "导入路径");
const byId = new Map(nodes.map((n) => [n.id, n]));
const groups = nodes.filter((n) => n.kind === "group");
assert.equal(groups.length, 2);
assert.equal(roots.length, 7);
assert.equal(nextSeq, 15);

const card = groups.find((g) =>
  g.children.some((id) => {
    const n = byId.get(id);
    return n?.kind === "text" && n.text === "裁切标题";
  }),
);
assert.ok(card, "card clip group missing");
if (!card) throw new Error("card clip group missing");
assert.equal(card.children[0], card.clip);
const cardClip = byId.get(card.clip);
assert.ok(cardClip?.kind === "path", "card clip path missing");
if (cardClip?.kind !== "path") throw new Error("card clip path missing");
assert.equal(cardClip.visible, false);
assert.equal(cardClip.subpaths.length, 2);
const cardPts = cardClip.subpaths.flatMap((s) => s.anchors);
assert.equal(Math.min(...cardPts.map((p) => p.x)), 90);
assert.equal(Math.max(...cardPts.map((p) => p.x)), 580);
assert.equal(Math.min(...cardPts.map((p) => p.y)), 60);
assert.equal(Math.max(...cardPts.map((p) => p.y)), 340);
assert.equal(card.children.length, 4); // clip + 背景矩形 + 两段文字
assert.ok(roots.includes(card.id));

const clippedText = nodes.find((n) => n.kind === "text" && n.text === "裁切标题");
assert.ok(clippedText?.kind === "text", "clipped title missing");
if (clippedText?.kind !== "text") throw new Error("clipped title missing");
assert.equal(clippedText.size, 48);
assert.equal(clippedText.fill.kind, "solid");
assert.equal(clippedText.fill.color, "#ffffff");

const band = groups.find((g) =>
  g.children.some((id) => {
    const n = byId.get(id);
    return n?.kind === "text" && n.text === "底部色带 · clipPath";
  }),
);
assert.ok(band, "band clip group missing");
if (!band) throw new Error("band clip group missing");
assert.equal(band.children.length, 3);
assert.ok(roots.includes(band.id));

const texts = nodes.filter((n) => n.kind === "text");
assert.equal(texts.length, 4);
const outside = texts.find((n) => n.kind === "text" && n.text === "裁切之外说明文字");
assert.ok(outside?.kind === "text", "unclipped text missing");

// 命中测试尊重 clip：色带组的整张画布矩形不能挡住上方卡片里的文字。
const pickDoc = createDoc("剪裁拾取", 900, 600);
pickDoc.nodes = {};
pickDoc.root = roots.slice();
for (const n of nodes) pickDoc.nodes[n.id] = n;
const { pickTop } = await import("../src/engine/pick");
const titleHit = { x: clippedText.x + 24, y: clippedText.y - 12 };
assert.equal(pickTop(pickDoc, titleHit, 4, true), clippedText.id);
assert.equal(pickTop(pickDoc, titleHit, 4, false), card.id);
const bandRect = nodes.find(
  (n) =>
    n.kind === "path" &&
    n.visible &&
    n.fill.kind === "solid" &&
    n.fill.color === "#102a43" &&
    n.id !== cardClip.id &&
    band.children.includes(n.id),
);
assert.ok(bandRect, "band background rect missing");
if (!bandRect) throw new Error("band background rect missing");
assert.notEqual(pickTop(pickDoc, { x: 450, y: 150 }, 4, true), bandRect.id);

const starFill = nodes.filter(
  (n) => n.kind === "path" && n.visible && n.fill.kind === "solid" && n.fill.color === "#ffd166",
);
assert.equal(starFill.length, 2);
const starBox = (n: (typeof starFill)[number]) => {
  if (n.kind !== "path") throw new Error("not path");
  const pts = n.subpaths.flatMap((s) => s.anchors);
  return {
    x: Math.min(...pts.map((p) => p.x)),
    y: Math.min(...pts.map((p) => p.y)),
    w: Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x)),
    h: Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y)),
  };
};
const bigStar = starBox(starFill[0]);
assert.ok(Math.abs(bigStar.w - 76.8) < 0.2, `symbol width should be 76.8, got ${bigStar.w}`);
assert.ok(Math.abs(bigStar.h - 74) < 0.2, `symbol height should be 74, got ${bigStar.h}`);
const smallStar = starBox(starFill[1]);
assert.ok(Math.abs(smallStar.w - 38.4) < 0.2, `meet symbol width should be 38.4, got ${smallStar.w}`);
assert.ok(Math.abs(smallStar.h - 37) < 0.2, `meet symbol height should be 37, got ${smallStar.h}`);
assert.ok(Math.abs((smallStar.x - 730) - 4.8) < 0.2);

// 嵌套 clip：组套组，根只暴露一个顶层组。
const NEST = `<svg xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="a"><rect x="0" y="0" width="100" height="100"/></clipPath>
    <clipPath id="b" style="clip-path:url(#a)"><rect x="50" y="0" width="80" height="100"/></clipPath>
  </defs>
  <g clip-path="url(#a)"><g style="clip-path:url(#b)"><rect x="-10" y="-10" width="140" height="140" fill="#f00"/></g></g>
</svg>`;
const nested = svgToNodes(NEST, 1, "导入路径");
const nById = new Map(nested.nodes.map((n) => [n.id, n]));
assert.equal(nested.roots.length, 1);
const outer = nById.get(nested.roots[0]);
assert.ok(outer?.kind === "group", "outer group missing");
if (outer?.kind !== "group") throw new Error("outer group missing");
assert.equal(outer.children[0], outer.clip);
const inner = nById.get(outer.children[1]);
assert.ok(inner?.kind === "group", "inner group missing");
if (inner?.kind !== "group") throw new Error("inner group missing");
assert.equal(inner.children[0], inner.clip);
assert.equal(inner.children[1] !== inner.clip, true);

// 缺失引用不建组；objectBoundingBox 暂不支持但必须保留原图形。
const BAD = `<svg xmlns="http://www.w3.org/2000/svg">
  <g clip-path="url(#missing)"><rect x="0" y="0" width="20" height="20" fill="#000"/></g>
  <g clip-path="url(#obox)"><rect x="20" y="0" width="20" height="20" fill="#000"/></g>
  <defs><clipPath id="obox" clipPathUnits="objectBoundingBox"><rect x="0" y="0" width="0.5" height="0.5"/></clipPath></defs>
</svg>`;
const bad = svgToNodes(BAD, 1, "导入路径");
assert.equal(bad.nodes.filter((n) => n.kind === "group").length, 0);
assert.equal(bad.nodes.filter((n) => n.kind === "path" && n.visible).length, 2);

// 导出回 SVG：剪裁组必须写出 clipPath，文字仍以可编辑 <text> 输出。
const board = createDoc("剪裁导出", 900, 600);
board.nodes = {};
board.root = roots.slice();
for (const n of nodes) board.nodes[n.id] = n;
const outSVG = docToSVG(board);
assert.match(outSVG, /<clipPath id="c\d+">/);
assert.match(outSVG, /clip-path="url\(#c\d+\)"/);
assert.match(outSVG, /<text transform="translate\(130 170\)"/);
assert.match(outSVG, /裁切标题/);

console.log(
  `clip nodes=${nodes.length} roots=${roots.length} groups=${groups.length} text=${texts.length} ` +
    `cardSubs=${cardClip.subpaths.length} bigStar=${bigStar.w.toFixed(1)} smallStar=${smallStar.w.toFixed(1)} ` +
    `nested=${nested.nodes.length} badGroups=0`,
);
