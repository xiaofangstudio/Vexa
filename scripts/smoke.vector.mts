import { booleanSubpaths } from "../src/core/bool";
import { createDoc, rectPath } from "../src/core/docOps";
import { polygonPath, roundRectPath, starPath } from "../src/core/shapes";
import { alignNodes, arrangeNodes, distributeNodes, flipNodes, groupNodes, rotateNodes, rotateNodesAround, scaleNodes, makeSmoothLimits, smoothPathNear, splitPathAtAnchor, splitPathAtPoint, ungroupNodes, selectionBox, containerOf, freehandAnchors, simplifyPoints } from "../src/core/vectorOps";
import { groupBox } from "../src/engine/pick";
import { parseVex, serializeVex } from "../src/core/vex";
import { textBox, boxOfPoints } from "../src/core/geom";
import { docToSVG } from "../src/core/svg";
import { solid, noPaint, anchorAt, type TextNode, type PathNode } from "../src/core/types";
import { toLinearGradient } from "../src/core/paint";
import { erasePathNode } from "../src/core/eraser";
import { nearestOnNode, normalizeWidthPoints, removeWidthPoint, setWidthPoint, widthAt, widthOutline } from "../src/core/width";

const d = createDoc("t", 800, 600);
const a = rectPath("n1", "A", 100, 100, 200, 200);
const b = rectPath("n2", "B", 200, 150, 200, 200);
d.nodes.n1 = a;
d.nodes.n2 = b;
d.root.push("n1", "n2");

const uni = booleanSubpaths([a, b], "union");
const inter = booleanSubpaths([a, b], "intersect");
const sub = booleanSubpaths([a, b], "subtract");
const xor = booleanSubpaths([a, b], "exclude");
console.log("bool union/intersect/subtract/exclude subpaths:", uni.length, inter.length, sub.length, xor.length);
console.log("union anchor count:", uni[0]?.anchors.length, "closed:", uni[0]?.closed);
console.log("subtract has hole (>=2 subpaths or reversed):", sub.length, sub.map((s) => s.anchors.length));

// shapes
const rr = roundRectPath("r1", "R", 0, 0, 100, 60, 10);
console.log("roundrect anchors:", rr.subpaths[0].anchors.length, "closed:", rr.subpaths[0].closed);
const poly = polygonPath("p1", "P", 0, 0, 50, 6);
console.log("polygon(6) anchors:", poly.subpaths[0].anchors.length);
const st = starPath("s1", "S", 0, 0, 50, 5, 0.5);
console.log("star(5) anchors:", st.subpaths[0].anchors.length);

// align / distribute
const d2 = createDoc("t2", 800, 600);
const r1 = rectPath("a1", "1", 10, 10, 40, 40);
const r2 = rectPath("a2", "2", 100, 200, 60, 20);
const r3 = rectPath("a3", "3", 300, 400, 80, 30);
for (const [k, v] of Object.entries({ a1: r1, a2: r2, a3: r3 })) d2.nodes[k] = v;
d2.root.push("a1", "a3", "a2");
alignNodes(d2, ["a1", "a2", "a3"], "left");
console.log("align left x:", r1.subpaths[0].anchors[0].x, r2.subpaths[0].anchors[0].x, r3.subpaths[0].anchors[0].x);
alignNodes(d2, ["a1", "a2", "a3"], "vcenter");
const box = selectionBox(d2, ["a1", "a2", "a3"]);
console.log("selbox:", box && [box.x, box.y, box.w, box.h].map((n) => Math.round(n * 100) / 100));
distributeNodes(d2, ["a1", "a2", "a3"], "h");
console.log("distributed xs:", [r1, r2, r3].map((r) => Math.round(r.subpaths[0].anchors[0].x)));

// arrange
arrangeNodes(d2, ["a1"], "front");
console.log("front order:", d2.root.join(","));
arrangeNodes(d2, ["a1"], "back");
console.log("back order:", d2.root.join(","));
arrangeNodes(d2, ["a3"], "forward");
console.log("forward order:", d2.root.join(","));

// rotate / flip
const d3 = createDoc("t3", 800, 600);
const q = rectPath("q1", "Q", 100, 100, 100, 40);
d3.nodes.q1 = q;
d3.root.push("q1");
rotateNodes(d3, ["q1"], 90);
const b2 = selectionBox(d3, ["q1"]);
console.log("rotate90 box w/h:", b2 && Math.round(b2.w), b2 && Math.round(b2.h));
flipNodes(d3, ["q1"], "h");
console.log("flip ok, box:", selectionBox(d3, ["q1"]) && true);

