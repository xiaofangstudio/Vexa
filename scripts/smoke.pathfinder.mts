import { areaOf, pathfinderPieces, sortPathNodesByZ } from "../src/core/bool";
import { createDoc, rectPath } from "../src/core/docOps";
import { solid, type PathNode } from "../src/core/types";

let failed = 0;
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(actual)}`);
  if (!ok) failed++;
};

const doc = createDoc("pathfinder", 800, 600);
const a = rectPath("a", "A", 100, 100, 200, 200);
const b = rectPath("b", "B", 200, 150, 200, 200);
a.fill = solid("#e5484d");
a.stroke = { ...a.stroke, kind: "solid", color: "#17171c", opacity: 1, width: 2 };
b.fill = solid("#0f76d6");
doc.nodes.a = a;
doc.nodes.b = b;
doc.root.push("a", "b");

check("z order", sortPathNodesByZ(doc, [b, a]).map((n) => n.id), ["a", "b"]);

const divide = pathfinderPieces([a, b], "divide");
check("divide pieces", divide.length, 3);
check("divide total area", Math.round(divide.reduce((s, p) => s + areaOf(p.subpaths), 0)), 65000);
check("divide fills cover both", [...new Set(divide.map((p) => p.fill.color))], ["#e5484d", "#0f76d6"]);
check("divide clears stroke", divide.every((p) => p.stroke.kind === "none"), true);

const trim = pathfinderPieces([a, b], "trim");
check("trim pieces", trim.length, 2);
check("trim total area preserved", Math.round(trim.reduce((s, p) => s + areaOf(p.subpaths), 0)), 65000);
check("trim keeps fills", trim.map((p) => p.fill.color).sort(), ["#0f76d6", "#e5484d"]);

const b2 = JSON.parse(JSON.stringify(b)) as PathNode;
b2.id = "b2";
b2.fill = solid("#e5484d");
b2.stroke = { ...b2.stroke, kind: "solid", color: "#17171c", opacity: 1, width: 2 };
doc.nodes.b2 = b2;
const same = pathfinderPieces([a, b2], "merge");
check("merge same fill pieces", same.length, 1);
check("merge same fill area", Math.round(areaOf(same[0].subpaths)), 65000);

const diff = pathfinderPieces([a, b], "merge");
check("merge different fill pieces", diff.length, 2);
check("merge keeps strokes", [same[0].stroke.kind, same[0].stroke.width], ["solid", 2]);

const crop = pathfinderPieces([a, b], "crop");
check("crop pieces", crop.length, 1);
check("crop area", Math.round(areaOf(crop[0].subpaths)), 15000);
check("crop keeps lower fill", crop[0].fill.color, "#e5484d");

const outline = pathfinderPieces([a], "outline");
check("outline pieces", outline.length, 1);
check("outline no fill", outline[0].fill.kind, "none");
check("outline stroke", [outline[0].stroke.kind, outline[0].stroke.width], ["solid", 1]);

const far = rectPath("far", "Far", 500, 400, 100, 100);
const disjointDivide = pathfinderPieces([a, far], "divide");
check("disjoint divide pieces", disjointDivide.length, 2);
check("disjoint divide area", Math.round(disjointDivide.reduce((s, p) => s + areaOf(p.subpaths), 0)), 50000);

const noOverlapCrop = pathfinderPieces([a, far], "crop");
check("crop no overlap", noOverlapCrop.length, 0);
check("outline empty", pathfinderPieces([], "outline").length, 0);

if (failed) {
  console.error(`\n${failed} FAILED`);
  process.exit(1);
}
console.log("\n所有路径查找器扩展用例通过");
