import { createDoc } from "../src/core/docOps";
import { exportPDF } from "../src/core/pdf";
import { docToSVG } from "../src/core/svg";
import { solid, type GroupNode, type PathNode, type SymbolNode } from "../src/core/types";
import { parseVex, serializeVex } from "../src/core/vex";
import {
  MAX_SYMBOLS,
  addSymbol,
  deleteSymbol,
  expandSymbolInstance,
  normalizeSymbols,
  placeSymbol,
  redefineSymbol,
  renameSymbol,
  symbolById,
  symbolUsage,
  symbolsOf,
} from "../src/core/symbols";

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
  stroke: { kind: "solid", color: "#17171c", opacity: 1, width: 4, dash: [], cap: "butt", join: "miter" },
  opacity: 1, visible: true, locked: false,
});

// 清洗：坏输入、空定义、上限、非法 id
check("non-array symbols empty", normalizeSymbols("bad"), []);
check("empty root dropped", normalizeSymbols([{ id: "s", nodes: {}, root: [] }]), []);
check("symbol cap", normalizeSymbols(Array.from({ length: 80 }, (_, i) => {
  const p = rect(`p${i}`, 0, 0);
  return { id: `s${i}`, nodes: { [p.id]: p }, root: [p.id], w: 10, h: 10 };
})).length, MAX_SYMBOLS);
check("bad path dropped", normalizeSymbols([{ id: "s", nodes: { p: { kind: "path", id: "p", name: "坏" } }, root: ["p"] }]).length, 0);
check("nested symbol dropped", normalizeSymbols([{ id: "s", nodes: { s2: { kind: "symbol", id: "s2", name: "嵌套" } }, root: ["s2"] }]).length, 0);
check("duplicate id rewritten", normalizeSymbols([
  { id: "x", nodes: { a: rect("a", 0, 0) }, root: ["a"], w: 100, h: 60 },
  { id: "x", nodes: { b: rect("b", 0, 0) }, root: ["b"], w: 100, h: 60 },
]).map((s) => s.id), ["x", "x_2"]);

const doc = createDoc("符号测试", 900, 600);
const p1 = rect("p1", 40, 30, 160, 90);
const p2 = rect("p2", 60, 50, 120, 50, "#e5484d");
const g1: GroupNode = { kind: "group", id: "g1", name: "徽标组", children: ["p1", "p2"], expanded: true, opacity: 1, visible: true, locked: false };
doc.nodes = { p1, p2, g1 };
doc.root = ["g1"];

// 从选中捕获，坐标归零
check("add symbol needs selection", addSymbol(doc, []), { ok: false, error: "先选中可复制的路径、文字、图片或组" });
const made = addSymbol(doc, ["g1"], "徽标");
check("add symbol ok", made.ok, true);
check("symbol id", made.symbol?.id, "sym1");
check("symbol name", made.symbol?.name, "徽标");
check("def size from union box", [made.symbol?.w, made.symbol?.h], [160, 90]);
check("def root", made.symbol?.root.length, 1);
check("def nodes count", Object.keys(made.symbol?.nodes ?? {}).length, 3);
const defPath = Object.values(made.symbol!.nodes).find((n) => n.kind === "path") as PathNode;
check("def path normalized to 0,0", defPath.subpaths[0].anchors[0].x, 0);
check("symbols on doc", symbolsOf(doc).length, 1);
check("original artwork kept", doc.root, ["g1"]);

// 同时选中组与组内子节点，只捕获顶层组，不重复
const dupDoc = createDoc("组与子节点", 800, 600);
const d1 = rect("d1", 0, 0);
const d2 = rect("d2", 90, 0);
const dg: GroupNode = { kind: "group", id: "dg", name: "组", children: ["d1", "d2"], expanded: true, opacity: 1, visible: true, locked: false };
dupDoc.nodes = { dg, d1, d2 };
dupDoc.root = ["dg"];
const dup = addSymbol(dupDoc, ["dg", "d1"], "去重");
check("group+child capture root once", dup.symbol?.root.length, 1);
check("group+child capture three nodes", Object.keys(dup.symbol?.nodes ?? {}).length, 3);

// 坏定义节点补默认值，不留下会崩绘制的内容
const repaired = normalizeSymbols([{
  id: "s", w: 100, h: 100,
  nodes: {
    tx: { kind: "text", id: "tx", name: "", x: "bad", y: undefined, text: 5, size: 0, font: "" },
    im: { kind: "image", id: "im", name: "图", src: "", x: 0, y: 0, w: 0, h: 0 },
    pa: { kind: "path", id: "pa", name: "路径", subpaths: [] },
  },
  root: ["tx", "pa"],
}])[0];
check("bad image dropped", Object.keys(repaired.nodes).includes("im"), false);
check("text defaults", [repaired.nodes.tx.kind === "text" ? repaired.nodes.tx.text : "", repaired.nodes.tx.kind === "text" ? repaired.nodes.tx.size : 0], ["", 20]);
check("path fill default", repaired.nodes.pa.kind === "path" ? repaired.nodes.pa.fill.kind : "", "solid");
check("empty root is fine", repaired.root, ["tx", "pa"]);

// 置入实例并缩放
const inst1 = placeSymbol(doc, "sym1", 500, 100)!;
check("place creates instance", inst1.kind, "symbol");
check("place default size", [inst1.w, inst1.h], [160, 90]);
check("usage one", symbolUsage(doc, "sym1"), 1);
const inst2 = placeSymbol(doc, "sym1", 500, 260, 240, 135)!;
check("usage two", symbolUsage(doc, "sym1"), 2);