// group / ungroup
const d4 = createDoc("t4", 800, 600);
const g1 = rectPath("g1", "1", 0, 0, 50, 50);
const g2 = rectPath("g2", "2", 100, 100, 50, 50);
d4.nodes.g1 = g1;
d4.nodes.g2 = g2;
d4.root.push("g1", "g2");
const gid = groupNodes(d4, ["g1", "g2"]);
console.log("group id:", gid, "root:", d4.root.join(","), "children:", d4.nodes[gid!] && (d4.nodes[gid!] as any).children.join(","));
const gb = groupBox(d4, d4.nodes[gid!]);
console.log("group box:", gb && [gb.x, gb.y, gb.w, gb.h]);
console.log("container of g1:", containerOf(d4, "g1")?.parent);
const freed = ungroupNodes(d4, [gid!]);
console.log("ungroup root:", d4.root.join(","), "freed:", freed.join(","));

// .vex 往返：带编组与布尔结果
const d5 = createDoc("t5", 800, 600);
d5.nodes.u1 = { ...a, id: "u1", subpaths: uni };
d5.root.push("u1");
d5.nodes.gx = { kind: "group", id: "gx", name: "编组", children: [d5.root[0]], opacity: 1, visible: true, locked: false };
d5.root.unshift("gx");
const round = parseVex(serializeVex(d5));
const gNode = round.nodes.gx;
console.log(
  "vex round-trip:",
  "root=" + round.root.length,
  "group=" + (gNode?.kind === "group"),
  "unionSubpaths=" + (round.nodes.u1?.kind === "path" ? round.nodes.u1.subpaths.length : 0),
  "bytes=" + serializeVex(d5).length,
);

// 渐变 + 虚线：画布/ SVG 两端语义一致
import { docToSVG, parseTransform } from "../src/core/svg";
import { linearPaint, noStroke, solid } from "../src/core/types";
import { gradLine } from "../src/core/paint";

const d6 = createDoc("t6", 600, 400);
const gp = rectPath("gp", "渐变矩形", 20, 20, 300, 180);
gp.fill = linearPaint("#0f76d6", "#ffffff", 30);
gp.stroke = { kind: "solid", color: "#17171c", opacity: 1, width: 2, dash: [6, 4] };
d6.nodes.gp = gp;
d6.root.push("gp");
const svg = docToSVG(d6);
const line = gradLine(30, { x: 20, y: 20, w: 300, h: 180 });
console.log(
  "gradient svg:",
  "defs=" + svg.includes("<linearGradient"),
  "url=" + svg.includes('fill="url(#g0)"'),
  "dash=" + svg.includes("stroke-dasharray"),
  "axis=" + [Math.round(line.x1), Math.round(line.y1), Math.round(line.x2), Math.round(line.y2)].join(","),
);

// 旧工程兼容：缺 grad 的 linear 填充要退回实色，不能崩
const legacy = parseVex(JSON.stringify({ format: "vexa", version: 1, doc: { name: "old", artboards: [{ id: "a1", name: "a", x: 0, y: 0, w: 100, h: 100, bg: "#ffffff" }], nodes: { p1: { kind: "path", id: "p1", name: "p", subpaths: [], fill: { kind: "linear", color: "#123456", opacity: 1 }, stroke: noStroke(), opacity: 1 } }, root: ["p1"], seq: 2 } }));
console.log("legacy paint fallback:", legacy.nodes.p1?.kind === "path" ? legacy.nodes.p1.fill.kind : "missing", "solid=" + solid("#123456").kind);

// 第三批：径向渐变 / 箭头 / 缩放 / 绕点旋转
import { radialPaint, anchorAt } from "../src/core/types";
import { pathD } from "../src/core/geom";

const d7 = createDoc("t7", 800, 600);
const rp = rectPath("rp", "径向", 40, 40, 260, 160);
rp.fill = radialPaint("#ffffff", "#0f76d6");
rp.stroke = { kind: "solid", color: "#17171c", opacity: 1, width: 2, dash: [], arrow: "triangle" };
d7.nodes.rp = rp;
const open = {
  kind: "path" as const,
  id: "ar",
  name: "箭头线",
  subpaths: [{ anchors: [anchorAt(50, 300), anchorAt(300, 320)], closed: false }],
  fill: solid("#ffffff"),
  stroke: { kind: "solid" as const, color: "#17171c", opacity: 1, width: 3, dash: [], arrow: "triangle" as const },
  opacity: 1,
  visible: true,
  locked: false,
};
d7.nodes.ar = open;
d7.root.push("ar", "rp");
const svg7 = docToSVG(d7);
console.log(
  "radial+arrow svg:",
  "radial=" + svg7.includes("<radialGradient"),
  "radialUrl=" + svg7.includes('fill="url(#g'),
  "marker=" + svg7.includes("<marker"),
  "markerEnd=" + svg7.includes("marker-end="),
  "arrowClosedSkipped=" + (svg7.match(/marker-end=/g) ?? []).length,
);

