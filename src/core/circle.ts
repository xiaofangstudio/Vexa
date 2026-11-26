/** 圆形工具几何：直径两点、中心半径、三点外接圆与 Shift 45° 约束。 */
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

/** 圆形工具拖动：fromCenter 时第一点是圆心，否则两点是直径端点。 */
export function circleFromDrag(start: Pt, p: Pt, fromCenter: boolean, snap45 = false): Circle {
  return fromCenter ? circleFromCenter(start, p, snap45) : circleFromDiameter(start, p, snap45);
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
