/** 渐变：画布与 SVG 共用同一套端点计算，保证导出与屏幕一致。 */
import type { Box } from "./geom";
import type { GradStop, Paint } from "./types";

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function safeColor(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

/** 色标归一化：无效项剔除，offset 夹到 0..1，并按位置升序。 */
export function normalizeGradStops(stops: readonly GradStop[] | undefined, fallback: string): GradStop[] {
  const valid = (stops ?? [])
    .filter((s): s is GradStop => !!s && Number.isFinite(s.offset))
    .map((s) => ({
      offset: Math.min(1, Math.max(0, s.offset)),
      color: safeColor(s.color, fallback),
    }))
    .sort((a, b) => a.offset - b.offset);
  if (valid.length >= 2) return valid;
  if (valid.length === 1) {
    return [
      { offset: 0, color: valid[0].color },
      { offset: 1, color: "#ffffff" },
    ];
  }
  return [
    { offset: 0, color: fallback },
    { offset: 1, color: "#ffffff" },
  ];
}

/** 取一个填充当前实际会画的色标；画布、面板预览、导出都用它。 */
export function paintStops(p: Paint): GradStop[] {
  return normalizeGradStops(p.grad?.stops, p.color || "#000000");
}

function parseHex(color: string): [number, number, number] | null {
  if (!HEX.test(color)) return null;
  let hex = color.slice(1);
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  if (hex.length === 8) hex = hex.slice(0, 6);
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

/** 两个色标之间插入新色标：取最大空档，颜色按 RGB 中点混合，非 hex 色退回左端色。 */
export function insertGradStop(p: Paint, stops: readonly GradStop[]): { stops: GradStop[]; index: number } {
  const sorted = normalizeGradStops(stops, p.color || "#000000");
  let gap = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    gap = Math.max(gap, sorted[i + 1].offset - sorted[i].offset);
  }
  const from = sorted.findIndex((s, i) => i < sorted.length - 1 && Math.abs(sorted[i + 1].offset - s.offset - gap) < 1e-6);
  const left = sorted[from] ?? sorted[0];
  const right = sorted[from + 1] ?? sorted[sorted.length - 1];
  const offset = Math.min(1, Math.max(0, (left.offset + right.offset) / 2));
  const a = parseHex(left.color);
  const b = parseHex(right.color);
  const mix = a && b
    ? `#${a.map((n, i) => Math.round(n + (b[i] - n) * 0.5).toString(16).padStart(2, "0")).join("")}`
    : left.color;
  const next = [...sorted, { offset, color: mix }].sort((x, y) => x.offset - y.offset);
  return { stops: next, index: next.findIndex((s) => s.offset === offset && s.color === mix) };
}

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
    const stops = paintStops(p).map((s) => `${s.color} ${Math.round(s.offset * 1000) / 10}%`).join(", ");
    return `linear-gradient(${(p.grad?.angle ?? 90) + 90}deg, ${stops})`;
  }
  if (p.kind === "radial") {
    const stops = paintStops(p).map((s) => `${s.color} ${Math.round(s.offset * 1000) / 10}%`).join(", ");
    return `radial-gradient(circle at 50% 50%, ${stops})`;
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
  const stops = paintStops(p);
  for (const s of stops) g.addColorStop(s.offset, s.color);
  return g;
}