const d8 = createDoc("t8", 800, 600);
const sp = rectPath("sp", "缩放", 100, 100, 100, 40);
d8.nodes.sp = sp;
d8.root.push("sp");
scaleNodes(d8, ["sp"], { x: 100, y: 100, w: 100, h: 40 }, 2, 3, { x: 100, y: 100 });
const sb = selectionBox(d8, ["sp"]);
console.log("scale 2x3 box:", sb && [sb.x, sb.y, sb.w, sb.h].map((n) => Math.round(n)));
rotateNodesAround(d8, ["sp"], sb!.x + sb!.w / 2, sb!.y + sb!.h / 2, 45);
const sb2 = selectionBox(d8, ["sp"]);
console.log("rotate45 center kept:", sb2 && Math.round(sb2.x + sb2.w / 2), Math.round(sb2.y + sb2.h / 2), "d=" + pathD(sp as any).length);

const tm = parseTransform("translate(10,20) scale(2)");
console.log("svg transform matrix:", [tm.a, tm.b, tm.c, tm.d, tm.e, tm.f].join(","), "point(1,1)->", 1 * tm.a + 1 * tm.c + tm.e, 1 * tm.b + 1 * tm.d + tm.f);

// 第四批：多画板 / 剪切蒙版 / 混合模式
const d9 = createDoc("t9", 800, 600);
d9.artboards.push({ id: "ab2", name: "画板 2", x: 900, y: 0, w: 800, h: 600, bg: "#ffffff" });
const mask = rectPath("mk", "蒙版", 40, 40, 300, 200);
const art = rectPath("at", "内容", 0, 0, 500, 300);
art.blend = "multiply";
d9.nodes.mk = mask;
d9.nodes.at = art;
d9.root.push("mk", "at");
const gid9 = groupNodes(d9, ["mk", "at"])!;
(d9.nodes[gid9] as any).clip = "mk";
(d9.nodes[gid9] as any).blend = "screen";
d9.nodes.top = rectPath("top", "顶层", 400, 400, 100, 100);
d9.nodes.top.blend = "overlay";
d9.root.push("top");
const svg9 = docToSVG(d9);
console.log(
  "mask+blend svg:",
  "clipPath=" + svg9.includes("<clipPath"),
  "clipUrl=" + svg9.includes("clip-path="),
  "blend=" + (svg9.match(/mix-blend-mode/g) ?? []).length,
  "maskSkipped=" + (svg9.match(/<path d=/g) ?? []).length,
  "viewBoxSpan=" + svg9.includes('viewBox="0 0 1700 600"'),
  "singleBoard=" + docToSVG(d9, { boardId: "ab2" }).includes('viewBox="900 0 800 600"'),
);
const vex9 = serializeVex(d9);
const back9 = parseVex(vex9);
console.log(
  "vex blend/clip round-trip:",
  "clip=" + ((back9.nodes[gid9] as any).clip ?? ""),
  "blend=" + ((back9.nodes[gid9] as any).blend ?? ""),
  "validated=" + (() => {
    const bad = JSON.parse(vex9);
    bad.doc.nodes[gid9].blend = "bogus";
    bad.doc.nodes[gid9].clip = "missing";
    const fixed = parseVex(JSON.stringify(bad));
    return `${(fixed.nodes[gid9] as any).blend ?? "none"}/${(fixed.nodes[gid9] as any).clip ?? "none"}`;
  })(),
);

// 第五批：偏移路径 / 描边转轮廓 / 平滑
import { offsetPathNode, outlineStrokeNode, smoothPathNode } from "../src/core/pathfx";

