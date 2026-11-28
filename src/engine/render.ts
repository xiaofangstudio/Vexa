/** 画面渲染：粘贴板点阵、画板、矢量对象、选择框与锚点手柄。 */
import { flatten, nodeBox, textDecorationLines, textLayout, unionBox, type Box } from "../core/geom";
import { brushById, brushPattern, brushStamps, calligraphyStamps } from "../core/brushes";
import { canvasPaint, gradAxis, gradHandlePoints, paintStops, stopAlpha, stopCssColor, strokePaint, strokeSolidColor } from "../core/paint";
import { widthHandles, widthOutline, widthPreview } from "../core/width";
import { pointInArtboards } from "../core/artboards";
import { groupBox } from "./pick";
import { handleLayout } from "./handles";
import type { Anchor, AnchorRef, Node, PathNode, PatternDef, Pt, VexaDoc } from "../core/types";
import { docToScreen, type View } from "./view";

export type ToolId =
  | "select"
  | "direct"
  | "pen"
  | "line"
  | "pencil"
  | "width"
  | "eyedropper"
  | "gradient"
  | "eraser"
  | "scissors"
  | "smooth"
  | "rect"
  | "roundrect"
  | "ellipse"
  | "circle"
  | "polygon"
  | "star"
  | "text"
  | "artboard"
  | "hand"
  | "zoom";

export interface PenState {
  nodeId: string | null;
  anchors: Anchor[];
  closed: boolean;
  hover: Pt | null;
}

export interface RenderState {
  selected: string[];
  tool: ToolId;
  pen: PenState | null;
  marquee: Box | null;
  hoverId: string | null;
  snapGuides: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  /** 点阵网格，默认开 */
  showGrid?: boolean;
  /** 空画板提示文案（设置里可关） */
  emptyHint?: string | null;
  /** 当前激活画板 id：描边高亮、空板提示都跟着它走 */
  activeBoardId?: string;
  /** 橡皮笔刷预览（文档坐标） */
  eraser?: { points: Pt[]; r: number } | null;
  /** 宽度工具悬停位置：节点 id + 弧长比例 */
  widthHover?: { nodeId: string; t: number } | null;
  /** 渐变工具悬停的色标 */
  gradientHover?: { nodeId: string; index: number } | null;
  /** 直接选择里高亮的锚点 */
  anchorSel?: AnchorRef[];
  /** 画板外内容裁掉（默认开） */
  hideOutsideBoards?: boolean;
  /** 视口外节点剔除（默认开） */
  cull?: boolean;
  /** 粘贴板/画板/网格静态层缓存（默认开） */
  cacheBackground?: boolean;
}

const imageCache = new Map<string, HTMLImageElement>();
const imagePending = new Set<string>();

function getImage(src: string, onLoad: () => void): HTMLImageElement | null {
  const hit = imageCache.get(src);
  if (hit) return hit.complete ? hit : null;
  if (imagePending.has(src)) return null;
  imagePending.add(src);
  const img = new Image();
  img.onload = () => {
    imageCache.set(src, img);
    imagePending.delete(src);
    onLoad();
  };
  img.onerror = () => imagePending.delete(src);
  img.src = src;
  return null;
}

export function clearImageCache(): void {
  imageCache.clear();
}

