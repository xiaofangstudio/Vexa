import { circleFromCenter, circleFromDiameter, circleFromDrag, circleThroughThree, constrain45 } from "../src/core/circle";
import { circlePath } from "../src/core/docOps";

let failed = 0;
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(actual)}`);
  if (!ok) failed++;
};
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

const s0 = constrain45({ x: 0, y: 0 }, { x: 10, y: 10 });
check("45° 精确对角 x", near(s0.x, 10), true);
check("45° 精确对角 y", near(s0.y, 10), true);
const s1 = constrain45({ x: 0, y: 0 }, { x: 10, y: 9 });
check("接近 45° 吸附", near(s1.x, s1.y), true);
const s2 = constrain45({ x: 0, y: 0 }, { x: 10, y: 1 });
check("接近水平吸附", s2, { x: Math.hypot(10, 1), y: 0 });

const c1 = circleFromCenter({ x: 100, y: 50 }, { x: 100, y: 80 });
check("中心半径 cx", c1.cx, 100);
check("中心半径 r", c1.r, 30);

const c2 = circleFromDiameter({ x: 0, y: 0 }, { x: 100, y: 0 });
check("直径圆心", c2.cx, 50);
check("直径半径", c2.r, 50);

const c3 = circleFromDrag({ x: 0, y: 0 }, { x: 30, y: 40 }, true, false);
check("从中心拖动 r", c3.r, 50);
const c4 = circleFromDrag({ x: 0, y: 0 }, { x: 100, y: 0 }, false, false);
check("直径拖动 r", c4.r, 50);

const c5 = circleFromDrag({ x: 0, y: 0 }, { x: 30, y: 40 }, true, true);
check("Shift 圆心半径保持", c5.r, 50);
check("Shift 圆心 45° x", near(c5.r * Math.cos(Math.PI / 4), 35.35533905932737), true);

const c6 = circleThroughThree({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 50 });
check("三点外接圆心", c6 ? c6.cx : null, 50);
check("三点外接半径", c6 ? c6.r : null, 50);
check("三点共线为空", circleThroughThree({ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 100 }), null);

const p = circlePath("n1", "圆形", 10, 20, 30);
check("圆路径名字", p.name, "圆形");
check("圆路径闭合", p.subpaths[0].closed, true);
check("圆路径锚点数", p.subpaths[0].anchors.length, 4);
check("圆路径最右锚点", p.subpaths[0].anchors[1].x, 40);

if (failed) {
  console.error(`\n${failed} 项失败`);
  process.exit(1);
}
console.log("\n全部通过");