const src = rectPath("fx", "效果源", 0, 0, 100, 100);
src.stroke = { kind: "solid", color: "#17171c", opacity: 1, width: 10, dash: [], arrow: "none" };
const off = offsetPathNode(src, 10);
const oBox = selectionBox({ nodes: { fx: off }, root: ["fx"] } as any, ["fx"]);
const out = outlineStrokeNode(src);
const outBox = out ? selectionBox({ nodes: { fx: out }, root: ["fx"] } as any, ["fx"]) : null;
const sm = smoothPathNode(src, 0.5);
const smBox = selectionBox({ nodes: { fx: sm }, root: ["fx"] } as any, ["fx"]);
console.log(
  "path fx:",
  "offset=" + (oBox ? [oBox.x, oBox.y, oBox.w, oBox.h].map((n) => Math.round(n)).join(",") : "null"),
  "outlineSubs=" + (out?.subpaths.length ?? 0),
  "outline=" + (outBox ? [outBox.x, outBox.y, outBox.w, outBox.h].map((n) => Math.round(n)).join(",") : "null"),
  "smooth=" + (smBox ? [smBox.x, smBox.y, smBox.w, smBox.h].map((n) => Math.round(n)).join(",") : "null"),
  "outlineStrokeNone=" + (out?.stroke.kind === "none"),
);

// 剪刀：闭合路径切开变开口；开口路径在锚点处拆成两段
const cut = rectPath("cut", "剪刀测试", 0, 0, 100, 100);
const cutDoc = { nodes: { cut }, root: ["cut"] } as any;
const closedOk = splitPathAtAnchor(cutDoc, "cut", 0, 1);
const cut2 = rectPath("cut2", "开口测试", 0, 0, 100, 100);
cut2.subpaths[0].closed = false;
const openDoc = { nodes: { cut2 }, root: ["cut2"] } as any;
const openOk = splitPathAtAnchor(openDoc, "cut2", 0, 1);
console.log(
  "scissors:",
  "closedSplit=" + closedOk,
  "subs=" + cut.subpaths.length,
  "anchors=" + cut.subpaths[0].anchors.length,
  "open=" + cut.subpaths[0].closed,
  "cutAt=" + (cut.subpaths[0].anchors[0].x === cut.subpaths[0].anchors[4].x && cut.subpaths[0].anchors[0].y === cut.subpaths[0].anchors[4].y),
  "openSplit=" + openOk,
  "parts=" + cut2.subpaths.map((s) => s.anchors.length).join("/"),
  "endpoints=" + cut2.subpaths.every((s) => !s.closed),
);

const cut3 = rectPath("cut3", "段中切线", 0, 0, 100, 100);
const segDoc = { nodes: { cut3 }, root: ["cut3"] } as any;
const midOk = splitPathAtPoint(segDoc, "cut3", 0, 0, 0.5);
const startPt = cut3.subpaths[0].anchors[0];
const endPt = cut3.subpaths[0].anchors[cut3.subpaths[0].anchors.length - 1];
console.log(
  "scissors segment:",
  "ok=" + midOk,
  "anchors=" + cut3.subpaths[0].anchors.length,
  "cutX=" + Math.round(startPt.x),
  "coincide=" + (startPt.x === endPt.x && startPt.y === endPt.y),
);

// 平滑工具：笔刷扫过的墙角向相邻中点收拢，无手柄的转角补对称手柄
const smNear = rectPath("smn", "平滑测试", 0, 0, 100, 100);
const smDoc = { nodes: { smn: smNear }, root: ["smn"], artboards: [] } as any;
const smChanged = smoothPathNear(smDoc, [{ x: 100, y: 0 }], 10, 0.3);
const corner = smNear.subpaths[0].anchors[1];
console.log(
  "smooth tool:",
  "changed=" + smChanged,
  "corner=" + Math.round(corner.x) + "," + Math.round(corner.y),
  "handles=" + (!!corner.hIn && !!corner.hOut),
  "untouched=" + smNear.subpaths[0].anchors[2].x,
);

const smCap = rectPath("smc", "预算测试", 0, 0, 100, 100);
const capDoc = { nodes: { smc: smCap }, root: ["smc"], artboards: [] } as any;
const capLimits = makeSmoothLimits(capDoc, 12);
for (let i = 0; i < 12; i++) smoothPathNear(capDoc, [{ x: 100, y: 0 }], 12, 0.34, capLimits);
const capCorner = smCap.subpaths[0].anchors[1];
console.log(
  "smooth budget:",
  "corner=" + Math.round(capCorner.x) + "," + Math.round(capCorner.y),
  "moved=" + Math.round(Math.hypot(capCorner.x - 100, capCorner.y - 0)),
  "cap=" + Math.round(capLimits.get("smc:0:1")?.cap ?? -1),
);

