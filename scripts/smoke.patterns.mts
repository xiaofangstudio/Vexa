import { createDoc } from "../src/core/docOps";
import { exportPDF } from "../src/core/pdf";
import { docToSVG } from "../src/core/svg";
import { solid, type GroupNode, type PathNode, type VexaDoc } from "../src/core/types";
import { parseVex, serializeVex } from "../src/core/vex";
import {
  MAX_PATTERNS,
  addPattern,
  applyPatternFill,
  canPatternFill,
  deletePattern,
  normalizePatterns,
  patternById,
  patternUsage,
  patternsOf,
  redefinePattern,
  renamePattern,
  setPatternTile,
} from "../src/core/patterns";

let failed = 0;
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(actual)}`);
  if (!ok) failed++;
};

const rect = (id: string, x: number, y: number, w = 100, h = 60, color = "#0f76d6"): PathNode => ({
  kind: "path",
  id,
  name: "矩形",
  subpaths: [{ anchors: [
    { x, y, hIn: null, hOut: null, smooth: false },
    { x: x + w, y, hIn: null, hOut: null, smooth: false },
    { x: x + w, y: y + h, hIn: null, hOut: null, smooth: false },
    { x, y: y + h, hIn: null, hOut: null, smooth: false },
  ], closed: true }],
  fill: solid(color),
  stroke: { kind: "solid", color: "#17171c", opacity: 1, width: 2, dash: [], cap: "butt", join: "miter" },
  opacity: 1, visible: true, locked: false,
});

// 清洗：坏输入、上限、悬空根、图案内嵌图案、空定义
const cleanDoc = createDoc("清洗", 800, 600);
cleanDoc.patterns = "bad" as never;
normalizePatterns(cleanDoc);
check("non-array patterns empty", patternsOf(cleanDoc), []);
cleanDoc.patterns = Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, name: `图案${i}`, w: 10, h: 10, tile: "grid", nodes: { p: rect("p", 0, 0, 10, 10) }, root: ["p"] }));
normalizePatterns(cleanDoc);
check("pattern cap", patternsOf(cleanDoc).length, MAX_PATTERNS);
const nested = createDoc("嵌套", 800, 600);
nested.patterns = [{
  id: "inner", name: "内嵌", w: 40, h: 40, tile: "grid",
  nodes: { p: { ...rect("p", 0, 0, 40, 40), fill: { kind: "pattern", color: "#0f76d6", opacity: 1, patternId: "inner" } } },
  root: ["p"],
}];
normalizePatterns(nested);
check("nested pattern fill stripped", nested.patterns?.[0].nodes.p.kind === "path" ? nested.patterns[0].nodes.p.fill.kind : "", "solid");
const badRoot = createDoc("根", 800, 600);
badRoot.patterns = [{ id: "r", name: "根", w: 10, h: 10, tile: "grid", nodes: { a: rect("a", 0, 0, 10, 10) }, root: ["missing"] }];
normalizePatterns(badRoot);
check("missing root derived", badRoot.patterns?.[0].root, ["a"]);

// 从选中捕获，坐标归零
const doc = createDoc("图案测试", 900, 600);
const p1 = rect("p1", 40, 30, 80, 50, "#0f76d6");
const p2 = rect("p2", 100, 50, 60, 30, "#e5484d");
const g1: GroupNode = { kind: "group", id: "g1", name: "砖", children: ["p1", "p2"], expanded: true, opacity: 1, visible: true, locked: false };
doc.nodes = { p1, p2, g1 };
doc.root = ["g1"];
check("add pattern needs selection", addPattern(doc, []), { ok: false, error: "请选中可转为图案的路径、文字或组" });
const made = addPattern(doc, ["g1"], "斜纹砖");
check("add pattern ok", made.ok, true);
check("pattern id", made.pattern?.id, "pat1");
check("pattern name", made.pattern?.name, "斜纹砖");
check("pattern size", [made.pattern?.w, made.pattern?.h], [120, 50]);
check("pattern nodes", Object.keys(made.pattern?.nodes ?? {}).length, 3);
const defPath = Object.values(made.pattern!.nodes).find((n) => n.kind === "path") as PathNode;
check("def normalized to 0,0", [defPath.subpaths[0].anchors[0].x, defPath.subpaths[0].anchors[0].y], [0, 0]);
check("usage zero", patternUsage(doc, "pat1"), 0);

// 套用：组递归、缩放
const target = rect("target", 200, 100, 220, 140, "#ffffff");
doc.nodes.target = target;
doc.root.push("target");
check("can fill", canPatternFill(doc, ["g1", "target"]), true);
check("apply count", applyPatternFill(doc, ["g1", "target"], "pat1", 1.5), 3);
check("target pattern fill", target.fill, { kind: "pattern", color: "#ffffff", opacity: 1, patternId: "pat1", patternScale: 1.5 });
check("usage after apply", patternUsage(doc, "pat1"), 3);
applyPatternFill(doc, ["target"], "pat1", 99);
check("scale clamped", target.fill.patternScale, 20);

// 砖排与重定义
check("set brick", setPatternTile(doc, "pat1", "brick"), true);
check("tile", patternById(doc, "pat1")?.tile, "brick");
check("rev bump", patternById(doc, "pat1")?.rev, 2);
const beforeRev = patternById(doc, "pat1")?.rev;
check("redefine", redefinePattern(doc, "pat1", ["g1"]), true);
check("redefine rev", (patternById(doc, "pat1")?.rev ?? 0) > (beforeRev ?? 0), true);
check("usage survived redefine", patternUsage(doc, "pat1"), 3);

// SVG：pattern + use + 缩放尺寸
const svg = docToSVG(doc, { pretty: false });
check("svg has pattern", svg.includes("<pattern"), true);
check("svg pattern url", svg.includes('fill="url(#pt'), true);
check("svg brick width", svg.includes('width="360"'), true); // 120 * 2 * 1.5
check("svg not self closing pattern", svg.includes("<pattern") && svg.includes("</pattern>"), true);

// PDF：真实 PatternType 1 资源
const pdf = await exportPDF(doc, { images: false });
check("pdf bytes", pdf.bytes.length > 1000, true);
const pdfText = new TextDecoder().decode(pdf.bytes);
check("pdf tiling pattern", pdfText.includes("/PatternType 1"), true);
check("pdf pattern resource", pdfText.includes("/Pattern <<"), true);
check("pdf pattern matrix", pdfText.includes("/Matrix ["), true);

// .vex 往返与悬空清理
const round = parseVex(serializeVex(doc));
check("vex patterns", patternsOf(round).length, 1);
check("vex fill", round.nodes.target.kind === "path" ? round.nodes.target.fill.kind : "", "pattern");
const dangling = parseVex(serializeVex({ ...doc, patterns: [] } as VexaDoc));
check("dangling pattern fill solid", dangling.nodes.target.kind === "path" ? dangling.nodes.target.fill.kind : "", "solid");
check("dangling pattern fills cleaned", (() => {
  let count = 0;
  for (const node of Object.values(dangling.nodes)) if ((node.kind === "path" || node.kind === "text") && node.fill.kind === "pattern") count++;
  return count;
})(), 0);

// 重命名与删除
check("rename", renamePattern(doc, "pat1", "新砖"), true);
check("renamed", patternById(doc, "pat1")?.name, "新砖");
const removed = deletePattern(doc, "pat1");
check("delete replaced", removed, 3);
check("patterns removed", patternsOf(doc).length, 0);
check("fills solid after delete", target.fill.kind, "solid");

// 文档级样式里的图案引用也要清掉
const styleDoc = createDoc("样式", 800, 600);
styleDoc.patterns = [{ id: "pat2", name: "样式砖", w: 20, h: 20, tile: "grid", nodes: { a: rect("a", 0, 0, 20, 20) }, root: ["a"] }];
styleDoc.styles = [{ id: "st1", name: "图案样式", fill: { kind: "pattern", color: "#0f76d6", opacity: 1, patternId: "pat2" }, opacity: 1 }];
deletePattern(styleDoc, "pat2");
check("style fill solid", styleDoc.styles?.[0].fill.kind, "solid");

if (failed) {
  console.error(`${failed} 项失败`);
  process.exit(1);
}
console.log("图案填充 smoke 全部通过");
