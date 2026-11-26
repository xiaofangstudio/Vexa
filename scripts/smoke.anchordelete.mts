import { createDoc, rectPath } from "../src/core/docOps";
import { anchorsInBox, deleteAnchors, hasDeletableAnchors } from "../src/core/anchorOps";
import { noStroke, solid, type Anchor, type AnchorRef, type GroupNode, type PathNode, type SubPath, type VexaDoc } from "../src/core/types";

let failed = 0;
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(actual)}`);
  if (!ok) failed++;
};
const pt = (x: number, y: number): Anchor => ({ x, y, hIn: null, hOut: null, smooth: false });
const hp = (x: number, y: number): Anchor => ({
  x, y,
  hIn: { x: x - 5, y },
  hOut: { x: x + 5, y },
  smooth: true,
});
const path = (id: string, name: string, subpaths: SubPath[]): PathNode => ({
  kind: "path", id, name, subpaths,
  fill: solid("#0f76d6"), stroke: noStroke(), opacity: 1, visible: true, locked: false,
});
const group = (id: string, children: string[], clip?: string): GroupNode => ({
  kind: "group", id, name: id, children, clip,
  opacity: 1, visible: true, locked: false,
});
const ref = (id: string, si: number, ai: number): AnchorRef => ({ nodeId: id, si, ai });
const mk = (nodes: Array<PathNode | GroupNode>, tree: string[]): VexaDoc => {
  const doc = createDoc("anchordelete", 400, 300);
  for (const n of nodes) doc.nodes[n.id] = n;
  doc.root = tree;
  return doc;
};
const anchors = (doc: VexaDoc, id: string, si = 0) => {
  const n = doc.nodes[id] as PathNode | undefined;
  return n?.subpaths[si]?.anchors.map((a) => [a.x, a.y]) ?? null;
};
const subCount = (doc: VexaDoc, id: string) => (doc.nodes[id] as PathNode | undefined)?.subpaths.length ?? 0;

// ---------- 框选 ----------
const boxDoc = mk([
  rectPath("a", "A", 0, 0, 100, 50),
  path("b", "B", [
    { anchors: [pt(150, 10), pt(200, 10), pt(200, 60)], closed: false },
    { anchors: [pt(300, 200), pt(350, 200)], closed: false },
  ]),
], ["a", "b"]);
check("框选只收框内锚点", anchorsInBox(boxDoc, ["a"], { x: 0, y: 0, w: 60, h: 60 }).map((r) => r.ai), [0, 3]);
check("框选边界包含", anchorsInBox(boxDoc, ["a"], { x: 100, y: 50, w: 0, h: 0 }).map((r) => r.ai), [2]);
check("框选跨子路径", anchorsInBox(boxDoc, ["b"], { x: 290, y: 190, w: 70, h: 20 }).map((r) => [r.si, r.ai]), [[1, 0], [1, 1]]);
check("框选空区域", anchorsInBox(boxDoc, ["a"], { x: 120, y: 80, w: 20, h: 20 }), []);

const hidden = rectPath("h", "H", 0, 0, 50, 50);
hidden.visible = false;
const locked = rectPath("l", "L", 0, 0, 50, 50);
locked.locked = true;
const vis = mk([hidden, locked, rectPath("v", "V", 0, 0, 50, 50)], ["h", "l", "v"]);
check("框选跳过隐藏路径", anchorsInBox(vis, ["h"], { x: -10, y: -10, w: 100, h: 100 }), []);
check("框选跳过锁定路径", anchorsInBox(vis, ["l"], { x: -10, y: -10, w: 100, h: 100 }), []);
check("框选可见路径", anchorsInBox(vis, ["v"], { x: -10, y: -10, w: 100, h: 100 }).length, 4);

const gd = mk([
  group("g", ["ga", "gb"]),
  path("ga", "GA", [{ anchors: [pt(10, 10), pt(20, 10)], closed: false }]),
  path("gb", "GB", [{ anchors: [pt(100, 100), pt(110, 100)], closed: false }]),
], ["g"]);
check("框选递归组内路径", anchorsInBox(gd, ["g"], { x: 0, y: 0, w: 50, h: 50 }).map((r) => r.nodeId), ["ga", "ga"]);
check("框选组外不带入", anchorsInBox(gd, ["g"], { x: 300, y: 300, w: 50, h: 50 }), []);

// ---------- 删除 ----------
const d1 = mk([rectPath("a", "A", 0, 0, 100, 50)], ["a"]);
check("删除矩形一个锚点", deleteAnchors(d1, [ref("a", 0, 0)]), 1);
check("矩形剩三个锚点", anchors(d1, "a"), [[100, 0], [100, 50], [0, 50]]);
check("路径仍闭合", (d1.nodes.a as PathNode).subpaths[0].closed, true);

const d2 = mk([rectPath("a", "A", 0, 0, 100, 50)], ["a"]);
check("删除两个锚点计数", deleteAnchors(d2, [ref("a", 0, 0), ref("a", 0, 1)]), 2);
check("剩两个锚点仍保留闭合路径", anchors(d2, "a"), [[100, 50], [0, 50]]);
check("闭合标记保持", (d2.nodes.a as PathNode).subpaths[0].closed, true);

const d3 = mk([rectPath("a", "A", 0, 0, 100, 50)], ["a"]);
check("删到只剩一个锚点计数", deleteAnchors(d3, [ref("a", 0, 0), ref("a", 0, 1), ref("a", 0, 2)]), 3);
check("路径节点被删除", d3.nodes.a, undefined);
check("根层同步清空", d3.root, []);

const d4 = mk([path("o", "O", [{ anchors: [pt(0, 0), pt(50, 0), pt(100, 0), pt(150, 0)], closed: false }])], ["o"]);
check("开放路径删端点", deleteAnchors(d4, [ref("o", 0, 0)]), 1);
check("开放状态保持", (d4.nodes.o as PathNode).subpaths[0].closed, false);
check("剩余端点顺序", anchors(d4, "o"), [[50, 0], [100, 0], [150, 0]]);

const d5 = mk([rectPath("a", "A", 0, 0, 100, 50)], ["a"]);
check("重复引用只删一次", deleteAnchors(d5, [ref("a", 0, 0), ref("a", 0, 0)]), 1);
check("重复引用剩余三个", anchors(d5, "a")?.length, 3);
check("空引用不删除", deleteAnchors(d5, []), 0);
check("非法引用不删除", deleteAnchors(d5, [ref("none", 0, 0), ref("a", 9, 9)]), 0);
check("非法引用后路径不变", anchors(d5, "a")?.length, 3);

const d6 = mk([
  path("m", "M", [
    { anchors: [pt(0, 0), pt(10, 0), pt(20, 0)], closed: false },
    { anchors: [pt(100, 100), pt(110, 100), pt(120, 100)], closed: false },
  ]),
], ["m"]);
check("第一条子路径删到不足两个", deleteAnchors(d6, [ref("m", 0, 0), ref("m", 0, 1)]), 2);
check("只剩第二条子路径", subCount(d6, "m"), 1);
check("剩余子路径内容不变", anchors(d6, "m", 0), [[100, 100], [110, 100], [120, 100]]);

const d7 = mk([
  group("g", ["g2"]),
  group("g2", ["p"]),
  path("p", "P", [
    { anchors: [pt(0, 0), pt(10, 0), pt(20, 0)], closed: false },
    { anchors: [pt(100, 100), pt(110, 100), pt(120, 100)], closed: false },
  ]),
], ["g"]);
check("两条子路径全删空节点", deleteAnchors(d7, [ref("p", 0, 0), ref("p", 0, 1), ref("p", 1, 0), ref("p", 1, 1)]), 4);
check("路径节点删除", d7.nodes.p, undefined);
check("空子组清理", d7.nodes.g2, undefined);
check("空祖先组清理", d7.nodes.g, undefined);
check("根层清空", d7.root, []);

const d8 = mk([
  group("g", ["p", "q"]),
  path("p", "P", [{ anchors: [pt(0, 0), pt(10, 0), pt(20, 0)], closed: false }]),
  path("q", "Q", [{ anchors: [pt(100, 100), pt(110, 100), pt(120, 100)], closed: false }]),
], ["g"]);
check("删空一个子路径但节点仍有另一条", deleteAnchors(d8, [ref("p", 0, 0), ref("p", 0, 1)]), 2);
check("组保留兄弟路径", d8.nodes.g !== undefined, true);
check("兄弟路径内容不变", anchors(d8, "q"), [[100, 100], [110, 100], [120, 100]]);

const clipped = rectPath("c", "C", 0, 0, 100, 50);
const d9 = mk([
  group("g", ["c", "art"], "c"),
  clipped,
  path("art", "Art", [{ anchors: [pt(10, 10), pt(20, 10)], closed: false }]),
], ["g"]);
check("剪切蒙版路径不可删", hasDeletableAnchors(d9, [ref("c", 0, 0)]), false);
check("剪切蒙版删除返回 0", deleteAnchors(d9, [ref("c", 0, 0)]), 0);
check("剪切蒙版路径保留", anchors(d9, "c")?.length, 4);
check("普通路径可删", hasDeletableAnchors(d9, [ref("art", 0, 0)]), true);

const d10 = mk([path("h", "H", [{ anchors: [hp(0, 0), hp(100, 0), hp(200, 0)], closed: false }])], ["h"]);
check("删中间锚点保留相邻手柄", deleteAnchors(d10, [ref("h", 0, 1)]), 1);
check("左手柄不变", anchors(d10, "h"), [[0, 0], [200, 0]]);
check("手柄结构不变", (d10.nodes.h as PathNode).subpaths[0].anchors[0].hOut, { x: 5, y: 0 });

check("有效引用预检", hasDeletableAnchors(d1, [ref("a", 0, 0)]), true);
check("空引用预检", hasDeletableAnchors(d1, []), false);

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
if (failed) process.exit(1);
