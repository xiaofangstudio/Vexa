import { addNode, createDoc, rectPath } from "../src/core/docOps";
import { alignAnchors, anchorsNeedAlign, canJoinAnchors, joinAnchors } from "../src/core/anchorOps";
import { noStroke, solid, type Anchor, type AnchorRef, type PathNode, type SubPath, type VexaDoc } from "../src/core/types";

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
const sub = (anchors: Anchor[], closed = false): SubPath => ({ anchors, closed });
const path = (id: string, subpaths: SubPath[]): PathNode => ({
  kind: "path",
  id,
  name: id,
  subpaths,
  fill: solid("#0f76d6"),
  stroke: noStroke(),
  opacity: 1,
  visible: true,
  locked: false,
});
const mk = (nodes: Record<string, PathNode>): VexaDoc => {
  const doc = createDoc("anchorops", 400, 300);
  for (const n of Object.values(nodes)) addNode(doc, n);
  return doc;
};
const ax = (doc: VexaDoc, id: string, si: number, ai: number) => {
  const a = doc.nodes[id].subpaths[si].anchors[ai] as Anchor;
  return [a.x, a.y, a.hIn ? [a.hIn.x, a.hIn.y] : null, a.hOut ? [a.hOut.x, a.hOut.y] : null];
};
const ref = (id: string, si: number, ai: number): AnchorRef => ({ nodeId: id, si, ai });

// ---------- 锚点对齐 ----------
const d1 = mk({
  a: rectPath("a", "A", 0, 0, 100, 50),
  b: rectPath("b", "B", 200, 100, 50, 50),
});
check("左对齐只移动右侧锚点", alignAnchors(d1, [ref("a", 0, 1), ref("b", 0, 2)], "left"), 1);
check("左对齐 x=100", [ax(d1, "a", 0, 1)[0], ax(d1, "b", 0, 2)[0]], [100, 100]);
check("左对齐 y 不变", ax(d1, "b", 0, 2)[1], 150);

const d2 = mk({ a: rectPath("a", "A", 0, 0, 100, 50), b: rectPath("b", "B", 200, 100, 50, 50) });
check("右对齐移动左侧锚点", alignAnchors(d2, [ref("a", 0, 0), ref("b", 0, 0)], "right"), 1);
check("右对齐 x=200", ax(d2, "a", 0, 0)[0], 200);

const d3 = mk({ a: rectPath("a", "A", 0, 0, 100, 50), b: rectPath("b", "B", 200, 100, 50, 50) });
check("水平居中两侧都移动", alignAnchors(d3, [ref("a", 0, 2), ref("b", 0, 0)], "hcenter"), 2);
check("水平居中 x=150", [ax(d3, "a", 0, 2)[0], ax(d3, "b", 0, 0)[0]], [150, 150]);

const d4 = mk({ a: rectPath("a", "A", 0, 0, 100, 50), b: rectPath("b", "B", 200, 100, 50, 50) });
check("顶对齐只移动下侧锚点", alignAnchors(d4, [ref("a", 0, 2), ref("b", 0, 0)], "top"), 1);
check("顶对齐 y=50", ax(d4, "b", 0, 0)[1], 50);

const d5 = mk({ a: rectPath("a", "A", 0, 0, 100, 50), b: rectPath("b", "B", 200, 100, 50, 50) });
check("垂直居中两侧都移动", alignAnchors(d5, [ref("a", 0, 2), ref("b", 0, 0)], "vcenter"), 2);
check("垂直居中 y=75", [ax(d5, "a", 0, 2)[1], ax(d5, "b", 0, 0)[1]], [75, 75]);

const d6 = mk({ a: rectPath("a", "A", 0, 0, 100, 50), b: rectPath("b", "B", 200, 100, 50, 50) });
check("底对齐移动上侧锚点", alignAnchors(d6, [ref("a", 0, 0), ref("b", 0, 2)], "bottom"), 1);
check("底对齐 y=150", ax(d6, "a", 0, 0)[1], 150);

const d7 = mk({ a: rectPath("a", "A", 0, 0, 50, 50) });
check("少于两个有效锚点返回 0", alignAnchors(d7, [ref("a", 0, 0), ref("none", 0, 0)], "left"), 0);
check("重复引用去重后不足 2 返回 0", alignAnchors(d7, [ref("a", 0, 0), ref("a", 0, 0)], "left"), 0);
check("已经对齐返回 0", alignAnchors(d7, [ref("a", 0, 0), ref("a", 0, 1)], "top"), 0);
check("已经对齐时无需写历史", anchorsNeedAlign(d7, [ref("a", 0, 0), ref("a", 0, 1)], "top"), false);
const dNeed = mk({ a: rectPath("a", "A", 0, 0, 100, 50), b: rectPath("b", "B", 200, 100, 50, 50) });
check("未对齐时需要写历史", anchorsNeedAlign(dNeed, [ref("a", 0, 0), ref("b", 0, 0)], "left"), true);
alignAnchors(dNeed, [ref("a", 0, 0), ref("b", 0, 0)], "left");
check("对齐后不再需要移动", anchorsNeedAlign(dNeed, [ref("a", 0, 0), ref("b", 0, 0)], "left"), false);

const d8 = mk({
  a: path("a", [sub([hp(10, 20), hp(100, 80)])]),
});
check("对齐时手柄同步平移", alignAnchors(d8, [ref("a", 0, 1), ref("a", 0, 0)], "left"), 1);
check("手柄跟着锚点走", ax(d8, "a", 0, 1), [10, 80, [5, 80], [15, 80]]);

