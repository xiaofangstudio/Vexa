/** 渐变：画布与 SVG 共用同一套端点、色标展开与透明度计算，保证导出与屏幕一致。 */
import type { Box } from "./geom";
import type { GradStop, Paint } from "./types";

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function safeColor(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/** 色标归一化：无效项剔除，offset 夹到 0..1，alpha/midpoint 夹到合法范围，并按位置升序。 */
export function normalizeGradStops(stops: readonly GradStop[] | undefined, fallback: string): GradStop[] {
  const valid = (stops ?? [])
    .filter((s): s is GradStop => !!s && Number.isFinite(s.offset))
    .map((s) => {
      const stop: GradStop = {
        offset: clamp01(s.offset),
        color: safeColor(s.color, fallback),
      };
      if (Number.isFinite(s.alpha)) stop.alpha = clamp01(s.alpha as number);
      if (Number.isFinite(s.midpoint)) stop.midpoint = clamp01(s.midpoint as number);
      return stop;
    })
    .sort((a, b) => a.offset - b.offset);
  if (valid.length >= 2) return valid;
  if (valid.length === 1) {
    return [
      { offset: 0, color: valid[0].color, ...(valid[0].alpha !== undefined ? { alpha: valid[0].alpha } : {}) },
      { offset: 1, color: "#ffffff" },
    ];
  }
  return [
    { offset: 0, color: fallback },
    { offset: 1, color: "#ffffff" },
  ];
}

/** 编辑用色标：保留作者输入，不展开中点。画布、面板、SVG 再按需展开。 */
export function paintStops(p: Paint): GradStop[] {
  return normalizeGradStops(p.grad?.stops, p.color || "#000000");
}

export function stopAlpha(s: GradStop): number {
  return Number.isFinite(s.alpha) ? clamp01(s.alpha as number) : 1;
}

function parseHex(color: string): [number, number, number] | null {
  if (!HEX.test(color)) return null;
  let hex = color.slice(1);
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  if (hex.length === 8) hex = hex.slice(0, 6);
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

/** CSS 用的色标颜色；半透明走 rgba，保留现有 hex 也可直接使用。 */
export function stopCssColor(s: GradStop): string {
  const a = stopAlpha(s);
  if (a >= 0.999) return s.color;
  const rgb = parseHex(s.color);
  if (!rgb) return s.color;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Math.round(a * 1000) / 1000})`;
}

function mixStops(a: GradStop, b: GradStop, t: number): { color: string; alpha: number } {
  const aa = stopAlpha(a);
  const ab = stopAlpha(b);
  const alpha = aa + (ab - aa) * t;
  const ca = parseHex(a.color);
  const cb = parseHex(b.color);
  if (!ca || !cb) return { color: t < 0.5 ? a.color : b.color, alpha };
  const rgb = ca.map((n, i) => Math.round(n + (cb[i] - n) * t));
  return {
    color: `#${rgb.map((n) => n.toString(16).padStart(2, "0")).join("")}`,
    alpha,
  };
}

/** 中点 0.5 = 线性；越靠近左色标，前半段变化越慢，中点处仍恰好混到 50%。 */
function midpointCurve(u: number, midpoint: number | undefined): number {
  const m = Math.min(0.999, Math.max(0.001, midpoint ?? 0.5));
  if (Math.abs(m - 0.5) < 1e-6) return u;
  return Math.pow(u, Math.log(0.5) / Math.log(m));
}

/**
 * 渲染用色标：中点非 0.5 的区间插入中间色阶。
 * CanvasGradient / SVG `<stop>` 都没有原生 midpoint，只能在共用层展开。
 */
