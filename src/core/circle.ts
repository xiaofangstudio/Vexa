/** 圆形工具几何：直径两点、中心半径、三点外接圆、Shift 45° 约束与 Alt 直径取整。 */
import type { Pt } from "./types";

export interface Circle {
  cx: number;
  cy: number;
  r: number;
}

/** 从 from 指向 p 的方向吸附到 45° 步进，长度不变。 */
export function constrain45(from: Pt, p: Pt): Pt {
  const dx = p.x - from.x;
  const dy = p.y - from.y;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return { ...p };
  const len = Math.hypot(dx, dy);
  const step = Math.PI / 4;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: from.x + Math.cos(angle) * len, y: from.y + Math.sin(angle) * len };
}

export function circleFromCenter(center: Pt, through: Pt, snap45 = false): Circle {
  const end = snap45 ? constrain45(center, through) : through;
  const r = Math.hypot(end.x - center.x, end.y - center.y);
  return { cx: center.x, cy: center.y, r };
}

export function circleFromDiameter(a: Pt, b: Pt, snap45 = false): Circle {
  const end = snap45 ? constrain45(a, b) : b;
  return {
    cx: (a.x + end.x) / 2,
    cy: (a.y + end.y) / 2,
    r: Math.hypot(end.x - a.x, end.y - a.y) / 2,
  };
}

/** 当前缩放下标尺主刻度的间距：屏幕上大致保持 20–60px 一格。 */
export function rulerStep(zoom: number): number {
  const z = Math.max(0.01, zoom);
  if (z >= 8) return 1;
  if (z >= 4) return 2;
  if (z >= 2) return 5;
  if (z >= 1) return 10;
  if (z >= 0.5) return 20;
  if (z >= 0.25) return 50;
  return 100;
}

/** Alt：沿 first→p 的方向把直径取整到标尺刻度；圆心模式按 2×半径计算。 */
export function roundDiameter(from: Pt, p: Pt, fromCenter: boolean, zoom: number): Pt {
  const d = Math.hypot(p.x - from.x, p.y - from.y);
  const diameter = d * (fromCenter ? 2 : 1);
  const step = rulerStep(zoom);
  const rounded = Math.max(step, Math.round(diameter / step) * step);
  if (!(d > 0) || !Number.isFinite(rounded)) return { ...p };
  const k = rounded / diameter;
  return { x: from.x + (p.x - from.x) * k, y: from.y + (p.y - from.y) * k };
}

/** 圆形工具拖动：fromCenter 时第一点是圆心，否则两点是直径端点。 */
export function circleFromDrag(start: Pt, p: Pt, fromCenter: boolean, snap45 = false, roundAlt = false, zoom = 1): Circle {
  let end = snap45 ? constrain45(start, p) : p;
  if (roundAlt) end = roundDiameter(start, end, fromCenter, zoom);
  return fromCenter
    ? { cx: start.x, cy: start.y, r: Math.hypot(end.x - start.x, end.y - start.y) }
    : { cx: (start.x + end.x) / 2, cy: (start.y + end.y) / 2, r: Math.hypot(end.x - start.x, end.y - start.y) / 2 };
}

/** 三点外接圆；三点共线或重合时返回 null。 */
export function circleThroughThree(a: Pt, b: Pt, c: Pt): Circle | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const cx = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const cy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  return { cx, cy, r: Math.hypot(a.x - cx, a.y - cy) };
}
