import { createDoc } from "../src/core/docOps";
import { exportPDF } from "../src/core/pdf";
import { docToSVG } from "../src/core/svg";
import { solid, type PathNode, type VexaDoc } from "../src/core/types";
import { parseVex, serializeVex } from "../src/core/vex";
import {
  applyBrushStroke,
  brushById,
  brushStamps,
  brushUsable,
  brushesOf,
  calligraphyStamps,
  cleanBrushLinks,
  createBrush,
  deleteBrush,
  normalizeBrushes,
  pruneBrushesForPattern,
  setBrushStyle,
} from "../src/core/brushes";
import { normalizePatterns } from "../src/core/patterns";

let failed = 0;
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(actual)}`);
  if (!ok) failed++;
};
const ok = (name: string, actual: boolean) => check(name, actual, true);
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

const line = (id: string, x1: number, y1: number, x2: number, y2: number, closed = false): PathNode => ({
  kind: "path",
  id,
  name: "线",
  subpaths: [{ anchors: [
    { x: x1, y: y1, hIn: null, hOut: null, smooth: false },
    { x: x2, y: y2, hIn: null, hOut: null, smooth: false },
  ], closed }],
  fill: { kind: "none", color: "#ffffff", opacity: 1 },
  stroke: { kind: "solid", color: "#e5484d", opacity: 1, width: 12, dash: [], cap: "butt", join: "miter" },
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

// 1. 清洗四种类型
const clean = createDoc("画笔类型清洗", 800, 600);
clean.patterns = [
  { id: "pat1", name: "砖", w: 40, h: 20, tile: "grid", nodes: { a: rect("a", 0, 0, 40, 20) }, root: ["a"] },
];
normalizePatterns(clean);
clean.brushes = [
  { id: "br1", name: "图案", kind: "pattern", patternId: "pat1", scale: 1, spacing: 100 },
  { id: "br2", name: "艺术", kind: "art", patternId: "pat1", scale: 2, spacing: 999 },
  { id: "br3", name: "散点", kind: "scatter", patternId: "pat1", scale: 1, spacing: 50, jitter: 130, spread: -5 },
  { id: "br4", name: "书法", kind: "calligraphic", patternId: "missing", scale: 3, spacing: 999, angle: 200, roundness: -1 },
  { id: "br5", name: "坏", kind: "nope", patternId: "missing", scale: 1, spacing: 100 },
  { id: "br6", name: "缺砖", kind: "art", patternId: "missing", scale: 1, spacing: 100 },
] as never;
normalizeBrushes(clean);
const kinds = brushesOf(clean).map((b) => b.kind);
check("four kinds kept", kinds, ["pattern", "art", "scatter", "calligraphic"]);
check("art spacing clamp", brushesOf(clean)[1].spacing, 400);
check("scatter jitter clamp", brushesOf(clean)[2].jitter, 100);
check("scatter spread clamp", brushesOf(clean)[2].spread, 0);
check("callig angle clamp", brushesOf(clean)[3].angle, 180);
check("callig round clamp", brushesOf(clean)[3].roundness, 0);
check("callig no pattern", brushesOf(clean)[3].patternId, undefined);
check("bad kind / missing pattern dropped", brushesOf(clean).length, 4);

// 2. 创建四种画笔
const doc = createDoc("画笔类型", 900, 600);
doc.patterns = [
  { id: "pat1", name: "红砖", w: 40, h: 20, tile: "grid", nodes: { a: rect("a", 0, 0, 40, 20, "#e5484d") }, root: ["a"] },
];
const target = line("target", 200, 100, 400, 100);
doc.nodes.target = target;
doc.root = ["target"];
const p = createBrush(doc, "pattern", "pat1");
const a = createBrush(doc, "art", "pat1");
const s = createBrush(doc, "scatter", "pat1");
const c = createBrush(doc, "calligraphic");
check("create pattern", p.ok, true);
check("create art", a.ok, true);
check("create scatter", s.ok, true);
check("create callig without pattern", c.ok, true);
check("ids", brushesOf(doc).map((b) => b.id), ["br1", "br2", "br3", "br4"]);
check("callig fallback name", c.brush?.name, "书法画笔 4");
check("callig usable", brushUsable(doc, c.brush), true);

// 3. 艺术画笔：整块砖沿路径切条
const arts = brushStamps(doc, target, a.brush!);
check("art slice count", arts.length, 14);
ok("art sx stretches path", near(arts[0].sx, 5));
ok("art sy uses scale", near(arts[0].sy, 1));
check("art first slice", [arts[0].slice?.x, arts[0].slice?.w], [0, 40 / 14]);
ok("art last slice inside", (arts[arts.length - 1].slice?.x ?? 99) < 40);
ok("art angles along x", near(arts[0].angle, 0));
const artVertical = line("v", 300, 100, 300, 300);
doc.nodes.v = artVertical;
const varts = brushStamps(doc, artVertical, a.brush!);
ok("art vertical angle", near(varts[0].angle, Math.PI / 2));
ok("art sx from 200 length", near(varts[0].sx, 5));

// 4. 散点画笔：确定性随机、参数影响
const sc1 = brushStamps(doc, target, s.brush!);
const sc2 = brushStamps(doc, target, s.brush!);
check("scatter count", sc1.length, 6);
ok("scatter deterministic", sc1.every((x, i) => near(x.x, sc2[i].x) && near(x.y, sc2[i].y) && near(x.sx, sc2[i].sx)));
ok("scatter leaves tangent", Math.abs(sc1[1].y - 100) > 1e-4);
setBrushStyle(doc, "br3", { jitter: 100, spread: 200 });
const sc3 = brushStamps(doc, target, s.brush!);
ok("scatter params affect output", !near(sc3[1].x, sc1[1].x) || !near(sc3[1].sx, sc1[1].sx));

// 5. 书法画笔：固定角度椭圆笔锋
check("callig rx", calligraphyStamps(target, c.brush!)[0].rx, 6);
check("callig ry", calligraphyStamps(target, c.brush!)[0].ry, 2.256);
ok("callig angle fixed", near(calligraphyStamps(target, c.brush!)[0].angle, (120 * Math.PI) / 180));
ok("callig many stamps", calligraphyStamps(target, c.brush!).length > 35);
setBrushStyle(doc, "br4", { angle: 30, roundness: 100, scale: 2 });
check("callig style scale", brushById(doc, "br4")?.scale, 2);
check("callig style angle", brushById(doc, "br4")?.angle, 30);
check("callig round 100", calligraphyStamps(target, c.brush!)[0].ry, calligraphyStamps(target, c.brush!)[0].rx);

// 6. 套用与导出
check("apply callig", applyBrushStroke(doc, ["target"], "br4"), 1);
check("callig brush id", target.stroke.brushId, "br4");
const svg = docToSVG(doc, { pretty: false });
 ok("svg callig ellipses", (svg.match(/<ellipse/g) ?? []).length > 35);
ok("svg callig no plain stroke", svg.includes('stroke="none"'));
applyBrushStroke(doc, ["target"], "br2");
const svgArt = docToSVG(doc, { pretty: false });
ok("svg art slice clip", svgArt.includes("<clipPath") && svgArt.includes("scale(5 1)"));
applyBrushStroke(doc, ["target"], "br3");
const svgScatter = docToSVG(doc, { pretty: false });
ok("svg scatter output", svgScatter.includes("rotate(") && svgScatter.includes('fill="#e5484d"'));
check("warnings none", (await exportPDF(doc, { images: false })).warnings, []);

// 7. .vex 往返与图案删除联动
const round = parseVex(serializeVex(doc));
check("vex four kinds", round.brushes?.map((b) => b.kind), ["pattern", "art", "scatter", "calligraphic"]);
check("vex callig no pattern", round.brushes?.[3].patternId, undefined);
check("vex scatter style", [round.brushes?.[2].jitter, round.brushes?.[2].spread], [100, 200]);
check("pattern delete prunes pattern kinds", pruneBrushesForPattern(round, "pat1"), 3);
check("callig survives pattern delete", round.brushes?.map((b) => b.kind), ["calligraphic"]);

const dangling = parseVex(serializeVex({ ...doc, brushes: [] } as VexaDoc));
cleanBrushLinks(dangling);
check("dangling all cleaned", dangling.nodes.target.kind === "path" ? dangling.nodes.target.stroke.brushId : "x", undefined);

const delDoc = createDoc("删画笔", 500, 400);
delDoc.patterns = [
  { id: "delpat", name: "砖", w: 20, h: 20, tile: "grid", nodes: { d: rect("d", 0, 0, 20, 20) }, root: ["d"] },
];
delDoc.nodes.a = line("a", 10, 10, 100, 10);
delDoc.nodes.b = line("b", 10, 80, 100, 80);
delDoc.root = ["a", "b"];
const delA = createBrush(delDoc, "pattern", "delpat").brush!;
const delB = createBrush(delDoc, "calligraphic").brush!;
applyBrushStroke(delDoc, ["a"], delA.id);
applyBrushStroke(delDoc, ["b"], delB.id);
check("delete one brush only clears its link", deleteBrush(delDoc, delA.id), 1);
check("other brush link kept", delDoc.nodes.b.kind === "path" ? delDoc.nodes.b.stroke.brushId : "x", delB.id);

if (failed) {
  console.error(`画笔类型 smoke 失败 ${failed} 项`);
  process.exit(1);
}
console.log("画笔类型 smoke 全部通过");