function ctxFor(cv: HTMLCanvasElement, dpr: number): CanvasRenderingContext2D {
  const ctx = cv.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D 不可用");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function css(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function drawPasteboard(ctx: CanvasRenderingContext2D, w: number, h: number, view: View): void {
  ctx.fillStyle = css("--canvas-bg", "#ececf0");
  ctx.fillRect(0, 0, w, h);
  // 点阵跟着画布走，缩放到 40% 以下就隐去，避免糊成一片
  const step = 24;
  const dot = css("--mat-dot", "rgba(24,24,32,0.12)");
  if (view.zoom > 0.4) {
    ctx.fillStyle = dot;
    const ox = ((view.panX % step) + step) % step;
    const oy = ((view.panY % step) + step) % step;
    for (let y = oy; y < h; y += step) {
      for (let x = ox; x < w; x += step) {
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
}

/** 画板辅助网格：16px 细线，缩得太小就不画，避免糊成灰块。 */
function drawBoardGrid(ctx: CanvasRenderingContext2D, doc: VexaDoc, view: View): void {
  if (view.zoom < 0.7) return;
  const step = 16;
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = css("--grid-line", "rgba(0,0,0,0.1)");
  ctx.lineWidth = 1 / view.zoom;
  ctx.beginPath();
  for (const b of doc.artboards) {
    for (let x = Math.ceil(b.x / step) * step; x < b.x + b.w; x += step) {
      ctx.moveTo(x, b.y);
      ctx.lineTo(x, b.y + b.h);
    }
    for (let y = Math.ceil(b.y / step) * step; y < b.y + b.h; y += step) {
      ctx.moveTo(b.x, y);
      ctx.lineTo(b.x + b.w, y);
    }
  }
  ctx.stroke();
  ctx.restore();
}

interface BackgroundCache {
  key: string;
  canvas: HTMLCanvasElement;
}
let bgCache: BackgroundCache | null = null;

const cullBoxCache = new Map<string, Box | null>();

function screenIntersects(b: Box, view: View, w: number, h: number, pad: number): boolean {
  const x0 = b.x * view.zoom + view.panX;
  const y0 = b.y * view.zoom + view.panY;
  const x1 = (b.x + b.w) * view.zoom + view.panX;
  const y1 = (b.y + b.h) * view.zoom + view.panY;
  return x1 >= -pad && y1 >= -pad && x0 <= w + pad && y0 <= h + pad;
}

/** 节点盒是否与任一画板相交；没有画板时视为自由画布。 */
function boxOnArtboards(doc: VexaDoc, b: Box): boolean {
  if (!doc.artboards.length) return true;
  return doc.artboards.some((a) => b.x < a.x + a.w && b.x + b.w > a.x && b.y < a.y + a.h && b.y + b.h > a.y);
}

/** 视口剔除：组取整体包围盒，其余节点取自身盒；空组直接不画。 */
function nodeVisible(
  doc: VexaDoc,
  node: Node,
  view: View,
  w: number,
  h: number,
  hideOutside = false,
): boolean {
  let b = cullBoxCache.get(node.id);
  if (b === undefined) {
    b = node.kind === "group" ? groupBox(doc, node) : nodeBox(node);
    cullBoxCache.set(node.id, b);
  }
  if (!b) return node.kind !== "group";
  if (hideOutside) {
    let pad = 12 / view.zoom;
    if (node.kind === "path" && node.stroke.kind !== "none" && node.stroke.width > 0) {
      let factor = 1;
      for (const p of node.stroke.widthPoints ?? []) factor = Math.max(factor, p.left, p.right);
      pad += node.stroke.width * factor / 2;
    }
    const bb: Box = { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
    if (!boxOnArtboards(doc, bb)) return false;
  }
  const strokePad = node.kind === "path" ? node.stroke.width / 2 : 0;
  const pad = (strokePad + 12 / view.zoom) * view.zoom;
  return screenIntersects(b, view, w, h, pad + 8);
}

function drawBoards(ctx: CanvasRenderingContext2D, doc: VexaDoc, view: View, activeBoardId?: string): void {
  const paper = css("--paper", "#fff");
  const accent = css("--accent", "#0f76d6");
  for (const b of doc.artboards) {
    ctx.save();
    ctx.shadowColor = "rgba(20,20,30,0.10)";
    ctx.shadowBlur = 18 / view.zoom;
    ctx.shadowOffsetY = 6 / view.zoom;
    ctx.fillStyle = b.bg || paper;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.restore();
    const active = b.id === activeBoardId;
    ctx.strokeStyle = active ? accent : "rgba(20,20,30,0.10)";
    ctx.lineWidth = (active ? 1.4 : 1) / view.zoom;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
  }
}

function backgroundKey(doc: VexaDoc, view: View, size: { w: number; h: number }, dpr: number, showGrid: boolean, activeBoardId?: string): string {
  const boards = doc.artboards.map((b) => `${b.id},${b.x},${b.y},${b.w},${b.h},${b.bg ?? ""}`).join(";");
  return `${size.w}x${size.h}@${dpr}|${view.zoom}|${view.panX}|${view.panY}|${showGrid ? 1 : 0}|${activeBoardId ?? ""}|${document.documentElement.dataset.theme ?? ""}|${boards}`;
}

/** 粘贴板点阵 + 画板纸面 + 网格只在视口/文档变化时重画，对象拖动时直接贴图。 */
function drawBackground(
  ctx: CanvasRenderingContext2D,
  doc: VexaDoc,
  view: View,
  state: RenderState,
  size: { w: number; h: number },
  dpr: number,
): void {
  const showGrid = state.showGrid !== false;
  if (state.cacheBackground === false) {
    drawPasteboard(ctx, size.w, size.h, view);
    ctx.save();
    ctx.translate(view.panX, view.panY);
    ctx.scale(view.zoom, view.zoom);
    drawBoards(ctx, doc, view, state.activeBoardId);
    if (showGrid) drawBoardGrid(ctx, doc, view);
    ctx.restore();
    return;
  }
  const key = backgroundKey(doc, view, size, dpr, showGrid, state.activeBoardId);
  if (!bgCache || bgCache.key !== key) {
    const off = document.createElement("canvas");
    off.width = Math.max(1, Math.round(size.w * dpr));
    off.height = Math.max(1, Math.round(size.h * dpr));
    const octx = ctxFor(off, dpr);
    drawPasteboard(octx, size.w, size.h, view);
    octx.save();
    octx.translate(view.panX, view.panY);
    octx.scale(view.zoom, view.zoom);
    drawBoards(octx, doc, view, state.activeBoardId);
    if (showGrid) drawBoardGrid(octx, doc, view);
    octx.restore();
    bgCache = { key, canvas: off };
  }
  ctx.drawImage(bgCache.canvas, 0, 0, size.w, size.h);
}

function loopsToPath(ctx: CanvasRenderingContext2D, loops: Pt[][]): void {  for (const loop of loops) {
    if (loop.length < 2) continue;
    ctx.moveTo(loop[0].x, loop[0].y);
    for (let i = 1; i < loop.length; i++) ctx.lineTo(loop[i].x, loop[i].y);
    ctx.closePath();
  }
}

/** 把图案砖画进离屏画布；砖排用 2×2 复制保证半格错位接缝闭合。 */
export function patternTileCanvas(
  doc: VexaDoc,
  def: PatternDef,
  scale = 1,
): { canvas: HTMLCanvasElement; w: number; h: number; res: number } | null {
  const s = Math.min(20, Math.max(0.05, scale));
  const w = Math.max(1, def.w * (def.tile === "brick" ? 2 : 1) * s);
  const h = Math.max(1, def.h * (def.tile === "brick" ? 2 : 1) * s);
  const res = 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * res));
  canvas.height = Math.max(1, Math.round(h * res));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(res, res);
  const temp: VexaDoc = { ...doc, nodes: def.nodes, root: def.root };
  const drawCopy = (x: number, y: number): void => {
    ctx.save();
    ctx.translate(x, y);
    for (const id of def.root) {
      const node = def.nodes[id];
      if (node) drawNode(ctx, temp, node, () => {}, undefined, undefined, false);
    }
    ctx.restore();
  };
  if (def.tile === "brick") {
    drawCopy(0, 0);
    drawCopy(def.w, 0);
    drawCopy(def.w / 2, def.h);
    drawCopy(def.w * 1.5, def.h);
  } else {
    drawCopy(0, 0);
  }
  return { canvas, w, h, res };
}

const patternCache = new WeakMap<VexaDoc, Map<string, { canvas: HTMLCanvasElement; res: number }>>();

/** 画布图案：按定义版本缓存砖图，平铺原点固定在文档 0,0。 */
function patternPaint(ctx: CanvasRenderingContext2D, doc: VexaDoc, fill: import("../core/types").Paint): CanvasPattern | string {
  const def = (doc.patterns ?? []).find((p) => p.id === fill.patternId);
  if (!def) return fill.color || "#0f76d6";
  const scale = Math.min(20, Math.max(0.05, fill.patternScale ?? 1));
  const key = `${def.id}|${def.rev ?? 1}|${scale}|${def.tile}|${def.w}|${def.h}`;
  let cache = patternCache.get(doc);
  if (!cache) {
    cache = new Map();
    patternCache.set(doc, cache);
  }
  let tile = cache.get(key);
  if (!tile) {
    const made = patternTileCanvas(doc, def, scale);
    if (!made) return fill.color || "#0f76d6";
    tile = { canvas: made.canvas, res: made.res };
    if (cache.size > 32) cache.clear();
    cache.set(key, tile);
  }
  const patt = ctx.createPattern(tile.canvas, "repeat");
  if (!patt) return fill.color || "#0f76d6";
  patt.setTransform(new DOMMatrix([1 / tile.res, 0, 0, 1 / tile.res, 0, 0]));
  return patt;
}

function fillPaint(ctx: CanvasRenderingContext2D, doc: VexaDoc, fill: import("../core/types").Paint, box: Box): string | CanvasGradient | CanvasPattern {
  if (fill.kind === "pattern") return patternPaint(ctx, doc, fill);
  return canvasPaint(ctx, fill, box);
}

function nodeToPath(ctx: CanvasRenderingContext2D, node: PathNode): void {
  for (const sub of node.subpaths) {
    const a = sub.anchors;
    if (!a.length) continue;
    ctx.moveTo(a[0].x, a[0].y);
    const count = sub.closed ? a.length : a.length - 1;
    for (let i = 0; i < count; i++) {
      const p = a[i];
      const q = a[(i + 1) % a.length];
      if (!p.hOut && !q.hIn) {
        ctx.lineTo(q.x, q.y);
      } else {
        const c1 = p.hOut ?? p;
        const c2 = q.hIn ?? q;
        ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, q.x, q.y);
      }
    }
    if (sub.closed) ctx.closePath();
  }
}

function drawArrow(ctx: CanvasRenderingContext2D, node: PathNode): void {
  const kind = node.stroke.arrow;
  if (!kind || kind === "none") return;
  const size = Math.max(6, node.stroke.width * 2.8);
  for (const sub of node.subpaths) {
    if (sub.closed || sub.anchors.length < 2) continue;
    const last = sub.anchors[sub.anchors.length - 1];
    const prev = sub.anchors[sub.anchors.length - 2];
    const c2 = last.hIn ?? last;
    const near = Math.hypot(c2.x - last.x, c2.y - last.y) > 0.01 ? c2 : prev;
    const ux = last.x - near.x;
    const uy = last.y - near.y;
    const len = Math.hypot(ux, uy) || 1;
    const u = { x: ux / len, y: uy / len };
    const n = { x: -u.y, y: u.x };
    const baseX = last.x - u.x * size;
    const baseY = last.y - u.y * size;
    ctx.beginPath();
    if (kind === "triangle") {
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(baseX + n.x * size * 0.45, baseY + n.y * size * 0.45);
      ctx.lineTo(baseX - n.x * size * 0.45, baseY - n.y * size * 0.45);
      ctx.fillStyle = node.stroke.color;
      ctx.fill();
    } else if (kind === "diamond") {
      const midX = last.x - u.x * size * 0.5;
      const midY = last.y - u.y * size * 0.5;
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(midX + n.x * size * 0.4, midY + n.y * size * 0.4);
      ctx.lineTo(baseX, baseY);
      ctx.lineTo(midX - n.x * size * 0.4, midY - n.y * size * 0.4);
      ctx.fillStyle = node.stroke.color;
      ctx.fill();
    } else {
      ctx.strokeStyle = node.stroke.color;
      ctx.lineWidth = node.stroke.width;
      ctx.moveTo(baseX + n.x * size * 0.5, baseY + n.y * size * 0.5);
      ctx.lineTo(last.x, last.y);
      ctx.lineTo(baseX - n.x * size * 0.5, baseY - n.y * size * 0.5);
      ctx.stroke();
    }
  }
}

function drawPathStroke(
  ctx: CanvasRenderingContext2D,
  doc: VexaDoc,
  node: PathNode,
  onImage: () => void,
  noBrush = false,
  stroke = node.stroke,
): void {
  if (!((stroke.kind !== "none" && stroke.width > 0) || stroke.brushId)) return;
  ctx.save();
  ctx.globalAlpha *= stroke.opacity;
  const brush = !noBrush && stroke.brushId ? brushById(doc, stroke.brushId) : undefined;
  const pattern = brushPattern(doc, brush);
  const painted = { ...node, stroke };
  const strokeStyle = fillPaint(ctx, doc, strokePaint(stroke), nodeBox(node));
  if (brush && brush.kind === "calligraphic") {
    ctx.fillStyle = strokeStyle;
    for (const st of calligraphyStamps(node, brush)) {
      ctx.save();
      ctx.translate(st.x, st.y);
      ctx.rotate(st.angle);
      ctx.beginPath();
      ctx.ellipse(0, 0, st.rx, st.ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  } else if (brush && pattern) {
    const tileDoc: VexaDoc = { ...doc, nodes: pattern.nodes, root: pattern.root };
    for (const stamp of brushStamps(doc, node, brush)) {
      ctx.save();
      ctx.translate(stamp.x, stamp.y);
      ctx.rotate(stamp.angle);
      ctx.scale(stamp.sx, stamp.sy);
      ctx.translate(-pattern.w / 2, -pattern.h / 2);
      if (stamp.slice) {
        ctx.beginPath();
        ctx.rect(stamp.slice.x, 0, stamp.slice.w, pattern.h);
        ctx.clip();
      }
      for (const id of pattern.root) {
        const child = pattern.nodes[id];
        if (child) drawNode(ctx, tileDoc, child, onImage, undefined, undefined, false, true);
      }
      ctx.restore();
    }
  } else {
    const outline = widthOutline(painted);
    if (outline) {
      ctx.fillStyle = strokeStyle;
      ctx.beginPath();
      loopsToPath(ctx, outline);
      ctx.fill("nonzero");
    } else {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = stroke.width;
      ctx.lineJoin = stroke.join ?? "miter";
      ctx.lineCap = stroke.cap ?? "butt";
      ctx.setLineDash(stroke.dash);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const arrowNode = stroke.kind === "linear" || stroke.kind === "radial"
      ? { ...painted, stroke: { ...stroke, color: strokeSolidColor(stroke) } }
      : painted;
    drawArrow(ctx, arrowNode);
  }
  ctx.restore();
}

/** 叠加外观：底层填充/描边绘制完之后，按数组顺序自底向上叠放。 */
function drawAppearance(ctx: CanvasRenderingContext2D, doc: VexaDoc, node: PathNode, onImage: () => void): void {
  for (const item of node.appearance ?? []) {
    if (!item.visible || item.opacity <= 0) continue;
    ctx.save();
    ctx.globalAlpha *= item.opacity;
    if (item.blend && item.blend !== "normal") ctx.globalCompositeOperation = item.blend;
    if (item.kind === "fill") {
      if (item.fill && item.fill.kind !== "none") {
        ctx.beginPath();
        nodeToPath(ctx, node);
        ctx.globalAlpha *= item.fill.opacity;
        ctx.fillStyle = fillPaint(ctx, doc, item.fill, nodeBox(node));
        ctx.fill();
      }
    } else if (item.stroke) {
      drawPathStroke(ctx, doc, node, onImage, true, item.stroke);
    }
    ctx.restore();
  }
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  doc: VexaDoc,
  node: Node,
  onImage: () => void,
  view?: View,
  size?: { w: number; h: number },
  hideOutside = false,
  noBrush = false,
): void {
  if (!node.visible) return;
  if (view && size && !nodeVisible(doc, node, view, size.w, size.h, hideOutside)) return;
  ctx.save();
  ctx.globalAlpha *= node.opacity;
  if (node.blend && node.blend !== "normal") ctx.globalCompositeOperation = node.blend;
  if (node.kind === "path") {
    ctx.beginPath();
    nodeToPath(ctx, node);
    if (node.fill.kind !== "none") {
      ctx.globalAlpha *= node.fill.opacity;
      ctx.fillStyle = fillPaint(ctx, doc, node.fill, nodeBox(node));
      ctx.fill();
      ctx.globalAlpha /= node.fill.opacity || 1;
    }
    drawPathStroke(ctx, doc, node, onImage, noBrush);
    drawAppearance(ctx, doc, node, onImage);
  } else if (node.kind === "text") {
    const lay = textLayout(node);
    const hs = (node.hScale ?? 100) / 100;
    const vs = (node.vScale ?? 100) / 100;
    const tracking = node.tracking ?? 0;
    const paintGlyphs = (paint: import("../core/types").Paint | null, stroke: import("../core/types").Stroke | null) => {
      if (!paint && !stroke) return;
      const stroking = !!stroke && stroke.kind !== "none" && stroke.width > 0;
      const painting = !!paint && paint.kind !== "none";
      if (!stroking && !painting) return;
      ctx.save();
      if (lay.mode === "area") {
        ctx.beginPath();
        ctx.rect(lay.box.x, lay.box.y, lay.box.w, lay.box.h);
        ctx.clip();
      }
      ctx.font = `${node.italic ? "italic " : ""}${node.bold ? "700 " : ""}${node.size}px ${node.font}`;
      if (stroking) {
        ctx.globalAlpha *= stroke.opacity ?? 1;
        ctx.strokeStyle = fillPaint(ctx, doc, strokePaint(stroke), lay.box);
        ctx.lineWidth = stroke.width;
        ctx.lineCap = stroke.cap ?? "butt";
        ctx.lineJoin = stroke.join ?? "miter";
        ctx.setLineDash(stroke.dash ?? []);
      } else if (painting) {
        ctx.globalAlpha *= paint.opacity ?? 1;
        ctx.fillStyle = fillPaint(ctx, doc, paint, lay.box);
      }
      const emit = (ch: string, x: number, y: number) => {
        if (stroking) ctx.strokeText(ch, x, y);
        else ctx.fillText(ch, x, y);
      };
      if (lay.mode === "path") {
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        for (const c of lay.path?.chars ?? []) {
          if (!c.ch.trim()) continue;
          ctx.save();
          ctx.translate(c.x, c.y);
          ctx.rotate(c.angle);
          ctx.scale(hs, vs);
          emit(c.ch, 0, 0);
          ctx.restore();
        }
      } else if (lay.vertical) {
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (const c of lay.vertical.chars) {
          if (!c.ch.trim()) continue;
          ctx.save();
          ctx.translate(c.x + (c.dx ?? 0), c.y + c.advance / 2 + (c.dy ?? 0));
          if (c.rotate) ctx.rotate(Math.PI / 2);
          ctx.scale(hs, vs);
          emit(c.ch, 0, 0);
          ctx.restore();
        }
      } else {
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        lay.lines.forEach((line) => {
          const chars = Array.from(line.text);
          const widths = chars.map((ch) => ctx.measureText(ch).width);
          ctx.save();
          ctx.translate(line.x, line.baseline);
          ctx.scale(hs, vs);
          if (tracking === 0) {
            emit(line.text, 0, 0);
          } else {
            let x = 0;
            chars.forEach((ch, k) => {
              emit(ch, x, 0);
              x += widths[k] + tracking;
            });
          }
          ctx.restore();
        });
      }
      ctx.restore();
    };

    paintGlyphs(node.fill.kind !== "none" ? node.fill : null, null);
    if (node.stroke) paintGlyphs(null, node.stroke);
    for (const item of node.appearance ?? []) {
      if (!item.visible) continue;
      ctx.save();
      ctx.globalAlpha *= item.opacity;
      if (item.blend && item.blend !== "normal") ctx.globalCompositeOperation = item.blend;
      if (item.kind === "fill" && item.fill) paintGlyphs(item.fill, null);
      else if (item.kind === "stroke" && item.stroke) paintGlyphs(null, item.stroke);
      ctx.restore();
    }

    const decor = textDecorationLines(node, lay);
    if (decor.length && node.fill.kind !== "none") {
      ctx.save();
      ctx.globalAlpha *= node.fill.opacity;
      ctx.strokeStyle = node.fill.color;
      ctx.lineWidth = 1;
      ctx.lineCap = "butt";
      for (const line of decor) {
        ctx.lineWidth = line.thickness;
        ctx.beginPath();
        ctx.moveTo(line.x1, line.y1);
        ctx.lineTo(line.x2, line.y2);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (lay.mode === "area" && lay.overflow) {
      const ox = lay.box.x + lay.box.w - 11;
      const oy = lay.box.y + lay.box.h - 11;
      ctx.fillStyle = "#e5484d";
      ctx.fillRect(ox - 3, oy - 0.6, 6, 1.2);
      ctx.fillRect(ox - 0.6, oy - 3, 1.2, 6);
    }
  } else if (node.kind === "image") {
    const img = getImage(node.src, onImage);
    if (img) ctx.drawImage(img, node.x, node.y, node.w, node.h);
  } else if (node.kind === "symbol") {
    const def = doc.symbols?.find((s) => s.id === node.symbolId);
    if (def) {
      const tempDoc: VexaDoc = { ...doc, nodes: def.nodes, root: def.root };
      const sx = node.w / Math.max(1, def.w);
      const sy = node.h / Math.max(1, def.h);
      ctx.save();
      ctx.translate(node.x, node.y);
      ctx.scale(sx, sy);
      for (const id of def.root) {
        const child = def.nodes[id];
        if (child) drawNode(ctx, tempDoc, child, onImage, undefined, undefined, false, noBrush);
      }
      ctx.restore();
    }
  } else {
    // 剪切蒙版：clip 子节点只提供裁切轮廓，本身不绘制
    const clipNode = node.clip ? doc.nodes[node.clip] : undefined;
    if (clipNode && clipNode.kind === "path") {
      ctx.beginPath();
      nodeToPath(ctx, clipNode);
      ctx.clip();
    }
    for (const id of node.children) {
      if (id === node.clip) continue;
      const child = doc.nodes[id];
      if (child) drawNode(ctx, doc, child, onImage, view, size, hideOutside, noBrush);
    }
  }
  ctx.restore();
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  doc: VexaDoc,
  state: RenderState,
  view: View,
): void {
  const accent = css("--accent", "#0f76d6");
  // 画板裁剪开启时，手柄中心落在板外的整颗都不画，避免沿着板边留下半个白方块。
  const chromeInside = (p: Pt) => state.hideOutsideBoards === false || !doc.artboards.length || pointInArtboards(doc, p);
  if (state.eraser && state.eraser.points.length) {
    const pts = state.eraser.points;
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (pts.length > 1) {
      ctx.globalAlpha = 0.12;
      ctx.lineWidth = state.eraser.r * 2;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.72;
    ctx.lineWidth = 1.2 / view.zoom;
    const last = pts[pts.length - 1];
    ctx.beginPath();
    ctx.arc(last.x, last.y, state.eraser.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  const selected = state.selected.map((id) => doc.nodes[id]).filter((n): n is Node => !!n);
  let box: Box | null = null;
  for (const n of selected) {
    const b = n.kind === "group" ? groupBox(doc, n) : nodeBox(n);
    if (b) box = unionBox(box, b);
  }

  if (box && state.tool !== "width") {
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    ctx.setLineDash([]);
    if (state.tool !== "direct") {
      const layout = handleLayout(box, view.zoom);
      // 旋转柄：顶边中点引一条 26px 的短线 + 圆形手柄
      if (chromeInside(layout.rotate)) {
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1 / view.zoom;
        ctx.beginPath();
        ctx.moveTo(layout.lineTop.x, layout.lineTop.y);
        ctx.lineTo(layout.rotate.x, layout.rotate.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(layout.rotate.x, layout.rotate.y, layout.rotSize / 2, 0, Math.PI * 2);
        ctx.fillStyle = accent;
        ctx.fill();
      }

      const hs = layout.size;
      for (const h of layout.points) {
        if (!chromeInside(h.p)) continue;
        const p = h.p;
        ctx.fillStyle = css("--anchor", "#fff");
        ctx.fillRect(p.x - hs / 2, p.y - hs / 2, hs, hs);
        ctx.strokeStyle = css("--anchor-ink", "#1c1c22");
        ctx.strokeRect(p.x - hs / 2, p.y - hs / 2, hs, hs);
      }
    }
    ctx.restore();
  }

  // 渐变工具：选中单个渐变对象时显示轴线与色标手柄，可直接拖动
  if (state.tool === "gradient" && state.selected.length === 1) {
    const n = doc.nodes[state.selected[0]];
    if (n?.kind === "path" && (n.fill.kind === "linear" || n.fill.kind === "radial") && n.fill.grad) {
      const box = nodeBox(n);
      const axis = gradAxis(n.fill, box);
      if (axis) {
        const points = gradHandlePoints(n.fill, box);
        const stops = paintStops(n.fill);
        const hoverIndex = state.gradientHover?.nodeId === n.id ? state.gradientHover.index : -1;
        ctx.save();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.1 / view.zoom;
        ctx.globalAlpha = 0.85;
        ctx.setLineDash(n.fill.kind === "radial" ? [4 / view.zoom, 4 / view.zoom] : [6 / view.zoom, 4 / view.zoom]);
        ctx.beginPath();
        ctx.moveTo(axis.x1, axis.y1);
        ctx.lineTo(axis.x2, axis.y2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        points.forEach((q, i) => {
          const s = stops[i];
          if (!s || !chromeInside(q)) return;
          const hovered = i === hoverIndex;
          const r = (hovered ? 7.4 : 5.6) / view.zoom;
          ctx.beginPath();
          ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
          ctx.fillStyle = css("--paper", "#fff");
          ctx.fill();
          ctx.strokeStyle = hovered ? css("--accent", "#0f76d6") : css("--anchor-ink", "#1c1c22");
          ctx.lineWidth = (hovered ? 2 : 1) / view.zoom;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(q.x, q.y, 2.9 / view.zoom, 0, Math.PI * 2);
          ctx.fillStyle = stopCssColor(s);
          ctx.fill();
          if (stopAlpha(s) < 0.25) {
            ctx.beginPath();
            ctx.arc(q.x, q.y, 5.2 / view.zoom, 0, Math.PI * 2);
            ctx.strokeStyle = css("--anchor-ink", "#1c1c22");
            ctx.lineWidth = 0.7 / view.zoom;
            ctx.stroke();
          }
        });
        ctx.restore();
      }
    }
  }

  // 宽度工具：宽度点的左右手柄与悬停预览
  if (state.tool === "width") {
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.fillStyle = css("--anchor", "#fff");
    ctx.lineWidth = 1 / view.zoom;
    const unit = 1 / view.zoom;
    for (const n of selected) {
      if (n.kind !== "path" || n.stroke.kind === "none" || n.stroke.width <= 0) continue;
      for (const h of widthHandles(n)) {
        if (!chromeInside(h.center)) continue;
        ctx.globalAlpha = 0.72;
        ctx.beginPath();
        ctx.moveTo(h.left.x, h.left.y);
        ctx.lineTo(h.right.x, h.right.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(h.center.x, h.center.y, 2.1 * unit, 0, Math.PI * 2);
        ctx.fillStyle = accent;
        ctx.fill();
        const s = 4.6 * unit;
        for (const q of [h.left, h.right]) {
          if (!chromeInside(q)) continue;
          ctx.fillStyle = css("--anchor", "#fff");
          ctx.fillRect(q.x - s / 2, q.y - s / 2, s, s);
          ctx.strokeStyle = accent;
          ctx.strokeRect(q.x - s / 2, q.y - s / 2, s, s);
        }
      }
    }
    const hover = state.widthHover;
    const hoverNode = hover ? doc.nodes[hover.nodeId] : undefined;
    if (hover && hoverNode && hoverNode.kind === "path") {
      const h = widthPreview(hoverNode, hover.t);
      if (h) {
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.moveTo(h.left.x, h.left.y);
        ctx.lineTo(h.right.x, h.right.y);
        ctx.strokeStyle = accent;
        ctx.stroke();
        const r = 3.6 * unit;
        for (const q of [h.left, h.right]) {
          ctx.beginPath();
          ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(h.center.x, h.center.y, 2.4 * unit, 0, Math.PI * 2);
        ctx.fillStyle = accent;
        ctx.fill();
      }
    }
    ctx.restore();
  }

  if (state.tool === "direct") {
    for (const n of selected) {
      if (n.kind !== "path") continue;
      for (let si = 0; si < n.subpaths.length; si++) {
        const sub = n.subpaths[si];
        for (let ai = 0; ai < sub.anchors.length; ai++) {
          const a = sub.anchors[ai];
          if (!chromeInside(a)) continue;
          if (a.hIn || a.hOut) {
            ctx.strokeStyle = css("--handle", "#0f76d6");
            ctx.lineWidth = 1 / view.zoom;
            for (const h of [a.hIn, a.hOut]) {
              if (!h) continue;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(h.x, h.y);
              ctx.stroke();
              if (!chromeInside(h)) continue;
              ctx.beginPath();
              ctx.arc(h.x, h.y, 3 / view.zoom, 0, Math.PI * 2);
              ctx.fillStyle = css("--handle", "#0f76d6");
              ctx.fill();
            }
          }
          const picked = state.anchorSel?.some((r) => r.nodeId === n.id && r.si === si && r.ai === ai) ?? false;
          const s = (picked ? 9 : 6) / view.zoom;
          ctx.fillStyle = css("--anchor", "#fff");
          ctx.fillRect(a.x - s / 2, a.y - s / 2, s, s);
          ctx.strokeStyle = picked ? accent : css("--anchor-ink", "#1c1c22");
          ctx.lineWidth = (picked ? 2 : 1) / view.zoom;
          ctx.strokeRect(a.x - s / 2, a.y - s / 2, s, s);
        }
      }
    }
  }

  // 钢笔实时预览
  if (state.pen && state.pen.anchors.length) {
    const anchors = state.pen.anchors;
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5 / view.zoom;
    ctx.beginPath();
    const first = anchors[0];
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < anchors.length; i++) {
      const p = anchors[i - 1];
      const q = anchors[i];
      const c1 = p.hOut ?? p;
      const c2 = q.hIn ?? q;
      if (!p.hOut && !q.hIn) ctx.lineTo(q.x, q.y);
      else ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, q.x, q.y);
    }
    const last = anchors[anchors.length - 1];
    if (state.pen.hover) {
      const c1 = last.hOut ?? last;
      ctx.bezierCurveTo(c1.x, c1.y, state.pen.hover.x, state.pen.hover.y, state.pen.hover.x, state.pen.hover.y);
    }
    ctx.stroke();
    // 锚点小点
    for (const a of anchors) {
      ctx.beginPath();
      ctx.arc(a.x, a.y, 2.4 / view.zoom, 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.fill();
    }
    if (state.pen.hover) {
      ctx.beginPath();
      ctx.arc(state.pen.hover.x, state.pen.hover.y, 3.2 / view.zoom, 0, Math.PI * 2);
      ctx.strokeStyle = accent;
      ctx.stroke();
    }
    ctx.restore();
  }

  // 框选
  if (state.marquee) {
    ctx.save();
    ctx.fillStyle = css("--marquee", "rgba(15,118,214,0.12)");
    ctx.fillRect(state.marquee.x, state.marquee.y, state.marquee.w, state.marquee.h);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1 / view.zoom;
    ctx.strokeRect(state.marquee.x, state.marquee.y, state.marquee.w, state.marquee.h);
    ctx.restore();
  }

  // 智能参考线
  if (state.snapGuides.length) {
    ctx.save();
    ctx.strokeStyle = css("--guide", "#24a2ff");
    ctx.lineWidth = 1 / view.zoom;
    for (const g of state.snapGuides) {
      ctx.beginPath();
      ctx.moveTo(g.x1, g.y1);
      ctx.lineTo(g.x2, g.y2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 悬停高亮
  if (state.hoverId && !state.selected.includes(state.hoverId)) {
    const n = doc.nodes[state.hoverId];
    if (n) {
      const b = n.kind === "group" ? groupBox(doc, n) : nodeBox(n);
      if (!b) return;
      ctx.save();
      ctx.strokeStyle = "rgba(15,118,214,0.55)";
      ctx.lineWidth = 1 / view.zoom;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.restore();
    }
  }
}

export function renderScene(
  cv: HTMLCanvasElement,
  doc: VexaDoc,
  view: View,
  state: RenderState,
  dpr: number,
  size: { w: number; h: number },
): void {
  const ctx = ctxFor(cv, dpr);
  ctx.clearRect(0, 0, size.w, size.h);
  drawBackground(ctx, doc, view, state, size, dpr);

  cullBoxCache.clear();
  ctx.save();
  ctx.translate(view.panX, view.panY);
  ctx.scale(view.zoom, view.zoom);
  const hideOutside = state.hideOutsideBoards !== false && doc.artboards.length > 0;

  // 画板外内容裁掉，避免对象跑到灰色粘贴板上仍显示
  ctx.save();
  if (hideOutside) {
    ctx.beginPath();
    for (const b of doc.artboards) ctx.rect(b.x, b.y, b.w, b.h);
    ctx.clip();
  }

  const onImage = () => {
    renderScene(cv, doc, view, state, dpr, size);
  };
  const cullView = state.cull === false ? undefined : view;
  const cullSize = state.cull === false ? undefined : size;
  for (const id of doc.root) {
    const n = doc.nodes[id];
    if (n) drawNode(ctx, doc, n, onImage, cullView, cullSize, hideOutside);
  }
  ctx.restore();

  const accent = css("--accent", "#0f76d6");

  // 画板工具：当前板的八个缩放柄
  if (state.tool === "artboard") {
    const b = doc.artboards.find((a) => a.id === state.activeBoardId) ?? doc.artboards[0];
    if (b) {
      const l = handleLayout(b, view.zoom);
      const s = 6 / view.zoom;
      for (const h of l.points) {
        ctx.fillStyle = css("--paper", "#fff");
        ctx.fillRect(h.p.x - s / 2, h.p.y - s / 2, s, s);
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1 / view.zoom;
        ctx.strokeRect(h.p.x - s / 2, h.p.y - s / 2, s, s);
      }
    }
  }

  // 选择框、锚点、框选、悬停同样不越过画板边界，
  // 否则对象被裁掉后只剩一圈手柄浮在粘贴板上，仍像“内容露出来了”。
  ctx.save();
  if (hideOutside) {
    ctx.beginPath();
    for (const b of doc.artboards) ctx.rect(b.x, b.y, b.w, b.h);
    ctx.clip();
  }
  drawOverlay(ctx, doc, state, view);
  ctx.restore();
  ctx.restore();

  // 画板名（屏幕坐标）
  ctx.save();
  ctx.font = `500 11px ${css("--font-ui", "Segoe UI")}`;
  ctx.fillStyle = css("--text-3", "#8f8f9c");
  for (const b of doc.artboards) {
    const p = docToScreen(view, b.x, b.y);
    ctx.fillText(b.name, p.x, p.y - 8);
  }
  ctx.restore();

  // 空画板提示（屏幕坐标，居中在画板上）
  if (state.emptyHint && doc.root.length === 0) {
    const b = doc.artboards.find((a) => a.id === state.activeBoardId) ?? doc.artboards[0];
    if (b) {
      const c = docToScreen(view, b.x + b.w / 2, b.y + b.h / 2);
      ctx.save();
      ctx.font = `400 12.5px ${css("--font-ui", "Segoe UI")}`;
      ctx.fillStyle = css("--text-3", "#8f8f9c");
      ctx.textAlign = "center";
      ctx.fillText(state.emptyHint, c.x, c.y);
      ctx.restore();
    }
  }
}

/** 命中检测用：把一条路径的子路径拍平成折线。 */
export function polylineOf(node: PathNode): Pt[][] {
  return node.subpaths.map((s) => flatten(s));
}
