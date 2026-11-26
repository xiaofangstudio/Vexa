import { inscribedCircleOf } from "../src/core/inscribed";
import { rectPath } from "../src/core/docOps";
import { anchorAt, noStroke, solid, type PathNode, type Pt, type SubPath } from "../src/core/types";

let failed = 0;
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(actual)}`);
  if (!ok) failed++;
};
const near = (a: number, b: number, tol = 0.2) => Math.abs(a - b) <= tol;
const path = (subpaths: SubPath[], name = "测试路径"): PathNode => ({
  kind: "path",
  id: "p",
  name,
  subpaths,
  fill: solid("#0f76d6"),
  stroke: noStroke(),
  opacity: 1,
  visible: true,
  locked: false,
});
const sub = (pts: Pt[], closed = true): SubPath => ({
  anchors: pts.map((p) => anchorAt(p.x, p.y)),
  closed,
});

const square = rectPath("sq", "方形", 0, 0, 100, 100);
const c1 = inscribedCircleOf(square);
check("方形有内切圆", !!c1, true);
check("方形圆心 x", c1 ? near(c1.cx, 50) : null, true);
check("方形圆心 y", c1 ? near(c1.cy, 50) : null, true);
check("方形半径", c1 ? near(c1.r, 50, 0.05) : null, true);
check("方形圆在内部", c1 ? near(c1.cx - c1.r, 0, 0.1) && near(c1.cx + c1.r, 100, 0.1) : null, true);

const tri = path([sub([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }])], "三角形");
const c2 = inscribedCircleOf(tri);
check("三角形圆心 x", c2 ? near(c2.cx, 29.289, 0.4) : null, true);
check("三角形圆心 y", c2 ? near(c2.cy, 29.289, 0.4) : null, true);
check("三角形内切半径", c2 ? near(c2.r, 29.289, 0.4) : null, true);

const lshape = path([sub([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 30 }, { x: 30, y: 30 }, { x: 30, y: 100 }, { x: 0, y: 100 }])], "L 形");
const c3 = inscribedCircleOf(lshape);
check("L 形有内切圆", !!c3, true);
check("L 形半径约 17.57", c3 ? near(c3.r, 17.573, 0.3) : null, true);
check("L 形圆心在底臂", c3 ? c3.cy > 0 && c3.cy < 30 || c3.cx > 30 && c3.cx < 100 : null, true);
check("L 形圆不越界", c3 ? c3.cx - c3.r >= -0.1 && c3.cy - c3.r >= -0.1 && c3.cx + c3.r <= 100.1 && c3.cy + c3.r <= 100.1 : null, true);

const ring = path([
  sub([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }]),
  sub([{ x: 60, y: 60 }, { x: 60, y: 140 }, { x: 140, y: 140 }, { x: 140, y: 60 }]),
], "方环");
const c4 = inscribedCircleOf(ring);
check("方环有内切圆", !!c4, true);
check("方环半径约 35.15", c4 ? near(c4.r, 35.147, 0.3) : null, true);
check("方环圆心不在孔内", c4 ? !(c4.cx > 60 && c4.cx < 140 && c4.cy > 60 && c4.cy < 140) : null, true);

const open = path([sub([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], false)], "开放");
check("开放路径为空", inscribedCircleOf(open), null);
const tiny = path([sub([{ x: 0, y: 0 }, { x: 0.001, y: 0 }, { x: 0, y: 0.001 }])], "极小");
check("极小面积为空", inscribedCircleOf(tiny), null);

if (failed) {
  console.error(`\n${failed} 项失败`);
  process.exit(1);
}
console.log("\n全部通过");