// 重定义：换新内容，两个实例同步但各自尺寸不变
const p3 = rect("p3", 0, 0, 80, 40, "#111111");
doc.nodes.p3 = p3;
doc.root.push("p3");
check("redefine returns usage", redefineSymbol(doc, "sym1", ["p3"]), 2);
check("def new size", [symbolById(doc, "sym1")?.w, symbolById(doc, "sym1")?.h], [80, 40]);
check("def new node", Object.values(symbolById(doc, "sym1")!.nodes)[0].id, "d1");
check("instances sizes unchanged", [(doc.nodes[inst1.id] as SymbolNode).w, (doc.nodes[inst2.id] as SymbolNode).h], [160, 135]);

// SVG 导出：定义 + use，缩放落到 width/height
const svg = docToSVG(doc, { boardId: "a1" });
check("svg has symbol def", svg.includes("<symbol"), true);
check("svg has use", svg.includes("<use"), true);
check("svg use count", (svg.match(/<use /g) ?? []).length, 2);
check("svg instance width", svg.includes('width="240"'), true);

// 展开实例：落成组，内容按实例尺寸缩放
const exp = expandSymbolInstance(doc, inst1.id);
check("expand returns group", !!exp, true);
check("instance removed", doc.nodes[inst1.id], undefined);
check("expanded group children", (doc.nodes[exp!] as GroupNode).children.length, 1);
const inner = Object.values(doc.nodes).find((n) => n.kind === "path" && n.id !== "p1" && n.id !== "p2" && n.id !== "p3") as PathNode;
check("expanded path scaled", [Math.round(inner.subpaths[0].anchors[1].x - inner.subpaths[0].anchors[0].x), Math.round(inner.subpaths[0].anchors[2].y - inner.subpaths[0].anchors[1].y)], [160, 90]);
check("root has group once", doc.root.filter((id) => id === exp).length, 1);
check("usage left one", symbolUsage(doc, "sym1"), 1);

// 嵌套组内展开：不能同时留在根层
const nested = createDoc("嵌套展开", 800, 600);
nested.nodes = { p1: rect("p1", 10, 10) };
nested.root = ["p1"];
addSymbol(nested, ["p1"], "小块");
const parent: GroupNode = { kind: "group", id: "gp", name: "父组", children: [], expanded: true, opacity: 1, visible: true, locked: false };
nested.nodes.gp = parent;
nested.root.push("gp");
const inst = placeSymbol(nested, "sym1", 20, 20)!;
nested.root = nested.root.filter((r) => r !== inst.id);
parent.children.push(inst.id);
check("nested instance in group", parent.children, [inst.id]);
const ng = expandSymbolInstance(nested, inst.id);
check("nested expanded", parent.children[0], ng);
check("nested group not in root", nested.root.includes(ng!), false);
check("root still p1 + gp", nested.root, ["p1", "gp"]);

// 删除符号：所有实例先转为组，定义移除
const delDoc = createDoc("删除符号", 800, 600);
delDoc.nodes = { p1: rect("p1", 0, 0) };
delDoc.root = ["p1"];
addSymbol(delDoc, ["p1"], "待删");
placeSymbol(delDoc, "sym1", 10, 10);
placeSymbol(delDoc, "sym1", 200, 10);
check("delete expands instances", deleteSymbol(delDoc, "sym1"), true);
check("definition removed", symbolsOf(delDoc).length, 0);
check("no symbol instances left", Object.values(delDoc.nodes).some((n) => n.kind === "symbol"), false);
check("two groups added", Object.values(delDoc.nodes).filter((n) => n.kind === "group").length, 2);

// 改名
check("rename", renameSymbol(doc, "sym1", "徽标新版"), true);
check("rename applied", symbolById(doc, "sym1")?.name, "徽标新版");
check("rename empty keeps", renameSymbol(doc, "sym1", "  "), true);

// .vex 往返：定义、实例、悬空实例清理
const round = parseVex(serializeVex(doc));
check("vex keeps symbols", round.symbols?.length, 1);
check("vex keeps instance", Object.values(round.nodes).some((n) => n.kind === "symbol" && n.symbolId === "sym1"), true);
const broken = createDoc("悬空", 800, 600);
broken.nodes = { orphan: { kind: "symbol", id: "orphan", name: "孤儿", symbolId: "missing", x: 0, y: 0, w: 100, h: 100, opacity: 1, visible: true, locked: false } };
broken.root = ["orphan"];
const fixed = parseVex(serializeVex(broken));
check("dangling instance removed", fixed.nodes.orphan, undefined);
check("dangling root removed", fixed.root, []);

if (failed > 0) {
  console.log(`FAILED ${failed}`);
  process.exit(1);
}

const pdfDoc = createDoc("符号 PDF", 400, 300);
pdfDoc.nodes = { pp: rect("pp", 0, 0, 80, 40, "#e5484d") };
pdfDoc.root = ["pp"];
addSymbol(pdfDoc, ["pp"], "PDF 块");
placeSymbol(pdfDoc, "sym1", 120, 90, 160, 80);
const pdf = await exportPDF(pdfDoc, { boardId: "a1", images: false });
check("pdf export ok", pdf.bytes.length > 500, true);
check("pdf header", String.fromCharCode(...pdf.bytes.slice(0, 4)), "%PDF");

console.log("symbols smoke ok");
