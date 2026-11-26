/** renderScene 冒烟：画板外裁剪、视口剔除、静态背景缓存与性能对比。 */
import { createCanvas } from "@napi-rs/canvas";
import { createDoc, rectPath } from "../src/core/docOps";
import { nodeInArtboards, pointInArtboards } from "../src/core/artboards";
import { renderScene, type RenderState } from "../src/engine/render";
import { solid, noStroke, noPaint, type VexaDoc } from "../src/core/types";

const colors: Record<string, string> = {
  "--canvas-bg": "#ececf0",
  "--mat-dot": "rgba(24,24,32,0.12)",
  "--paper": "#ffffff",
  "--accent": "#0f76d6",
  "--grid-line": "rgba(0,0,0,0.1)",
};

(globalThis as any).document = {
  documentElement: { dataset: { theme: "light" } },
  createElement: () => createCanvas(1, 1),
};
(globalThis as any).getComputedStyle = () => ({
  getPropertyValue: (name: string) => colors[name] ?? "",
});

const baseState = (over: Partial<RenderState> = {}): RenderState => ({
  selected: [],
  tool: "select",
  pen: null,
  marquee: null,
  hoverId: null,
  snapGuides: [],
  activeBoardId: "a1",
  ...over,
});

const pass: string[] = [];
const fail: string[] = [];
const check = (name: string, ok: boolean, extra = "") => {
  (ok ? pass : fail).push(name);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " · " + extra : ""}`);
};

const view = { zoom: 0.5, panX: 20, panY: 10 };
const size = { w: 600, h: 400 };

function pixel(cv: any, x: number, y: number): number[] {
  return Array.from(cv.getContext("2d").getImageData(Math.round(x), Math.round(y), 1, 1).data as Uint8ClampedArray);
}
function isRed(p: number[]) {
  return p[0] > 180 && p[1] < 140 && p[2] < 140;
}
function isPasteboard(p: number[]) {
  return Math.abs(p[0] - 236) <= 6 && Math.abs(p[1] - 236) <= 6 && Math.abs(p[2] - 240) <= 6;
}

const doc = createDoc("渲染验收", 900, 600);
const out = rectPath("r1", "越界矩形", 700, 50, 300, 100);
out.fill = solid("#e5484d");
out.stroke = noStroke();
doc.nodes.r1 = out;
doc.root.push("r1");

// 1. 画板外裁剪
const cv1 = createCanvas(size.w, size.h);
renderScene(cv1 as any, doc, view, baseState({ hideOutsideBoards: true }), 1, size);
const clipped = pixel(cv1, 485, 60);
check("画板外矩形被裁掉", isPasteboard(clipped), clipped.join(","));

const cv2 = createCanvas(size.w, size.h);
renderScene(cv2 as any, doc, view, baseState({ hideOutsideBoards: false }), 1, size);
const shown = pixel(cv2, 485, 60);
check("关闭裁剪后矩形可见", isRed(shown), shown.join(","));

const inside = pixel(cv1, 380, 60);
check("画板内矩形保留", isRed(inside), inside.join(","));

check("画板内点可命中", pointInArtboards(doc, { x: 450, y: 300 }));
check("画板外点不命中", !pointInArtboards(doc, { x: 950, y: 300 }));
check("无画板视为自由画布", pointInArtboards({ ...doc, artboards: [] } as VexaDoc, { x: 2000, y: 2000 }));

// 1b. 选择手柄也不能露到画板外
const overDoc = createDoc("手柄验收", 900, 600);
const cross = rectPath("cross", "跨边界", -100, 100, 300, 200);
cross.fill = solid("#e5484d");
cross.stroke = noStroke();
overDoc.nodes.cross = cross;
overDoc.root.push("cross");
const away = rectPath("away", "完全在板外", 1200, 100, 100, 100);
away.fill = solid("#2f9e44");
away.stroke = noStroke();
overDoc.nodes.away = away;
overDoc.root.push("away");
const accentPixels = (cv: any, x0: number, x1: number) => {
  const data = cv.getContext("2d").getImageData(x0, 0, x1 - x0, size.h).data as Uint8ClampedArray;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 2] > 150 && data[i] < 90 && data[i + 1] > 70 && data[i + 1] < 170) n++;
  }
  return n;
};
const cvE = createCanvas(size.w, size.h);
renderScene(cvE as any, overDoc, view, baseState({ selected: ["cross"] }), 1, size);
check("选择手柄不越过画板", accentPixels(cvE, 0, 16) === 0, `${accentPixels(cvE, 0, 16)} px`);
const cvF = createCanvas(size.w, size.h);
renderScene(cvF as any, overDoc, view, baseState({ selected: ["cross"], hideOutsideBoards: false }), 1, size);
check("关闭裁剪后手柄正常可见", accentPixels(cvF, 0, 20) > 0, `${accentPixels(cvF, 0, 20)} px`);
check("板外节点不参与框选", !nodeInArtboards(overDoc, "away"));
check("跨板节点仍参与框选", nodeInArtboards(overDoc, "cross"));
check("无画板时节点可框选", nodeInArtboards({ ...overDoc, artboards: [] } as VexaDoc, "cross"));

// 2. 视口剔除：同一文档，开/关剔除逐像素一致
const many = createDoc("剔除验收", 900, 600);
for (let i = 0; i < 300; i++) {
  const n = rectPath(`n${i}`, `节点 ${i}`, 20000 + i * 20, 100, 40, 30);
  n.fill = solid(i % 2 ? "#0f76d6" : "#e5484d");
  n.stroke = noStroke();
  many.nodes[n.id] = n;
  many.root.push(n.id);
}
const a = rectPath("a", "板内", 40, 40, 200, 120);
a.fill = solid("#2f9e44");
a.stroke = noStroke();
many.nodes.a = a;
many.root.push("a");
const cvA = createCanvas(size.w, size.h);
renderScene(cvA as any, many, view, baseState({ cull: false }), 1, size);
const cvB = createCanvas(size.w, size.h);
renderScene(cvB as any, many, view, baseState({ cull: true }), 1, size);
const bufA = Buffer.from(cvA.getContext("2d").getImageData(0, 0, size.w, size.h).data as Uint8ClampedArray);
const bufB = Buffer.from(cvB.getContext("2d").getImageData(0, 0, size.w, size.h).data as Uint8ClampedArray);
check("剔除前后画面一致", bufA.equals(bufB), `${bufA.length} 字节`);

// 3. 背景缓存：开/关逐像素一致
const cvC = createCanvas(size.w, size.h);
renderScene(cvC as any, many, view, baseState({ cacheBackground: false }), 1, size);
const cvD = createCanvas(size.w, size.h);
renderScene(cvD as any, many, view, baseState({ cacheBackground: true }), 1, size);
const bufC = Buffer.from(cvC.getContext("2d").getImageData(0, 0, size.w, size.h).data as Uint8ClampedArray);
const bufD = Buffer.from(cvD.getContext("2d").getImageData(0, 0, size.w, size.h).data as Uint8ClampedArray);
check("背景缓存前后画面一致", bufC.equals(bufD), `${bufC.length} 字节`);

// 4. 性能：1500 个视口外节点 × 20 帧，旧路径 vs 剔除+缓存
const perfDoc = createDoc("性能验收", 12000, 12000);
const inBoard = rectPath("in", "板内", 100, 100, 500, 300);
inBoard.fill = solid("#0f76d6");
inBoard.stroke = noStroke();
perfDoc.nodes.in = inBoard;
perfDoc.root.push("in");
for (let i = 0; i < 1500; i++) {
  const n = rectPath(`p${i}`, `远节点 ${i}`, 1600 + (i % 50) * 180, 1600 + Math.floor(i / 50) * 150, 120, 80);
  n.fill = solid(i % 3 === 0 ? "#e5484d" : "#2f9e44");
  n.stroke = noStroke();
  perfDoc.nodes[n.id] = n;
  perfDoc.root.push(n.id);
}
const perfView = { zoom: 0.35, panX: 10, panY: 10 };
const perfSize = { w: 800, h: 600 };
const timeRun = (state: RenderState) => {
  const cv = createCanvas(perfSize.w, perfSize.h);
  renderScene(cv as any, perfDoc, perfView, state, 1, perfSize);
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) renderScene(cv as any, perfDoc, perfView, state, 1, perfSize);
  return performance.now() - t0;
};
const slow = timeRun(baseState({ cull: false, cacheBackground: false, hideOutsideBoards: false }));
const fast = timeRun(baseState({ cull: true, cacheBackground: true, hideOutsideBoards: true }));
console.log(`perf 20 frames: old=${slow.toFixed(1)}ms optimized=${fast.toFixed(1)}ms speedup=${(slow / fast).toFixed(2)}x`);
check("剔除+缓存提速", fast < slow, `${(slow / fast).toFixed(2)}x`);

// 5. 视口内但在画板外的节点，裁剪开启时整棵跳过
const offDoc = createDoc("板外剔除", 300, 200);
for (let i = 0; i < 600; i++) {
  const n = rectPath(`o${i}`, `板外 ${i}`, 340 + (i % 30) * 18, 20 + Math.floor(i / 30) * 18, 40, 30);
  n.fill = solid(i % 2 ? "#0f76d6" : "#e5484d");
  n.stroke = noStroke();
  offDoc.nodes[n.id] = n;
  offDoc.root.push(n.id);
}
const offSize = { w: 800, h: 600 };
const timeOff = (hideOutsideBoards: boolean) => {
  const cv = createCanvas(offSize.w, offSize.h);
  renderScene(cv as any, offDoc, view, baseState({ hideOutsideBoards, cacheBackground: true }), 1, offSize);
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) renderScene(cv as any, offDoc, view, baseState({ hideOutsideBoards, cacheBackground: true }), 1, offSize);
  return performance.now() - t0;
};
const offOn = timeOff(true);
const offOff = timeOff(false);
check("视口内板外节点直接跳过", offOn < offOff, `${offOff.toFixed(1)}ms → ${offOn.toFixed(1)}ms`);

// 6. 几何在板外、粗描边压进板内的路径不能被整棵剔除
const edgeDoc = createDoc("描边贴边", 300, 200);
const edge = rectPath("edge", "贴边描边", -30, 50, 40, 40);
edge.fill = noPaint();
edge.stroke.kind = "solid";
edge.stroke.color = "#e5484d";
edge.stroke.width = 40;
edge.stroke.opacity = 1;
edgeDoc.nodes.edge = edge;
edgeDoc.root.push("edge");
const cvG = createCanvas(size.w, size.h);
renderScene(cvG as any, edgeDoc, view, baseState({}), 1, size);
const edgePx = pixel(cvG, 22, 45);
check("粗描边压进画板仍显示", isRed(edgePx), edgePx.join(","));

console.log(`\n${fail.length ? "有失败" : "全部通过"} · PASS ${pass.length} / FAIL ${fail.length}`);
if (fail.length) process.exit(1);
