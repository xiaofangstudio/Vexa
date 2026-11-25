import { createDoc, rectPath } from "../src/core/docOps";
import { allLayerFlag, layerDisplayOrder, nextLayerFlagValue, selectLayerIds } from "../src/core/layerSelection";
import type { GroupNode, Node, VexaDoc } from "../src/core/types";

let failed = 0;
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(actual)}`);
  if (!ok) failed++;
};

const group = (id: string, children: string[]): GroupNode => ({
  kind: "group", id, name: id, children, opacity: 1, visible: true, locked: false,
});

const mk = (nodes: Record<string, Node>, root: string[], parents: Record<string, GroupNode> = {}) => {
  const doc = createDoc("selection", 800, 600);
  for (const [id, n] of Object.entries(nodes)) doc.nodes[id] = n;
  for (const [id, g] of Object.entries(parents)) doc.nodes[id] = g;
  doc.root.push(...root);
  return doc;
};

const bg = rectPath("bg", "背景", 0, 0, 10, 10);
const foot = rectPath("foot", "页脚", 20, 0, 10, 10);
const card = group("card-group", ["title", "subtitle"]);
const icon = group("icon-group", ["icon-dot", "icon-bar"]);
const title = rectPath("title", "标题", 40, 0, 10, 10);
const subtitle = rectPath("subtitle", "副标题", 60, 0, 10, 10);
const dot = rectPath("icon-dot", "圆点", 80, 0, 10, 10);
const bar = rectPath("icon-bar", "横条", 100, 0, 10, 10);
const doc: VexaDoc = mk({ bg, foot, title, subtitle, "icon-dot": dot, "icon-bar": bar }, ["bg", "icon-group", "card-group", "foot"], {
  "card-group": card,
  "icon-group": icon,
});

check("collapsed order", layerDisplayOrder(doc, new Set()), ["foot", "card-group", "icon-group", "bg"]);
check("expanded order", layerDisplayOrder(doc, new Set(["card-group", "icon-group"])), [
  "foot", "card-group", "subtitle", "title", "icon-group", "icon-bar", "icon-dot", "bg",
]);

check("single select", selectLayerIds([], "foot", { metaKey: false, ctrlKey: false, shiftKey: false }, null, ["foot", "card-group", "icon-group", "bg"]), {
  ids: ["foot"], anchor: "foot",
});
check("ctrl add", selectLayerIds(["foot"], "card-group", { metaKey: false, ctrlKey: true, shiftKey: false }, "foot", ["foot", "card-group", "icon-group", "bg"]), {
  ids: ["foot", "card-group"], anchor: "card-group",
});
check("ctrl remove", selectLayerIds(["foot", "card-group"], "card-group", { metaKey: true, ctrlKey: false, shiftKey: false }, "card-group", ["foot", "card-group", "icon-group", "bg"]), {
  ids: ["foot"], anchor: "card-group",
});
check("shift range", selectLayerIds(["card-group"], "bg", { metaKey: false, ctrlKey: false, shiftKey: true }, "card-group", ["foot", "card-group", "icon-group", "icon-bar", "icon-dot", "bg"]), {
  ids: ["card-group", "icon-group", "icon-bar", "icon-dot", "bg"], anchor: "card-group",
});
check("shift additive", selectLayerIds(["foot"], "icon-group", { metaKey: false, ctrlKey: true, shiftKey: true }, "foot", ["foot", "card-group", "icon-group", "bg"]), {
  ids: ["foot", "card-group", "icon-group"], anchor: "foot",
});

const live = [bg, foot, title];
check("visible batch hides", nextLayerFlagValue(live, "visible"), false);
check("lock batch locks", nextLayerFlagValue(live, "locked"), true);
check("all visible", allLayerFlag(live, "visible"), true);
check("all locked", allLayerFlag(live, "locked"), false);

const hidden = [bg, foot];
for (const n of hidden) { n.visible = false; n.locked = true; }
check("hidden batch shows", nextLayerFlagValue(hidden, "visible"), true);
check("locked batch unlocks", nextLayerFlagValue(hidden, "locked"), false);
check("all hidden", allLayerFlag(hidden, "visible"), false);
check("all locked after lock", allLayerFlag(hidden, "locked"), true);
check("empty never active", allLayerFlag([], "visible"), false);

if (failed) {
  console.error(`\n${failed} FAILED`);
  process.exit(1);
}
console.log("\n所有图层多选用例通过");
