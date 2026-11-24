import { createDoc, rectPath } from "../src/core/docOps";
import { canMoveLayer, moveLayerNode } from "../src/core/vectorOps";
import type { GroupNode, Node, VexaDoc } from "../src/core/types";

let failed = 0;
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(actual)}`);
  if (!ok) failed++;
};

const display = (doc: VexaDoc, parent: string | null): string[] => {
  if (!parent) return [...doc.root].reverse();
  const g = doc.nodes[parent];
  return g && g.kind === "group" ? [...g.children].reverse() : [];
};

const group = (id: string, children: string[]): GroupNode => ({
  kind: "group", id, name: id, children, opacity: 1, visible: true, locked: false,
});

const mk = (nodes: Record<string, Node>, root: string[], parents: Record<string, GroupNode> = {}) => {
  const doc = createDoc("layers", 800, 600);
  for (const [id, n] of Object.entries(nodes)) doc.nodes[id] = n;
  for (const [id, g] of Object.entries(parents)) doc.nodes[id] = g;
  doc.root.push(...root);
  return doc;
};

const a = rectPath("a", "A", 0, 0, 10, 10);
const b = rectPath("b", "B", 20, 0, 10, 10);
const c = rectPath("c", "C", 40, 0, 10, 10);
const d = rectPath("d", "D", 60, 0, 10, 10);
const e = rectPath("e", "E", 80, 0, 10, 10);
const doc = mk({ a, b, c, d, e }, ["g", "d", "e"], { g: group("g", ["a", "b", "c"]) });
check("initial root display", display(doc, null), ["e", "d", "g"]);
check("initial group display", display(doc, "g"), ["c", "b", "a"]);

// 组内排序：A 拖到 B 上方
check("move A before B", moveLayerNode(doc, "a", "b", "before"), { moved: true, parent: "g" });
check("group after A before B", display(doc, "g"), ["c", "a", "b"]);
check("group stored after A before B", doc.nodes.g.kind === "group" && doc.nodes.g.children, ["b", "a", "c"]);

// 组内排序：B 拖到 C 下方
check("move B after C", moveLayerNode(doc, "b", "c", "after"), { moved: true, parent: "g" });
check("group after B after C", display(doc, "g"), ["c", "b", "a"]);

// 子层拖出组：C 拖到根层 D 上方
check("move C before root D", moveLayerNode(doc, "c", "d", "before"), { moved: true, parent: null });
check("root after C before D", display(doc, null), ["e", "c", "d", "g"]);
check("group after C moved out", display(doc, "g"), ["b", "a"]);

// 顶层拖进组：C 拖到组行中间
check("move root C inside G", moveLayerNode(doc, "c", "g", "inside"), { moved: true, parent: "g" });
check("group after C inside", display(doc, "g"), ["c", "b", "a"]);
check("root after C inside", display(doc, null), ["e", "d", "g"]);

// 根层排序：A 子层拖到根层 E 下方
check("move A after root E", moveLayerNode(doc, "a", "e", "after"), { moved: true, parent: null });
check("root after A after E", display(doc, null), ["e", "a", "d", "g"]);
check("group after A moved out", display(doc, "g"), ["c", "b"]);

// 拒绝自身与非法目标
check("reject self", canMoveLayer(doc, "g", "g", "before"), "self");
check("reject inside path", canMoveLayer(doc, "a", "d", "inside"), "not-group");

// 拒绝把组拖进自己的后代
const x = rectPath("x", "X", 0, 0, 10, 10);
const h = group("h", ["x"]);
const cycle = mk({ x }, ["g2"], { g2: group("g2", ["h"]), h });
check("reject group into descendant", moveLayerNode(cycle, "g2", "h", "inside"), { moved: false, parent: null, reason: "cycle" });

// 同一容器根层排序：G 拖到 E 上方
check("move G before E", moveLayerNode(doc, "g", "e", "before"), { moved: true, parent: null });
check("root after G before E", display(doc, null), ["g", "e", "a", "d"]);

// 跨组：把一个组里的子层放进另一个已有子层的组
const p = rectPath("p", "P", 0, 0, 10, 10);
const q = rectPath("q", "Q", 20, 0, 10, 10);
const r = rectPath("r", "R", 40, 0, 10, 10);
const cross = mk({ p, q, r }, ["ga", "gb"], { ga: group("ga", ["p"]), gb: group("gb", ["q", "r"]) });
check("move P inside other group GB", moveLayerNode(cross, "p", "gb", "inside"), { moved: true, parent: "gb" });
check("GB after P inside", display(cross, "gb"), ["p", "r", "q"]);
check("GA after P moved out", display(cross, "ga"), []);

console.log(failed ? `FAILED ${failed}` : "ALL PASS");
if (failed) process.exit(1);
