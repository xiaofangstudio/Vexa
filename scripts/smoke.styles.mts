import { createDoc } from "../src/core/docOps";
import { solid, type PathNode, type TextNode } from "../src/core/types";
import {
  MAX_GRAPHIC_STYLES,
  addGraphicStyle,
  applyGraphicStyle,
  deleteGraphicStyle,
  graphicStyleById,
  graphicStyleUsage,
  normalizeGraphicStyles,
  stylesOf,
  updateGraphicStyle,
} from "../src/core/graphicStyles";
import { parseVex, serializeVex } from "../src/core/vex";

let failed = 0;
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(actual)}`);
  if (!ok) failed++;
};

const rect = (id: string, color = "#0f76d6", stroke = "#17171c"): PathNode => ({
  kind: "path",
  id,
  name: "矩形",
  subpaths: [{ anchors: [
    { x: 0, y: 0, hIn: null, hOut: null, smooth: false },
    { x: 100, y: 0, hIn: null, hOut: null, smooth: false },
    { x: 100, y: 100, hIn: null, hOut: null, smooth: false },
    { x: 0, y: 100, hIn: null, hOut: null, smooth: false },
  ], closed: true }],
  fill: solid(color),
  stroke: { kind: "solid", color: stroke, opacity: 1, width: 4, dash: [], cap: "butt", join: "miter" },
  opacity: 1, visible: true, locked: false,
});
const text = (id: string, color = "#333333"): TextNode => ({
  kind: "text", id, name: "文字", x: 0, y: 0, text: "Hello", size: 20, font: "Arial",
  fill: solid(color), opacity: 1, visible: true, locked: false,
});

// 清洗：坏输入、非法颜色、重复 id、上限
check("non-array styles empty", normalizeGraphicStyles("bad"), []);
check("missing fill dropped", normalizeGraphicStyles([{ id: "gs1", name: "坏", opacity: 1 }]), []);
check("normalize id/name/color", normalizeGraphicStyles([{ name: " 蓝色描边 ", fill: { kind: "solid", color: "#0F76D6", opacity: 1 }, stroke: { kind: "solid", color: "#E5484D", width: 6 }, opacity: 0.6, blend: "multiply" }]), [{
  id: "gs1", name: "蓝色描边", fill: { kind: "solid", color: "#0f76d6", opacity: 1 },
  stroke: { kind: "solid", color: "#e5484d", opacity: 1, width: 6, dash: [], cap: "butt", join: "miter", arrow: "none" },
  opacity: 0.6, blend: "multiply",
}]);
check("invalid color coerced", normalizeGraphicStyles([{ fill: { kind: "solid", color: "red" } }])[0].fill.color, "#0f76d6");
check("invalid blend dropped", normalizeGraphicStyles([{ fill: { kind: "solid", color: "#000000" }, blend: "glow" }])[0].blend, undefined);
check("duplicate id rewritten", normalizeGraphicStyles([{ id: "x", fill: { kind: "solid", color: "#000000" } }, { id: "x", fill: { kind: "solid", color: "#ffffff" } }]).map((s) => s.id), ["x", "x_2"]);
check("style cap", normalizeGraphicStyles(Array.from({ length: 80 }, (_, i) => ({ id: `g${i}`, name: `S${i}`, fill: { kind: "solid", color: "#123456", opacity: 1 }, opacity: 1 }))).length, MAX_GRAPHIC_STYLES);
check("gradient stops repaired", normalizeGraphicStyles([{ fill: { kind: "linear", color: "#000000", opacity: 1, grad: { angle: 45, stops: [{ offset: 0, color: "#ff0000" }, { offset: 1, color: "#0000ff" }] } } }])[0].fill.grad?.stops.length, 2);

const doc = createDoc("图形样式测试", 900, 600);
const p1 = rect("p1", "#0f76d6", "#17171c");
const p2 = rect("p2", "#ffffff", "#17171c");
const t1 = text("t1", "#333333");
doc.nodes = { p1, p2, t1 };
doc.root = ["p1", "p2", "t1"];

// 从选中捕获
check("capture needs selected path", addGraphicStyle(doc, undefined), { ok: false, error: "先选中一个路径或文字对象" });
const made = addGraphicStyle(doc, p1, "品牌主样式");
check("add style ok", made.ok, true);
check("add style id", made.style?.id, "gs1");
check("add style name", made.style?.name, "品牌主样式");
check("capture fill", made.style?.fill.color, "#0f76d6");
check("capture stroke width", made.style?.stroke?.width, 4);
check("capture opacity", made.style?.opacity, 1);
check("styles on doc", stylesOf(doc).length, 1);

// 文字样式没有描边
const textStyle = addGraphicStyle(doc, t1, "正文灰");
check("text style id", textStyle.style?.id, "gs2");
check("text style no stroke", textStyle.style?.stroke, undefined);
check("text style fill", textStyle.style?.fill.color, "#333333");

// 套用到多个对象（含文字），建立链接
check("apply style to path", applyGraphicStyle(doc, ["p2"], "gs1"), 1);
check("apply style to text", applyGraphicStyle(doc, ["t1"], "gs1"), 1);
check("path got fill", doc.nodes.p2.fill.color, "#0f76d6");
check("path got stroke", (doc.nodes.p2 as PathNode).stroke.width, 4);
check("text got fill", doc.nodes.t1.fill.color, "#0f76d6");
check("links set", [(doc.nodes.p2 as PathNode).graphicStyle, (doc.nodes.t1 as TextNode).graphicStyle], ["gs1", "gs1"]);
check("usage count", graphicStyleUsage(doc, "gs1"), 2);

// 用链接对象更新样式：改 p2 的填充与描边，再同步所有链接对象
(doc.nodes.p2 as PathNode).fill = solid("#e5484d");
(doc.nodes.p2 as PathNode).stroke.width = 9;
check("update style syncs", updateGraphicStyle(doc, "gs1", "p2"), 2);
check("style fill updated", graphicStyleById(doc, "gs1")?.fill.color, "#e5484d");
check("style stroke updated", graphicStyleById(doc, "gs1")?.stroke?.width, 9);
check("p1 kept value (unlinked)", doc.nodes.p1.fill.color, "#0f76d6");
check("t1 synced fill", doc.nodes.t1.fill.color, "#e5484d");
check("p2 still linked", (doc.nodes.p2 as PathNode).graphicStyle, "gs1");

// 删除只解链，外观保留
check("delete linked style", deleteGraphicStyle(doc, "gs1"), true);
check("style gone", stylesOf(doc).length, 1);
check("links cleared", [(doc.nodes.p2 as PathNode).graphicStyle, (doc.nodes.t1 as TextNode).graphicStyle], [undefined, undefined]);
check("appearance kept", doc.nodes.t1.fill.color, "#e5484d");

// .vex 往返保留样式与链接；悬空链接清理
doc.nodes.p1.graphicStyle = "gs2";
const round = parseVex(serializeVex(doc));
check("vex keeps styles", round.styles?.length, 1);
check("vex keeps link", (round.nodes.p1 as TextNode).graphicStyle ?? (round.nodes.p1 as PathNode).graphicStyle, "gs2");
check("vex keeps fill", round.nodes.p1.fill.color, "#0f76d6");
const stale = rect("p3");
stale.graphicStyle = "gs_missing";
doc.nodes.p3 = stale;
const cleaned = parseVex(serializeVex(doc));
check("stale link dropped", (cleaned.nodes.p3 as PathNode).graphicStyle, undefined);

// 组递归套用
const gdoc = createDoc("组套用", 900, 600);
const r1 = rect("r1");
const r2 = rect("r2");
const g = { kind: "group" as const, id: "g1", name: "组", children: ["r1", "r2"], expanded: true, opacity: 1, visible: true, locked: false };
gdoc.nodes = { g1: g, r1, r2 };
gdoc.root = ["g1"];
addGraphicStyle(gdoc, r1, "组样式");
check("group apply", applyGraphicStyle(gdoc, ["g1"], "gs1"), 2);
check("group children linked", [(gdoc.nodes.r1 as PathNode).graphicStyle, (gdoc.nodes.r2 as PathNode).graphicStyle], ["gs1", "gs1"]);

if (failed > 0) {
  console.log(`FAILED ${failed}`);
  process.exit(1);
}
console.log("styles smoke ok");
