import { createDoc, rectPath } from "../src/core/docOps";
import { BOARD_PRESETS, applyBoardPreset, boardContentBounds, duplicateArtboard, fitBoardToContent, moveArtboard } from "../src/core/artboards";
import type { GroupNode, Node, VexaDoc } from "../src/core/types";

let failed = 0;
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(actual)}`);
  if (!ok) failed++;
};

const group = (id: string, name: string, children: string[], extra: Partial<GroupNode> = {}): GroupNode => ({
  kind: "group", id, name, children, opacity: 1, visible: true, locked: false, ...extra,
});
const mk = (nodes: Record<string, Node>, boardW = 800, boardH = 600) => {
  const doc = createDoc("artboards", boardW, boardH);
  for (const [id, n] of Object.entries(nodes)) doc.nodes[id] = n;
  return doc;
};

const card = rectPath("card", "卡片", 100, 150, 200, 100);
const clip = rectPath("clip", "卡片底", 100, 150, 200, 100);
const photo = rectPath("photo", "照片", 120, 160, 100, 50);
const cardGroup = group("card-group", "卡片组", ["clip", "photo"], { clip: "clip" });
const outside = rectPath("outside", "板外", 900, 50, 80, 80);
const doc: VexaDoc = mk({ card, clip, photo, outside });
doc.nodes["card-group"] = cardGroup;
doc.root.push("card-group", "card", "outside");

check("preset count", BOARD_PRESETS.length, 6);
const p = BOARD_PRESETS.find((x) => x.id === "a4")!;
applyBoardPreset(doc.artboards[0], p);
check("apply preset size", [doc.artboards[0].w, doc.artboards[0].h], [794, 1123]);
applyBoardPreset(doc.artboards[0], BOARD_PRESETS[0]);
doc.artboards[0].w = 800;
doc.artboards[0].h = 600;

const content = boardContentBounds(doc, 0);
check("content bounds include clipped group", content, { x: 100, y: 150, w: 200, h: 100 });
check("fit board", fitBoardToContent(doc, 0), true);
check("board after fit", [doc.artboards[0].x, doc.artboards[0].y, doc.artboards[0].w, doc.artboards[0].h], [100, 150, 200, 100]);

const dup = duplicateArtboard(doc, 0, true)!;
check("duplicate inserted", doc.artboards.length, 2);
check("duplicate index", dup.index, 1);
check("duplicate x", dup.board.x, 100 + 200 + 48);
check("duplicate roots", dup.roots.length, 2);
check("duplicate roots distinct", dup.roots.every((id) => id !== "card-group" && id !== "card"), true);

const clonedGroupId = dup.roots.find((id) => doc.nodes[id].kind === "group")!;
const clonedGroup = doc.nodes[clonedGroupId] as GroupNode;
check("cloned group children remapped", clonedGroup.children.every((id) => id !== "clip" && id !== "photo"), true);
check("cloned group clip valid", !!clonedGroup.clip && clonedGroup.children.includes(clonedGroup.clip), true);
check("originals intact", ["card-group", "clip", "photo"].map((id) => doc.nodes[id].id), ["card-group", "clip", "photo"]);
check("cloned group translated", Math.round((doc.nodes[clonedGroup.children[1]] as any).subpaths[0].anchors[0].x), 120 + dup.board.x - 100);
check("cloned card translated", Math.round((doc.nodes[dup.roots.find((id) => doc.nodes[id].kind === "path")!] as any).subpaths[0].anchors[0].x), 100 + dup.board.x - 100);

check("move board", moveArtboard(doc, 0, 1), true);
check("order after move", doc.artboards.map((b) => b.name), ["artboards 副本", "artboards"]);
check("move board oob", moveArtboard(doc, 1, 1), false);

const emptyDup = duplicateArtboard(doc, 1, false)!;
check("empty duplicate no roots", emptyDup.roots.length, 0);
check("empty duplicate board", doc.artboards.length, 3);

// 适配内容：路径计入描边宽度，隐藏根层与隐藏组内子层都不参与
const strokeDoc = createDoc("stroke-fit", 800, 600);
const stroked = rectPath("stroked", "描边矩形", 100, 100, 200, 100);
stroked.stroke = { kind: "solid", color: "#17171c", opacity: 1, width: 20, dash: [], cap: "butt", join: "miter" };
const hiddenOutside = rectPath("hidden-outside", "隐藏外框", 900, 50, 200, 200);
hiddenOutside.visible = false;
const hiddenInsideGroup = rectPath("hidden-inside", "组内隐藏", 1100, 50, 200, 200);
hiddenInsideGroup.visible = false;
const visibleInsideGroup = rectPath("visible-inside", "组内可见", 120, 120, 40, 40);
const strokeGroup = group("stroke-group", "描边组", ["hidden-inside", "visible-inside"]);
strokeDoc.nodes.stroked = stroked;
strokeDoc.nodes["hidden-outside"] = hiddenOutside;
strokeDoc.nodes["hidden-inside"] = hiddenInsideGroup;
strokeDoc.nodes["visible-inside"] = visibleInsideGroup;
strokeDoc.nodes["stroke-group"] = strokeGroup;
strokeDoc.root.push("stroked", "hidden-outside", "stroke-group");
check("stroke fit bounds", boardContentBounds(strokeDoc, 0), { x: 90, y: 90, w: 220, h: 120 });
check("stroke fit ignores hidden", fitBoardToContent(strokeDoc, 0), true);
check("stroke fit board", [strokeDoc.artboards[0].x, strokeDoc.artboards[0].y, strokeDoc.artboards[0].w, strokeDoc.artboards[0].h], [90, 90, 220, 120]);

const widthPadDoc = createDoc("width-pad", 800, 600);
const variable = rectPath("variable", "非均匀描边", 100, 100, 100, 100);
variable.stroke = {
  kind: "solid", color: "#17171c", opacity: 1, width: 10, dash: [], cap: "butt", join: "miter",
  widthPoints: [
    { t: 0, left: 4, right: 4 },
    { t: 1, left: 1, right: 1 },
  ],
};
widthPadDoc.nodes.variable = variable;
widthPadDoc.root.push("variable");
check("nonuniform stroke pad", boardContentBounds(widthPadDoc, 0), { x: 80, y: 80, w: 140, h: 140 });

if (failed) {
  console.error(`\n${failed} FAILED`);
  process.exit(1);
}
console.log("\n所有画板管理用例通过");
