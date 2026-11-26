import { addNode, createDoc, rectPath } from "../src/core/docOps";
import { nodeBox } from "../src/core/geom";
import { clampSkewAngle, MAX_SKEW_ANGLE, shearNodesAround, skewNodes, skewNodesAround } from "../src/core/vectorOps";
import { noStroke, solid, type GroupNode, type PathNode, type SubPath, type VexaDoc } from "../src/core/types";

let failed = 0;
const near = (a: number, b: number, eps = 0.02) => Math.abs(a - b) <= eps;
const check = (name: string, ok: boolean, detail: unknown) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(detail)}`);
  if (!ok) failed++;
};

const anchorCoords = (node: PathNode) => node.subpaths[0].anchors.map((a) => [Math.round(a.x * 100) / 100, Math.round(a.y * 100) / 100]);
const sub = (anchors: PathNode["subpaths"][0]["anchors"], closed = false): SubPath => ({ anchors, closed });
const path = (id: string, subpaths: SubPath[]): PathNode => ({
  kind: "path", id, name: id, subpaths, fill: solid("#0f76d6"), stroke: noStroke(),
  opacity: 1, visible: true, locked: false,
});
const mk = (nodes: Record<string, PathNode>): VexaDoc => {
  const doc = createDoc("skew", 600, 400);
  for (const n of Object.values(nodes)) addNode(doc, n);
  return doc;
};

const d1 = mk({ r: rectPath("r", "矩形", 0, 0, 100, 100) });
skewNodes(d1, ["r"], 45, 0);
check("水平斜切 45° 后四角", JSON.stringify(anchorCoords(d1.nodes.r as PathNode)) === JSON.stringify([[-50, 0], [50, 0], [150, 100], [50, 100]]), true);
check("水平斜切后包围盒变宽", nodeBox(d1.nodes.r).w === 200, nodeBox(d1.nodes.r).w);

const d2 = mk({ r: rectPath("r", "矩形", 0, 0, 100, 100) });
skewNodes(d2, ["r"], 0, 45);
check("垂直斜切 45° 后四角", JSON.stringify(anchorCoords(d2.nodes.r as PathNode)) === JSON.stringify([[0, -50], [100, 50], [100, 150], [0, 50]]), true);
check("垂直斜切后包围盒变高", nodeBox(d2.nodes.r).h === 200, nodeBox(d2.nodes.r).h);

const handlePath = path("h", [sub([
  { x: 0, y: 0, hIn: null, hOut: null, smooth: false },
  { x: 100, y: 0, hIn: { x: 90, y: 0 }, hOut: { x: 110, y: 0 }, smooth: false },
  { x: 0, y: 100, hIn: null, hOut: null, smooth: false },
])]);
const d3 = mk({ h: handlePath });
skewNodes(d3, ["h"], 45, 0);
const hp = (d3.nodes.h as PathNode).subpaths[0].anchors[1];
check("斜切后锚点 X", near(hp.x, 50), hp.x);
check("斜切入手柄跟随", near(hp.hIn!.x, 40) && near(hp.hIn!.y, 0), hp.hIn);
check("斜切出手柄跟随", near(hp.hOut!.x, 60) && near(hp.hOut!.y, 0), hp.hOut);

const d4 = mk({
  r: rectPath("r", "矩形", 0, 0, 100, 100),
  g: { kind: "group", id: "g", name: "组", children: ["r"], opacity: 1, visible: true, locked: false } as GroupNode,
});
d4.root = ["g"];
skewNodes(d4, ["g"], 45, 0);
check("组内路径参与斜切", JSON.stringify(anchorCoords(d4.nodes.r as PathNode)) === JSON.stringify([[-50, 0], [50, 0], [150, 100], [50, 100]]), true);

const d5 = mk({
  h: path("h", [sub([
    { x: 0, y: 0, hIn: null, hOut: null, smooth: false },
    { x: 100, y: 0, hIn: { x: 90, y: 0 }, hOut: { x: 110, y: 0 }, smooth: false },
    { x: 0, y: 100, hIn: null, hOut: null, smooth: false },
  ])]),
});
skewNodesAround(d5, ["h"], 50, 50, 45, 0);
check("指定中心斜切锚点", near((d5.nodes.h as PathNode).subpaths[0].anchors[1].x, 50), (d5.nodes.h as PathNode).subpaths[0].anchors[1].x);

const d6 = mk({ r: rectPath("r", "矩形", 0, 0, 100, 100) });
skewNodes(d6, ["r"], 45, 0);
shearNodesAround(d6, ["r"], 50, 50, Math.tan(Math.PI / 3) - Math.tan(Math.PI / 4), 0);
check("按切线增量叠加到 60°", near((d6.nodes.r as PathNode).subpaths[0].anchors[0].x, -50 * Math.tan(Math.PI / 3)), (d6.nodes.r as PathNode).subpaths[0].anchors[0].x);

const clampHit = clampSkewAngle(120);
check("斜切角上限 80°", clampHit === MAX_SKEW_ANGLE, clampHit);
check("斜切角下限 -80°", clampSkewAngle(-120) === -MAX_SKEW_ANGLE, clampSkewAngle(-120));
check("非法角度归零", clampSkewAngle(Number.NaN) === 0, clampSkewAngle(Number.NaN));

const d7 = mk({ r: rectPath("r", "矩形", 0, 0, 100, 100) });
skewNodes(d7, ["missing"], 45, 0);
check("缺失节点不崩溃", JSON.stringify(anchorCoords(d7.nodes.r as PathNode)) === JSON.stringify([[0, 0], [100, 0], [100, 100], [0, 100]]), true);
skewNodes(d7, ["r"], 0, 0);
check("0° 不改坐标", near((d7.nodes.r as PathNode).subpaths[0].anchors[0].x, 0), true);

const d8 = mk({ r: rectPath("r", "矩形", 0, 0, 100, 100) });
skewNodes(d8, ["r"], 120, 0);
check("超过上限按 80° 截断", near((d8.nodes.r as PathNode).subpaths[0].anchors[0].x, -50 * Math.tan((80 * Math.PI) / 180)), (d8.nodes.r as PathNode).subpaths[0].anchors[0].x);

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
if (failed) process.exit(1);
