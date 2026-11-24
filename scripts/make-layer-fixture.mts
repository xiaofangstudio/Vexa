import fs from "node:fs";
import { createDoc, ellipsePath, rectPath } from "../src/core/docOps";
import { solid, noStroke, type GroupNode, type Node, type TextNode } from "../src/core/types";
import { serializeVex } from "../src/core/vex";

const text = (id: string, name: string, value: string, x: number, y: number, size: number, color: string): TextNode => ({
  kind: "text", id, name, x, y, text: value, size, font: "Microsoft YaHei", bold: size >= 40,
  lineHeight: 1.25, align: "left", fill: solid(color), opacity: 1, visible: true, locked: false,
});

const group = (id: string, name: string, children: string[]): GroupNode => ({
  kind: "group", id, name, children, opacity: 1, visible: true, locked: false,
});

const doc = createDoc("图层拖拽验收", 900, 600);
const bg = rectPath("bg", "背景", 0, 0, 900, 600);
bg.fill = solid("#f4f1e8");
bg.stroke = noStroke();
const card = rectPath("card", "卡片底", 120, 110, 660, 380);
card.fill = solid("#fffaf0");
card.stroke = { ...card.stroke, kind: "solid", color: "#e7dfcc", width: 1 };
const dot = ellipsePath("icon-dot", "圆点", 720, 430, 42, 42);
dot.fill = solid("#e5484d");
const bar = rectPath("icon-bar", "短条", 620, 220, 120, 18);
bar.fill = solid("#f2b705");
const nodes: Node[] = [
  bg,
  card,
  text("title", "标题", "图层排序验收", 166, 200, 46, "#17171c"),
  text("subtitle", "副标题", "组内排序 · 拖入组 · 拖出组", 166, 266, 22, "#5a5540"),
  text("hint", "操作提示", "图层面板里拖动任意行", 166, 320, 18, "#8a8168"),
  dot,
  bar,
  text("foot", "页脚", "Vexa · 图层面板验收", 120, 550, 18, "#8a8168"),
];
for (const n of nodes) doc.nodes[n.id] = n;
doc.nodes["card-group"] = group("card-group", "卡片组", ["card", "title", "subtitle", "hint"]);
doc.nodes["icon-group"] = group("icon-group", "图标组", ["icon-dot", "icon-bar"]);
doc.root.push("bg", "icon-group", "card-group", "foot");
doc.seq = 30;

fs.mkdirSync("scripts/fixtures", { recursive: true });
fs.writeFileSync("scripts/fixtures/layer-panel.vex", serializeVex(doc));
console.log("wrote scripts/fixtures/layer-panel.vex", fs.statSync("scripts/fixtures/layer-panel.vex").size, "bytes");