// ---------- 连接 ----------
const mkJoin = (subpaths: SubPath[], id = "j") => mk({ j: path(id, subpaths) });

const j1 = mkJoin([sub([pt(0, 0), pt(50, 0), pt(100, 0)])]);
check("同一开放子路径可连接", canJoinAnchors(j1, [ref("j", 0, 0), ref("j", 0, 2)]), true);
check("连接同子路径首尾", joinAnchors(j1, [ref("j", 0, 0), ref("j", 0, 2)]), { ok: true });
check("同子路径变闭合", j1.nodes.j.subpaths[0].closed, true);
check("闭合后锚点数不变", j1.nodes.j.subpaths[0].anchors.length, 3);
check("闭合后仍只有一条子路径", j1.nodes.j.subpaths.length, 1);

const j2 = mkJoin([sub([pt(0, 0), pt(50, 0), pt(100, 0)])]);
check("非端点不能连接", canJoinAnchors(j2, [ref("j", 0, 0), ref("j", 0, 1)]), false);
check("非端点连接返回错误", joinAnchors(j2, [ref("j", 0, 0), ref("j", 0, 1)]).ok, false);

const j3 = mkJoin([sub([pt(0, 0), pt(10, 0)]), sub([pt(100, 0), pt(110, 0)])]);
check("两条开放子路径可连接", canJoinAnchors(j3, [ref("j", 0, 1), ref("j", 1, 0)]), true);
check("连接两条子路径", joinAnchors(j3, [ref("j", 0, 1), ref("j", 1, 0)]), { ok: true });
check("两条合成一条", j3.nodes.j.subpaths.length, 1);
check("合并后顺序", j3.nodes.j.subpaths[0].anchors.map((a) => a.x), [0, 10, 100, 110]);
check("合并后保持开放", j3.nodes.j.subpaths[0].closed, false);
check("接缝多余手柄清空", [
  j3.nodes.j.subpaths[0].anchors[1].hOut,
  j3.nodes.j.subpaths[0].anchors[2].hIn,
], [null, null]);

const j4 = mkJoin([sub([pt(0, 0), pt(10, 0)]), sub([pt(100, 0), pt(110, 0)])]);
check("反方向端点也可连接", joinAnchors(j4, [ref("j", 0, 0), ref("j", 1, 1)]), { ok: true });
check("反向后合并顺序", j4.nodes.j.subpaths[0].anchors.map((a) => a.x), [10, 0, 110, 100]);
check("反向子路径首尾仍开放", j4.nodes.j.subpaths[0].closed, false);

const j5 = mkJoin([
  sub([pt(0, 0), { x: 10, y: 0, hIn: { x: 5, y: 0 }, hOut: { x: 15, y: 0 }, smooth: false }]),
  sub([{ x: 10, y: 0, hIn: { x: 9, y: 0 }, hOut: { x: 12, y: 0 }, smooth: false }, pt(20, 0)]),
]);
check("重合端点连接成功", joinAnchors(j5, [ref("j", 0, 1), ref("j", 1, 0)]), { ok: true });
check("重合端点合并为一个锚点", j5.nodes.j.subpaths[0].anchors.length, 3);
check("重合锚点保留内外手柄", [
  j5.nodes.j.subpaths[0].anchors[1].hIn,
  j5.nodes.j.subpaths[0].anchors[1].hOut,
], [{ x: 5, y: 0 }, { x: 12, y: 0 }]);

const j6 = mkJoin([sub([pt(0, 0), pt(10, 0)], true), sub([pt(100, 0), pt(110, 0)])]);
check("闭合子路径不能连接", canJoinAnchors(j6, [ref("j", 0, 1), ref("j", 1, 0)]), false);
check("闭合子路径返回错误", joinAnchors(j6, [ref("j", 0, 1), ref("j", 1, 0)]).ok, false);

const j7 = mkJoin([sub([pt(0, 0), pt(10, 0)]), sub([pt(100, 0), pt(110, 0)])]);
check("重复引用不能连接", canJoinAnchors(j7, [ref("j", 0, 1), ref("j", 0, 1)]), false);

const ja = mk({ a: path("a", [sub([pt(0, 0), pt(10, 0)])]), b: path("b", [sub([pt(100, 0), pt(110, 0)])]) });
check("跨节点暂不支持", canJoinAnchors(ja, [ref("a", 0, 1), ref("b", 0, 0)]), false);
check("跨节点返回中文错误", joinAnchors(ja, [ref("a", 0, 1), ref("b", 0, 0)]).error?.includes("跨路径"), true);

const j8 = mkJoin([sub([pt(0, 0), pt(10, 0)]), sub([pt(100, 0), pt(110, 0)])]);
check("后一条选为基准也能连接", joinAnchors(j8, [ref("j", 1, 1), ref("j", 0, 0)]), { ok: true });
check("后一条基准合并到单条", j8.nodes.j.subpaths.length, 1);
check("后一条基准合并结果", j8.nodes.j.subpaths[0].anchors.map((a) => a.x), [100, 110, 0, 10]);

const j9 = mkJoin([sub([pt(0, 0), pt(10, 0)])]);
check("单个锚点返回错误", joinAnchors(j9, [ref("j", 0, 1)]).ok, false);
check("空引用返回错误", joinAnchors(j9, []).ok, false);

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
if (failed) process.exit(1);
