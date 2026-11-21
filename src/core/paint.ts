/** 渐变：画布与 SVG 共用同一套端点计算，保证导出与屏幕一致。 */
import type { Box } from "./geom";
import type { Paint } from "./types";

/** 渐变轴端点（绝对坐标）：过 bbox 中心，长度投到 bbox 上再裁半。 */
export function gradLine(angle: number, box: Box): { x1: number; y1: number; x2: number; y2: number } {
  const rad = (angle * Math.PI) / 180;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const len = Math.abs(box.w * dx) + Math.abs(box.h * dy);
  return {
    x1: cx - (dx * len) / 2,
    y1: cy - (dy * len) / 2,
    x2: cx + (dx * len) / 2,
    y2: cy + (dy * len) / 2,
  };
}

/** 取两个端点色，缺一个就用主色兜底。 */
export function gradStops(p: Paint): { from: string; to: string; angle: number } {
  const g = p.grad;
  if (!g || g.stops.length < 2) return { from: p.color, to: p.color, angle: 90 };
  return { from: g.stops[0].color, to: g.stops[g.stops.length - 1].color, angle: g.angle };
}

/** 面板小色块用的 CSS 预览。 */
export function paintPreview(p: Paint): string {
  if (p.kind === "none") return "transparent";
  if (p.kind === "linear") {
    const { from, to, angle } = gradStops(p);
    return `linear-gradient(${angle + 90}deg, ${from}, ${to})`;
  }
  if (p.kind === "radial") {
    const { from, to } = gradStops(p);
    return `radial-gradient(circle at 50% 50%, ${from}, ${to})`;
  }
  return p.color;
}

/** 径向渐变覆盖整个 bbox：圆心在中心，半径取半对角线。 */
export function radialGeom(box: Box): { cx: number; cy: number; r: number } {
  return {
    cx: box.x + box.w / 2,
    cy: box.y + box.h / 2,
    r: Math.max(0.5, Math.hypot(box.w, box.h) / 2),
  };
}

/** 把任意填充转成线性渐变：已有 stops 直接复用，实色从本色渐变到白，无色用品牌蓝兜底。 */
export function toLinearGradient(p: Paint): Paint {
  const stops = p.grad && p.grad.stops.length >= 2 ? p.grad.stops.map((s) => ({ ...s })) : null;
  const from = stops ? stops[0].color : p.kind === "none" ? "#0f76d6" : p.color;
  return {
    kind: "linear",
    color: from,
    opacity: p.opacity ?? 1,
    grad: {
      angle: stops ? p.grad!.angle : 90,
      stops: stops ?? [{ offset: 0, color: from }, { offset: 1, color: "#ffffff" }],
    },
  };
}

/** 画布填充：实色返回字符串，渐变返回 CanvasGradient。 */
export function canvasPaint(ctx: CanvasRenderingContext2D, p: Paint, box: Box): string | CanvasGradient {
  if (p.kind !== "linear" && p.kind !== "radial") return p.color;
  if (!p.grad) return p.color;
  let g: CanvasGradient;
  if (p.kind === "radial") {
    const { cx, cy, r } = radialGeom(box);
    g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  } else {
    const { x1, y1, x2, y2 } = gradLine(p.grad.angle, box);
    g = ctx.createLinearGradient(x1, y1, x2, y2);
  }
  const stops = p.grad.stops.length ? p.grad.stops : [{ offset: 0, color: p.color }, { offset: 1, color: p.color }];
  for (const s of stops) g.addColorStop(Math.min(1, Math.max(0, s.offset)), s.color);
  return g;
}
