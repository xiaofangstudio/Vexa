import { createDoc } from "../src/core/docOps";
import { solid, type Node, type PathNode, type TextNode } from "../src/core/types";
import {
  MAX_SWATCHES,
  addSwatch,
  applySwatchToNodes,
  deleteSwatch,
  exportSwatchesText,
  linkFill,
  linkStroke,
  mergeSwatches,
  normalizeSwatches,
  parseSwatchesJSON,
  recolorSwatch,
  swatchById,
  swatchUsage,
  swatchesOf,
  updateSwatch,
} from "../src/core/swatches";
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

check("non-array swatches empty", normalizeSwatches("bad"), []);
check("invalid color dropped", normalizeSwatches([{ id: "a", name: "坏", color: "red" }]), []);
check("normalize fills id/name/kind", normalizeSwatches([{ name: " 品牌蓝 ", color: "#0F76D6", kind: "spot" }]), [{ id: "s1", name: "品牌蓝", color: "#0f76d6", kind: "spot" }]);
check("duplicate id rewritten", normalizeSwatches([{ id: "x", name: "A", color: "#000000" }, { id: "x", name: "B", color: "#ffffff" }]).map((s) => s.id), ["x", "x_2"]);
check("normalize cap", normalizeSwatches(Array.from({ length: 80 }, (_, i) => ({ id: `s${i}`, name: `C${i}`, color: "#123456" }))).length, MAX_SWATCHES);

const doc = createDoc("色板测试", 900, 600);
const r1 = addSwatch(doc, { name: "品牌蓝", color: "#0F76D6" });
check("add swatch ok", r1.ok, true);
check("add swatch id", r1.swatch?.id, "s1");
check("add swatch color", r1.swatch?.color, "#0f76d6");
check("duplicate same name+color", addSwatch(doc, { name: "品牌蓝", color: "#0f76d6" }), { ok: false, error: "同名同色色板已存在" });
check("invalid add color", addSwatch(doc, { name: "坏", color: "#12" }), { ok: false, error: "色板颜色需为 6 位十六进制" });
check("empty name fallback", swatchesOf(doc).length, 1);
const r2 = addSwatch(doc, { color: "#E5484D", kind: "spot" });
check("add spot", r2.swatch?.kind, "spot");
check("spot color", r2.swatch?.color, "#e5484d");

const p1 = rect("p1");
const p2 = rect("p2", "#ffffff");
const t1 = text("t1");
doc.nodes = { p1, p2, t1 };
doc.root = ["p1", "p2", "t1"];

check("apply fill to paths/text", applySwatchToNodes(doc, ["p1", "t1"], "s1", "fill"), 2);
check("linked fill color", doc.nodes.p1.kind === "path" ? doc.nodes.p1.fill.color : null, "#0f76d6");
check("linked fill id", doc.nodes.p1.kind === "path" ? doc.nodes.p1.fill.swatch : null, "s1");
check("text linked fill", doc.nodes.t1.kind === "text" ? doc.nodes.t1.fill.swatch : null, "s1");
check("untouched path", doc.nodes.p2.kind === "path" ? doc.nodes.p2.fill.swatch : null, undefined);
check("fill usage", swatchUsage(doc, "s1"), { fills: 2, strokes: 0, total: 2 });

check("apply stroke", applySwatchToNodes(doc, ["p2"], "s2", "stroke"), 1);
check("stroke link", doc.nodes.p2.kind === "path" ? doc.nodes.p2.stroke.swatch : null, "s2");
check("stroke color", doc.nodes.p2.kind === "path" ? doc.nodes.p2.stroke.color : null, "#e5484d");
check("usage fill+stroke", swatchUsage(doc, "s2"), { fills: 0, strokes: 1, total: 1 });

check("recolor linked", recolorSwatch(doc, "s1", "#123456"), 2);
check("recolor keeps swatch", doc.nodes.p1.kind === "path" ? doc.nodes.p1.fill.swatch : null, "s1");
check("recolor fill", doc.nodes.p1.kind === "path" ? doc.nodes.p1.fill.color : null, "#123456");
check("recolor text", doc.nodes.t1.kind === "text" ? doc.nodes.t1.fill.color : null, "#123456");
check("recolor spot", recolorSwatch(doc, "s2", "#abcdef"), 1);
check("recolor stroke", doc.nodes.p2.kind === "path" ? doc.nodes.p2.stroke.color : null, "#abcdef");
check("invalid recolor no change", recolorSwatch(doc, "s2", "red"), 0);

