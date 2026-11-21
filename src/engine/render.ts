/** 画面渲染：粘贴板点阵、画板、矢量对象、选择框与锚点手柄。 */
import { flatten, nodeBox, textBox, unionBox, type Box } from "../core/geom";
import { canvasPaint } from "../core/paint";
import { widthHandles, widthOutline, widthPreview } from "../core/width";
import { groupBox } from "./pick";
import { handleLayout } from "./handles";
import type { Anchor, Node, PathNode, Pt, VexaDoc } from "../core/types";
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

function loopsToPath(ctx: CanvasRenderingContext2D, loops: Pt[][]): void {
  for (const loop of loops) {
    if (loop.length < 2) continue;
    ctx.moveTo(loop[0].x, loop[0].y);
    for (let i = 1; i < loop.length; i++) ctx.lineTo(loop[i].x, loop[i].y);
    ctx.closePath();
  }
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

function drawNode(
  ctx: CanvasRenderingContext2D,
  doc: VexaDoc,
  node: Node,
  onImage: () => void,
): void {
  if (!node.visible) return;
  ctx.save();
  ctx.globalAlpha *= node.opacity;
  if (node.blend && node.blend !== "normal") ctx.globalCompositeOperation = node.blend;
  if (node.kind === "path") {
    ctx.beginPath();
    nodeToPath(ctx, node);
    if (node.fill.kind !== "none") {
      ctx.globalAlpha *= node.fill.opacity;
      ctx.fillStyle = canvasPaint(ctx, node.fill, nodeBox(node));
      ctx.fill();
      ctx.globalAlpha /= node.fill.opacity || 1;
    }
    if (node.stroke.kind !== "none" && node.stroke.width > 0) {
      ctx.globalAlpha *= node.stroke.opacity;
      const outline = widthOutline(node);
      if (outline) {
        ctx.fillStyle = node.stroke.color;
        ctx.beginPath();
        loopsToPath(ctx, outline);
        ctx.fill("nonzero");
      } else {
        ctx.strokeStyle = node.stroke.color;
        ctx.lineWidth = node.stroke.width;
        ctx.lineJoin = "round";
        ctx.lineCap = "butt";
        ctx.setLineDash(node.stroke.dash);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      drawArrow(ctx, node);
    }
  } else if (node.kind === "text") {
    if (node.fill.kind !== "none") {
      const lines = node.text.split("\n");
      const tbox = textBox(node);
      const lh = node.size * (node.lineHeight ?? 1.25);
      const tracking = node.tracking ?? 0;
      const align = node.align ?? "left";
      const hs = (node.hScale ?? 100) / 100;
      const vs = (node.vScale ?? 100) / 100;
      ctx.fillStyle = canvasPaint(ctx, node.fill, tbox);
      ctx.font = `${node.italic ? "italic " : ""}${node.bold ? "700 " : ""}${node.size}px ${node.font}`;
      ctx.textBaseline = "alphabetic";
      lines.forEach((line, i) => {
        const chars = Array.from(line);
        const widths = chars.map((ch) => ctx.measureText(ch).width);
        const total = widths.reduce((a, b) => a + b, 0) + Math.max(0, chars.length - 1) * tracking;
        const dx = align === "center" ? -total * hs / 2 : align === "right" ? -total * hs : 0;
        ctx.save();
        ctx.translate(node.x + dx, node.y + i * lh - (node.baseline ?? 0));
        ctx.scale(hs, vs);
        if (tracking === 0) {
          ctx.fillText(line, 0, 0);
        } else {
          let x = 0;
          chars.forEach((ch, k) => {
            ctx.fillText(ch, x, 0);
            x += widths[k] + tracking;
          });
        }
        ctx.restore();
      });
    }
  } else if (node.kind === "image") {
    const img = getImage(node.src, onImage);
    if (img) ctx.drawImage(img, node.x, node.y, node.w, node.h);
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
      if (child) drawNode(ctx, doc, child, onImage);
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

      const hs = layout.size;
      for (const h of layout.points) {
        const p = h.p;
        ctx.fillStyle = css("--anchor", "#fff");
        ctx.fillRect(p.x - hs / 2, p.y - hs / 2, hs, hs);
        ctx.strokeStyle = css("--anchor-ink", "#1c1c22");
        ctx.strokeRect(p.x - hs / 2, p.y - hs / 2, hs, hs);
      }
    }
    ctx.restore();
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
      for (const sub of n.subpaths) {
        for (const a of sub.anchors) {
          if (a.hIn || a.hOut) {
            ctx.strokeStyle = css("--handle", "#0f76d6");
            ctx.lineWidth = 1 / view.zoom;
            for (const h of [a.hIn, a.hOut]) {
              if (!h) continue;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(h.x, h.y);
              ctx.stroke();
              ctx.beginPath();
              ctx.arc(h.x, h.y, 3 / view.zoom, 0, Math.PI * 2);
              ctx.fillStyle = css("--handle", "#0f76d6");
              ctx.fill();
            }
          }
          const s = 6 / view.zoom;
          ctx.fillStyle = a.smooth ? css("--anchor", "#fff") : css("--anchor", "#fff");
          ctx.fillRect(a.x - s / 2, a.y - s / 2, s, s);
          ctx.strokeStyle = css("--anchor-ink", "#1c1c22");
          ctx.lineWidth = 1 / view.zoom;
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
  drawPasteboard(ctx, size.w, size.h, view);

  ctx.save();
  ctx.translate(view.panX, view.panY);
  ctx.scale(view.zoom, view.zoom);

  // 画板：白纸 + 细边 + 板名（板名画在屏幕系，避免缩放后字号变形）
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
    const active = b.id === state.activeBoardId;
    ctx.strokeStyle = active ? accent : "rgba(20,20,30,0.10)";
    ctx.lineWidth = (active ? 1.4 : 1) / view.zoom;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
  }

  // 网格要压在画板底色之上、对象之下，否则被白纸盖住
  if (state.showGrid !== false) drawBoardGrid(ctx, doc, view);

  const onImage = () => {
    renderScene(cv, doc, view, state, dpr, size);
  };
  for (const id of doc.root) {
    const n = doc.nodes[id];
    if (n) drawNode(ctx, doc, n, onImage);
  }

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

  drawOverlay(ctx, doc, state, view);
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
