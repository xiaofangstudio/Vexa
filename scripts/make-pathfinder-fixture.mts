import fs from "node:fs";
import { createDoc, rectPath } from "../src/core/docOps";
import { solid, type TextNode } from "../src/core/types";
import { serializeVex } from "../src/core/vex";

const doc = createDoc("路径查找器验收", 900, 600);
doc.artboards[0].bg = "#f7f3e9";

const bg = rectPath("bg", "背景", 0, 0, 900, 600);
bg.fill = solid("#f7f3e9");

const red = rectPath("red", "红块", 140, 160, 260, 220);
red.fill = solid("#e5484d");
const blue = rectPath("blue", "蓝块", 300, 240, 260, 220);
blue.fill = solid("#0f76d6");
const red2 = rectPath("red2", "红块 2", 430, 160, 180, 140);
red2.fill = solid("#e5484d");

const title: TextNode = {
  kind: "text", id: "title", name: "标题", x: 90, y: 70,
  text: "路径查找器验收", size: 34, font: "Microsoft YaHei", bold: true, lineHeight: 1.25, align: "left",
  fill: solid("#17171c"), opacity: 1, visible: true, locked: false,
};
const hint: TextNode = {
  kind: "text", id: "hint", name: "说明", x: 90, y: 112,
  text: "选中红块与蓝块，再点分割 / 修边 / 裁剪；红块与红块 2 可试合并。", size: 16,
  font: "Microsoft YaHei", bold: false, lineHeight: 1.25, align: "left",
  fill: solid("#6b6452"), opacity: 1, visible: true, locked: false,
};
for (const n of [bg, red, blue, red2, title, hint]) doc.nodes[n.id] = n;
doc.root.push("bg", "red", "blue", "red2", "title", "hint");
doc.seq = 20;

fs.writeFileSync("scripts/fixtures/pathfinder.vex", serializeVex(doc), "utf8");
console.log("wrote scripts/fixtures/pathfinder.vex", fs.statSync("scripts/fixtures/pathfinder.vex").size);