const grad: PathNode = rect("g1");
grad.fill = { kind: "linear", color: "#ffffff", opacity: 1, grad: { angle: 90, stops: [{ offset: 0, color: "#fff" }, { offset: 1, color: "#000" }] }, swatch: "s1" };
doc.nodes.g1 = grad;
doc.root.push("g1");
check("link fill replaces gradient", applySwatchToNodes(doc, ["g1"], "s1", "fill"), 1);
check("gradient cleared", (doc.nodes.g1 as PathNode).fill.grad, undefined);
check("opacity kept", (doc.nodes.g1 as PathNode).fill.opacity, 1);

check("update name/kind", updateSwatch(doc, "s1", { name: "主蓝", kind: "spot" }).swatch?.name, "主蓝");
check("update kind", swatchById(doc, "s1")?.kind, "spot");
check("update missing", updateSwatch(doc, "nope", { name: "X" }), { ok: false, error: "色板不存在" });
check("update invalid color", updateSwatch(doc, "s1", { color: "#zzzzzz" }), { ok: false, error: "色板颜色需为 6 位十六进制" });
check("update empty name", updateSwatch(doc, "s1", { name: "  " }), { ok: false, error: "色板名称不能为空" });

check("delete swatch returns true", deleteSwatch(doc, "s1"), true);
check("delete removes list", swatchesOf(doc).length, 1);
check("delete unlinks fills", (doc.nodes.p1 as PathNode).fill.swatch, undefined);
check("delete unlinks text", (doc.nodes.t1 as TextNode).fill.swatch, undefined);
check("delete keeps color", (doc.nodes.p1 as PathNode).fill.color, "#123456");
check("delete missing false", deleteSwatch(doc, "s1"), false);

const exp = exportSwatchesText(doc);
check("export format", JSON.parse(exp).format, "vexa-swatches");
check("export version", JSON.parse(exp).version, 1);
check("export count", JSON.parse(exp).swatches.length, 1);
const round = parseSwatchesJSON(exp);
check("parse roundtrip", round.list.map((s) => [s.name, s.color, s.kind]), [["色板 2", "#e5484d", "spot"]]);
check("parse array", parseSwatchesJSON(JSON.stringify([{ name: "数组", color: "#112233" }])).list.map((s) => s.name), ["数组"]);
check("parse malformed", parseSwatchesJSON("{").error, "JSON 解析失败");
check("parse wrong format", parseSwatchesJSON('{"format":"x","swatches":[]}').error, "不是 Vexa 色板文件");
check("parse empty", parseSwatchesJSON('{"format":"vexa-swatches","swatches":[]}').error, "文件里没有可用色板");

const doc2 = createDoc("合并", 100, 100);
addSwatch(doc2, { name: "A", color: "#111111" });
check("merge skips duplicate", mergeSwatches(doc2, [{ id: "x", name: "A", color: "#111111", kind: "process" }]).added, 0);
check("merge adds", mergeSwatches(doc2, [{ id: "y", name: "B", color: "#222222", kind: "spot" }]).added, 1);
check("merge count", swatchesOf(doc2).length, 2);

const doc3 = createDoc("容量", 100, 100);
for (let i = 0; i < MAX_SWATCHES; i++) addSwatch(doc3, { name: `色${i}`, color: `#${(i + 16).toString(16).padStart(2, "0")}0000` });
check("max swatches", swatchesOf(doc3).length, MAX_SWATCHES);
check("add over max", addSwatch(doc3, { name: "超", color: "#ffffff" }).ok, false);

// .vex 往返保留色板与链接；悬空引用在读取时清掉
const saved = serializeVex(doc);
const back = parseVex(saved);
check("vex swatches kept", swatchesOf(back).length, 1);
check("vex fill link kept", (back.nodes.p1 as PathNode).fill.swatch, undefined);
const doc4 = createDoc("引用", 100, 100);
addSwatch(doc4, { name: "蓝", color: "#0f76d6" });
const q = rect("q");
linkFill(q.fill, swatchById(doc4, "s1")!);
linkStroke(q.stroke, swatchById(doc4, "s1")!);
doc4.nodes.q = q;
doc4.root.push("q");
const back4 = parseVex(serializeVex(doc4));
check("vex fill/stroke links kept", [(back4.nodes.q as PathNode).fill.swatch, (back4.nodes.q as PathNode).stroke.swatch], ["s1", "s1"]);
const broken = JSON.parse(serializeVex(doc4));
broken.doc.nodes.q.fill.swatch = "missing";
broken.doc.nodes.q.stroke.swatch = "missing";
broken.doc.swatches[0].color = "red";
const backBroken = parseVex(JSON.stringify(broken));
check("dangling links removed", [(backBroken.nodes.q as PathNode).fill.swatch, (backBroken.nodes.q as PathNode).stroke.swatch], [undefined, undefined]);
check("bad swatch color dropped", swatchesOf(backBroken).length, 0);

if (failed) {
  console.log(`\n有 ${failed} 项失败`);
  process.exit(1);
}
console.log("\n所有文档色板用例通过");
