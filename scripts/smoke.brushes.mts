import { createDoc } from "../src/core/docOps";
import { exportPDF } from "../src/core/pdf";
import { docToSVG } from "../src/core/svg";
import { solid, type PathNode, type VexaDoc } from "../src/core/types";
import { parseVex, serializeVex } from "../src/core/vex";
import {
  MAX_BRUSHES,
  applyBrushStroke,
  brushById,
  brushPattern,
  brushStamps,
  brushUsageCount,
  brushesOf,
  cleanBrushLinks,
  createPatternBrush,
  deleteBrush,
  normalizeBrushes,
  redefineBrushPattern,
  removeBrushStroke,
  setBrushParams,
} from "../src/core/brushes";
import { deletePattern, normalizePatterns } from "../src/core/patterns";

let failed = 0;
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(actual)}`);
  if (!ok) failed++;
};

const path = (id: string, x1: number, y1: number, x2: number, y2: number, closed = false): PathNode => ({
  kind: "path",
  id,
  name: "线",
  subpaths: [{ anchors: [
    { x: x1, y: y1, hIn: null, hOut: null, smooth: false },
    { x: x2, y: y2, hIn: null, hOut: null, smooth: false },
  ], closed }],
  fill: { kind: "none", color: "#ffffff", opacity: 1 },
  stroke: { kind: "solid", color: "#17171c", opacity: 1, width: 2, dash: [], cap: "butt", join: "miter" },
  opacity: 1, visible: true, locked: false,
});

const rect = (id: string, x: number, y: number, w: number, h: number, color = "#0f76d6"): PathNode => ({
  kind: "path",
  id,
  name: "砖",
  subpaths: [{ anchors: [
    { x, y, hIn: null, hOut: null, smooth: false },
    { x: x + w, y, hIn: null, hOut: null, smooth: false },
    { x: x + w, y: y + h, hIn: null, hOut: null, smooth: false },
    { x, y: y + h, hIn: null, hOut: null, smooth: false },
  ], closed: true }],
  fill: solid(color),
  stroke: { kind: "none", color: "#17171c", opacity: 1, width: 1, dash: [], cap: "butt", join: "miter" },
  opacity: 1, visible: true, locked: false,
});

// 清洗
const cleanDoc = createDoc("画笔清洗", 800, 600);
cleanDoc.brushes = "bad" as never;
normalizeBrushes(cleanDoc);
check("non-array brushes empty", brushesOf(cleanDoc), []);
cleanDoc.patterns = [{ id: "pat1", name: "砖", w: 40, h: 20, tile: "grid", nodes: { a: rect("a", 0, 0, 40, 20) }, root: ["a"] }];
normalizePatterns(cleanDoc);
cleanDoc.brushes = Array.from({ length: 80 }, (_, i) => ({ id: `br${i}`, name: `画笔${i}`, kind: "pattern", patternId: "pat1", scale: 1, spacing: 100 }));
normalizeBrushes(cleanDoc);
check("brush cap", brushesOf(cleanDoc).length, MAX_BRUSHES);
check("brush fields normalized", [brushesOf(cleanDoc)[0].scale, brushesOf(cleanDoc)[0].spacing], [1, 100]);

// 从图案建画笔
const doc = createDoc("画笔测试", 900, 600);
doc.patterns = [
  { id: "pat1", name: "红砖", w: 40, h: 20, tile: "grid", nodes: { a: rect("a", 0, 0, 40, 20, "#e5484d") }, root: ["a"] },
  { id: "pat2", name: "蓝砖", w: 30, h: 30, tile: "grid", nodes: { b: rect("b", 0, 0, 30, 30, "#0f76d6") }, root: ["b"] },
];
const made = createPatternBrush(doc, "pat1", "红砖画笔");
check("create brush ok", made.ok, true);
check("brush id", made.brush?.id, "br1");
check("brush name", made.brush?.name, "红砖画笔");
check("brush pattern", made.brush?.patternId, "pat1");
check("create missing pattern", createPatternBrush(doc, "nope"), { ok: false, error: "先选中一个可用的图案" });

// 沿路径盖章数量
const target = path("target", 200, 100, 400, 100);
doc.nodes.target = target;
doc.root = ["target"];
check("apply brush", applyBrushStroke(doc, ["target"], "br1"), 1);
check("stroke brush id", target.stroke.brushId, "br1");
check("stamps at 100%", brushStamps(doc, target, brushById(doc, "br1")!).length, 6);
setBrushParams(doc, "br1", 0.5, 50);
check("params scale", brushById(doc, "br1")?.scale, 0.5);
check("params spacing", brushById(doc, "br1")?.spacing, 50);
check("stamps at 50% spacing", brushStamps(doc, target, brushById(doc, "br1")!).length, 21);
check("usage", brushUsageCount(doc, "br1"), 1);

// 组递归
const group = { kind: "group" as const, id: "grp", name: "组", children: ["target"], expanded: true, opacity: 1, visible: true, locked: false };
doc.nodes.grp = group;
doc.root = ["grp"];
check("group apply count", applyBrushStroke(doc, ["grp"], "br1"), 1);
check("remove brush", removeBrushStroke(doc, ["grp"]), 1);
applyBrushStroke(doc, ["grp"], "br1");

// SVG
const svg = docToSVG(doc, { pretty: false });
check("svg brush transform", svg.includes("rotate(0)"), true);
check("svg no normal stroke", svg.includes('stroke="none"'), true);
check("svg brush has fill", svg.includes('fill="#e5484d"'), true);

// PDF
const pdf = await exportPDF(doc, { images: false });
check("pdf bytes", pdf.bytes.length > 400, true);

// .vex 往返
const round = parseVex(serializeVex(doc));
check("vex brushes", brushesOf(round).length, 1);
check("vex brush stroke", round.nodes.target.kind === "path" ? round.nodes.target.stroke.brushId : "", "br1");
const dangling = parseVex(serializeVex({ ...doc, brushes: [] } as VexaDoc));
cleanBrushLinks(dangling);
check("dangling brush cleaned", dangling.nodes.target.kind === "path" ? dangling.nodes.target.stroke.brushId : "", undefined);

// 更换图案
check("redefine pattern", redefineBrushPattern(doc, "br1", "pat2"), true);
check("redefined id", brushById(doc, "br1")?.patternId, "pat2");
check("pattern helper", brushPattern(doc, brushById(doc, "br1"))?.name, "蓝砖");

// 删除画笔与图案
check("delete brush usage", deleteBrush(doc, "br1"), 1);
check("brush id cleared", target.stroke.brushId, undefined);
check("brushes emptied", brushesOf(doc).length, 0);
const make2 = createPatternBrush(doc, "pat2", "蓝砖画笔");
applyBrushStroke(doc, ["target"], make2.brush!.id);
const removedPattern = deletePattern(doc, "pat2");
check("pattern delete", removedPattern, 0);
check("brush pruned with pattern", brushesOf(doc).length, 0);

if (failed) {
  console.error(`${failed} 项失败`);
  process.exit(1);
}
console.log("图案画笔 smoke 全部通过");