export function expandGradStops(stops: readonly GradStop[], steps = 16): GradStop[] {
  const sorted = normalizeGradStops(stops, "#000000");
  const needsExpand = sorted.some((s, i) => i > 0 && Math.abs((s.midpoint ?? 0.5) - 0.5) > 1e-4);
  if (!needsExpand) return sorted;

  const out: GradStop[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    const mid = b.midpoint ?? 0.5;
    if (b.offset > a.offset && Math.abs(mid - 0.5) > 1e-4) {
      for (let k = 1; k < steps; k++) {
        const u = k / steps;
        const t = midpointCurve(u, mid);
        const mixed = mixStops(a, b, t);
        out.push({
          offset: a.offset + (b.offset - a.offset) * u,
          color: mixed.color,
          ...(Math.abs(mixed.alpha - 1) > 1e-6 ? { alpha: Math.round(mixed.alpha * 1000) / 1000 } : {}),
        });
      }
    }
    out.push({ ...b });
  }
  return out;
}

/** 取一个填充实际渲染用的色标；画布、面板预览、SVG 导出都用它。 */
export function renderGradStops(p: Paint): GradStop[] {
  return expandGradStops(paintStops(p));
}

/** 两个色标之间插入新色标：取最大空档，颜色/透明度按中点混合，非 hex 色退回左端色。 */
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
  const mixed = mixStops(left, right, 0.5);
  const inserted: GradStop = {
    offset,
    color: mixed.color,
    ...(Math.abs(mixed.alpha - 1) > 1e-6 ? { alpha: Math.round(mixed.alpha * 1000) / 1000 } : {}),
  };
  const next = [...sorted, inserted].sort((x, y) => x.offset - y.offset);
  return { stops: next, index: next.findIndex((s) => s.offset === offset && s.color === mixed.color) };
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

/** 径向渐变覆盖整个 bbox：圆心在中心，半径取半对角线。 */
export function radialGeom(box: Box): { cx: number; cy: number; r: number } {
  return {
    cx: box.x + box.w / 2,
    cy: box.y + box.h / 2,
    r: Math.max(0.5, Math.hypot(box.w, box.h) / 2),
  };
}

/** 画布上的渐变轴线：线性沿角度穿过中心，径向从圆心向右。 */
export function gradAxis(p: Paint, box: Box): { x1: number; y1: number; x2: number; y2: number } | null {
  if (p.kind === "linear" && p.grad) return gradLine(p.grad.angle, box);
  if (p.kind === "radial") {
    const { cx, cy, r } = radialGeom(box);
    return { x1: cx, y1: cy, x2: cx + r, y2: cy };
  }
  return null;
}

/** 渐变轴上每个色标的文档坐标，供画布手柄命中与绘制。 */
export function gradHandlePoints(p: Paint, box: Box): Array<{ x: number; y: number; offset: number }> {
  const axis = gradAxis(p, box);
  if (!axis) return [];
  return paintStops(p).map((s) => ({
    x: axis.x1 + (axis.x2 - axis.x1) * s.offset,
    y: axis.y1 + (axis.y2 - axis.y1) * s.offset,
    offset: s.offset,
  }));
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
    const stops = renderGradStops(p).map((s) => `${stopCssColor(s)} ${Math.round(s.offset * 1000) / 10}%`).join(", ");
    return `linear-gradient(${(p.grad?.angle ?? 90) + 90}deg, ${stops})`;
  }
  if (p.kind === "radial") {
    const stops = renderGradStops(p).map((s) => `${stopCssColor(s)} ${Math.round(s.offset * 1000) / 10}%`).join(", ");
    return `radial-gradient(circle at 50% 50%, ${stops})`;
  }
  return p.color;
}

/** 把任意填充转成线性渐变：已有 stops 直接复用，实色从本色渐变到白，无色用品牌蓝兜底。 */
export function toLinearGradient(p: Paint): Paint {
  const stops = p.grad && p.grad.stops.length >= 2 ? paintStops(p).map((s) => ({ ...s })) : null;
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
  const stops = renderGradStops(p);
  for (const s of stops) g.addColorStop(s.offset, stopCssColor(s));
  return g;
}