// 字符面板：粗斜体 / 行距 / 字距 / 对齐 / 横纵缩放 贯通 bbox 与 SVG
const txtDoc = createDoc("text", 800, 600);
const txt: TextNode = {
  kind: "text",
  id: "txt1",
  name: "文字测试",
  x: 300,
  y: 200,
  text: "Vexa 字符\n面板",
  size: 40,
  font: "Microsoft YaHei",
  fill: solid("#1f2328"),
  opacity: 1,
  visible: true,
  locked: false,
  bold: true,
  italic: true,
  lineHeight: 1.6,
  tracking: 4,
  align: "center",
  hScale: 120,
  vScale: 90,
  baseline: 6,
};
txtDoc.nodes.txt1 = txt;
txtDoc.root.push("txt1");
const tb = textBox(txt);
const svgText = docToSVG(txtDoc);
console.log(
  "character panel:",
  "box=" + [tb.x, tb.y, tb.w, tb.h].map((n) => Math.round(n)).join(","),
  "weight=" + svgText.includes('font-weight="700"'),
  "italic=" + svgText.includes('font-style="italic"'),
  "tracking=" + svgText.includes('letter-spacing="4"'),
  "anchor=" + svgText.includes('text-anchor="middle"'),
  "scale=" + svgText.includes("scale(1.2 0.9)"),
  "baseline=" + svgText.includes("translate(300 194)"),
  "line=" + svgText.includes('dy="64"'),
);
const txtBack = parseVex(serializeVex(txtDoc));
const txt2 = txtBack.nodes.txt1 as TextNode;
console.log(
  "text roundtrip:",
  "bold=" + txt2.bold,
  "italic=" + txt2.italic,
  "lineHeight=" + txt2.lineHeight,
  "tracking=" + txt2.tracking,
  "align=" + txt2.align,
  "hScale=" + txt2.hScale,
  "vScale=" + txt2.vScale,
  "baseline=" + txt2.baseline,
);

// 自由铅笔：抽稀保留首尾，平滑锚点内部有对称手柄、端点保留单侧手柄
const rawStroke: Array<{ x: number; y: number }> = [];
for (let i = 0; i <= 48; i++) {
  rawStroke.push({ x: i * 3, y: Math.sin(i / 6) * 18 + (i % 2 === 0 ? 0.6 : -0.6) });
}
const simplified = simplifyPoints(rawStroke, 1.2);
const penAnchors = freehandAnchors(rawStroke, 1);
console.log(
  "pencil:",
  "raw=" + rawStroke.length,
  "simplified=" + simplified.length,
  "endpoints=" + (simplified[0].x === rawStroke[0].x && simplified[simplified.length - 1].x === rawStroke[rawStroke.length - 1].x),
  "anchors=" + penAnchors.length,
  "innerHandles=" + penAnchors.slice(1, -1).every((a) => !!a.hIn && !!a.hOut),
  "endHandles=" + (!!penAnchors[0].hOut && !!penAnchors[penAnchors.length - 1].hIn),
);

// 渐变工具：实色转线性（本色→白），已有渐变保留停靠点
const gradFromSolid = toLinearGradient(solid("#e5484d"));
const gradFromRadial = toLinearGradient({
  kind: "radial", color: "#0f76d6", opacity: 1,
  grad: { angle: 0, stops: [{ offset: 0, color: "#00d0f8" }, { offset: 1, color: "#0f2d5a" }] },
});
console.log(
  "gradient tool:",
  "solidKind=" + gradFromSolid.kind,
  "solidStops=" + gradFromSolid.grad?.stops.map((s) => s.color).join(">"),
  "solidAngle=" + gradFromSolid.grad?.angle,
  "radialKind=" + gradFromRadial.kind,
  "radialStops=" + gradFromRadial.grad?.stops.map((s) => s.color).join(">"),
);

