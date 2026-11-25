import { createDoc, rectPath } from "../src/core/docOps";
import { EMPTY_LAYER_FILTER, filterLayerTree, isLayerFilterActive, layerKindName, nodeMatchesLayerFilter } from "../src/core/layerFilter";
import { parseVex, serializeVex } from "../src/core/vex";
import type { GroupNode, LayerTag, Node, TextNode, VexaDoc } from "../src/core/types";

let failed = 0;
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(actual)}`);
  if (!ok) failed++;
};

const group = (id: string, name: string, children: string[], extra: Partial<GroupNode> = {}): GroupNode => ({
  kind: "group", id, name, children, opacity: 1, visible: true, locked: false, ...extra,
});
const text = (id: string, name: string, body: string, tag?: LayerTag): TextNode => ({
  kind: "text", id, name, x: 0, y: 0, text: body, size: 24, font: "Arial", fill: { kind: "solid", color: "#000000", opacity: 1 },
  opacity: 1, visible: true, locked: false, tag,
});

const mk = (nodes: Record<string, Node>, root: string[]) => {
  const doc = createDoc("layer-filter", 800, 600);
  for (const [id, n] of Object.entries(nodes)) doc.nodes[id] = n;
  doc.root.push(...root);
  return doc;
};

const title = text("title", "标题", "主标题", "red");
const subtitle = text("subtitle", "说明", "副标题文字", "blue");
const clip = rectPath("clip", "剪裁路径", 0, 0, 10, 10);
const iconDot = rectPath("icon-dot", "圆点", 20, 0, 10, 10);
const iconBar = rectPath("icon-bar", "横条", 40, 0, 10, 10);
const card = group("card-group", "卡片组", ["title", "subtitle"], { tag: "green" });
const icon = group("icon-group", "图标组", ["icon-dot", "icon-bar"]);
const clipped = group("clipped", "导入剪裁组", ["clip", "title"], { clip: "clip" });
const doc: VexaDoc = mk({ title, subtitle, clip, "icon-dot": iconDot, "icon-bar": iconBar }, ["card-group", "icon-group", "clipped"]);
doc.nodes[card.id] = card;
doc.nodes[icon.id] = icon;
doc.nodes[clipped.id] = clipped;
doc.nodes[clip.id].tag = "purple";

check("empty filter inactive", isLayerFilterActive(EMPTY_LAYER_FILTER), false);
check("space query inactive", isLayerFilterActive({ query: "   ", tag: null }), false);
check("tag filter active", isLayerFilterActive({ query: "", tag: "red" }), true);
check("kind names", ["title", "clip", "icon-dot"].map((id) => layerKindName(doc.nodes[id])), ["文本", "路径", "路径"]);

check("name match", nodeMatchesLayerFilter(title, { query: "标题", tag: null }), true);
check("case-insensitive", nodeMatchesLayerFilter(text("x", "Logo", "", "red"), { query: "logo", tag: null }), true);
check("kind search", nodeMatchesLayerFilter(title, { query: "文本", tag: null }), true);
check("tag and query both", nodeMatchesLayerFilter(title, { query: "标题", tag: "blue" }), false);

const byTitle = filterLayerTree(doc, { query: "标题", tag: null });
check("title self", [...byTitle.self].sort(), ["title"]);
check("title subtree", [...byTitle.subtree].sort(), ["card-group", "clipped", "title"]);
check("title descendant groups", [...byTitle.descendant].sort(), ["card-group", "clipped"]);
check("title count", byTitle.count, 1);

const byGroup = filterLayerTree(doc, { query: "卡片", tag: null });
check("group self only", [...byGroup.self].sort(), ["card-group"]);
check("group no descendant", [...byGroup.descendant].sort(), []);
check("group count", byGroup.count, 1);

const byRed = filterLayerTree(doc, { query: "", tag: "red" });
check("red self", [...byRed.self].sort(), ["title"]);
check("red subtree opens ancestors", [...byRed.subtree].sort(), ["card-group", "clipped", "title"]);

const byBoth = filterLayerTree(doc, { query: "标题", tag: "blue" });
check("and filter self", [...byBoth.self], []);
check("and filter subtree", [...byBoth.subtree], []);
check("and filter count", byBoth.count, 0);

const byText = filterLayerTree(doc, { query: "文本", tag: null });
check("kind search finds text nodes", [...byText.self].sort(), ["subtitle", "title"]);
check("kind search excludes clip path", byText.self.has("clip"), false);

const cycle: VexaDoc = createDoc("cycle", 800, 600);
cycle.nodes.loop = group("loop", "环", ["loop"]);
cycle.root.push("loop");
const cyc = filterLayerTree(cycle, { query: "环", tag: null });
check("cyclic group terminates", cyc.count, 1);

const round = parseVex(serializeVex(doc));
check("tag survives save/load", round.nodes.title.tag, "red");
check("group tag survives save/load", round.nodes["card-group"].tag, "green");

const bad = JSON.parse(serializeVex(doc));
bad.doc.nodes.title.tag = "pink";
check("invalid tag dropped", parseVex(JSON.stringify(bad)).nodes.title.tag, undefined);

if (failed) {
  console.error(`\n${failed} FAILED`);
  process.exit(1);
}
console.log("\n所有图层过滤用例通过");