// 橡皮：闭合填充挖洞，开口描边断成两段，未碰到保持原样
const filledErase = rectPath("er1", "擦除矩形", 0, 0, 100, 100);
filledErase.fill = solid("#e5484d");
const holeResult = erasePathNode(filledErase, [{ x: 50, y: 50 }], 20);
console.log(
  "eraser fill:",
  "subpaths=" + (holeResult ? holeResult.length : "null"),
  "allClosed=" + (holeResult ? holeResult.every((s) => s.closed) : false),
  "anchors=" + (holeResult ? holeResult.map((s) => s.anchors.length).join("/") : "-"),
);
const lineErase: PathNode = {
  kind: "path", id: "er2", name: "擦线", subpaths: [{ anchors: [anchorAt(0, 0), anchorAt(100, 0)], closed: false }],
  fill: solid("#000000"), stroke: { kind: "solid", color: "#000000", opacity: 1, width: 2, dash: [] },
  opacity: 1, visible: true, locked: false,
};
const lineParts = erasePathNode(lineErase, [{ x: 50, y: 0 }], 10);
console.log(
  "eraser line:",
  "parts=" + (lineParts ? lineParts.length : "null"),
  "open=" + (lineParts ? lineParts.every((s) => !s.closed) : false),
  "ranges=" + (lineParts ? lineParts.map((s) => `${Math.round(s.anchors[0].x)}-${Math.round(s.anchors[s.anchors.length - 1].x)}`).join(",") : "-"),
  "untouched=" + (erasePathNode(lineErase, [{ x: 200, y: 0 }], 10) === null),
);

// 宽度工具：中部加宽轮廓、最近点、宽度点增改、闭合空心环、SVG 与 .vex 往返
const widthLine: PathNode = {
  kind: "path", id: "w1", name: "宽度线", subpaths: [{ anchors: [anchorAt(100, 100), anchorAt(300, 100)], closed: false }],
  fill: noPaint(), stroke: {
    kind: "solid", color: "#17171c", opacity: 1, width: 10, dash: [],
    widthPoints: [{ t: 0, left: 1, right: 1 }, { t: 0.5, left: 2, right: 2 }, { t: 1, left: 1, right: 1 }],
  },
  opacity: 1, visible: true, locked: false,
};
const wOutline = widthOutline(widthLine);
const wBox = wOutline ? boxOfPoints(wOutline.flat()) : null;
const wNearest = nearestOnNode(widthLine, { x: 200, y: 100 });
const wSet = setWidthPoint([{ t: 0, left: 1, right: 1 }, { t: 1, left: 1, right: 1 }], 0.25, "left", 3);
console.log(
  "width line:",
  "loops=" + (wOutline ? wOutline.length : "null"),
  "box=" + (wBox ? `${Math.round(wBox.w)}x${Math.round(wBox.h)}` : "-"),
  "t=" + (wNearest ? wNearest.t.toFixed(2) : "-"),
  "points=" + wSet.length,
  "left25=" + widthAt(wSet, 0.25)[0],
  "smooth125=" + widthAt(wSet, 0.0625)[0].toFixed(3),
);
const wClear = removeWidthPoint([{ t: 0, left: 1, right: 1 }, { t: 0.5, left: 2, right: 2 }, { t: 1, left: 1, right: 1 }], 0.5);
const wKeepTip = removeWidthPoint([{ t: 0, left: 2.5, right: 2.5 }, { t: 1, left: 1, right: 1 }], 0.5);
console.log("width remove:", "clearAll=" + wClear.length, "keepTip=" + wKeepTip.length, "tipLeft=" + wKeepTip[0]?.left);
const wClosed = rectPath("w2", "宽度矩形", 0, 0, 100, 80);
wClosed.stroke = {
  kind: "solid", color: "#0f76d6", opacity: 1, width: 8, dash: [],
  widthPoints: normalizeWidthPoints([{ t: 0, left: 0.4, right: 0.4 }, { t: 0.5, left: 1.8, right: 1.8 }, { t: 1, left: 0.4, right: 0.4 }]),
};
const wClosedOutline = widthOutline(wClosed);
console.log(
  "width closed:",
  "loops=" + (wClosedOutline ? wClosedOutline.length : "null"),
  "anchors=" + (wClosedOutline ? wClosedOutline.map((l) => l.length).join("/") : "-"),
);
const wDoc = createDoc("t12", 400, 300);
wDoc.nodes.w1 = widthLine;
wDoc.root.push("w1");
const wSvg = docToSVG(wDoc);
const wBack = parseVex(serializeVex(wDoc));
const wBackPoints = wBack.nodes.w1?.kind === "path" ? normalizeWidthPoints(wBack.nodes.w1.stroke.widthPoints) : [];
console.log(
  "width svg/vex:",
  "outline=" + (wSvg.match(/<path /g) || []).length,
  "noStrokeWidth=" + !wSvg.includes('stroke-width="10"'),
  "points=" + wBackPoints.length,
  "mid=" + (wBackPoints.find((q) => Math.abs(q.t - 0.5) < 0.001)?.left ?? "-"),
);

