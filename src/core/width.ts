/** 可变宽度描边：宽度点求值、路径采样、描边外轮廓与手柄位置。 */
import { flatten } from "./geom";
import type { PathNode, Pt, SubPath, WidthPoint } from "./types";

const EPS = 1e-6;

export interface PathSample {
  si: number;
  t: number;
  point: Pt;
  tangent: Pt;
  distance: number;
}

export interface WidthHandle {
  index: number;
  t: number;
  center: Pt;
  normal: Pt;
  left: Pt;
  right: Pt;
}

/** 补齐 0 / 1 端点并按 t 排序；非法值静默收敛。 */
export function normalizeWidthPoints(points?: WidthPoint[]): WidthPoint[] {
  if (!points || points.length === 0) return [];
  const clean: WidthPoint[] = [];
  for (const p of points) {
    if (!p || !Number.isFinite(p.t) || !Number.isFinite(p.left) || !Number.isFinite(p.right)) continue;
    const t = Math.max(0, Math.min(1, p.t));
    clean.push({
      t,
      left: Math.max(0.01, Math.min(80, p.left)),
      right: Math.max(0.01, Math.min(80, p.right)),
    });
  }
  if (!clean.length) return [];
  clean.sort((a, b) => a.t - b.t);
  if (clean[0].t > EPS) clean.unshift({ t: 0, left: clean[0].left, right: clean[0].right });
  else clean[0].t = 0;
  const last = clean[clean.length - 1];
  if (last.t < 1 - EPS) clean.push({ t: 1, left: last.left, right: last.right });
  else last.t = 1;
  return clean;
}

/** 已排序、已补齐端点的宽度点在 t 处的左右倍数；余弦过渡让宽度峰圆润不生硬。 */
function widthAtSorted(p: WidthPoint[], t: number): [number, number] {
  const u = Math.max(0, Math.min(1, t));
  if (u <= p[0].t) return [p[0].left, p[0].right];
  for (let i = 1; i < p.length; i++) {
    const b = p[i];
    const a = p[i - 1];
    if (u <= b.t) {
      const span = b.t - a.t;
      if (span <= EPS) return [b.left, b.right];
      const raw = (u - a.t) / span;
      const k = (1 - Math.cos(Math.PI * raw)) / 2;
      return [a.left + (b.left - a.left) * k, a.right + (b.right - a.right) * k];
    }
  }
  const z = p[p.length - 1];
  return [z.left, z.right];
}

/** t 处的左右宽度倍数（余弦过渡；同 t 的两点形成台阶）。 */
export function widthAt(points: WidthPoint[] | undefined, t: number): [number, number] {
  const p = normalizeWidthPoints(points);
  if (!p.length) return [1, 1];
  return widthAtSorted(p, t);
}

/** 新建或更新宽度点；side=both 时两侧同时改。 */
export function setWidthPoint(
  points: WidthPoint[] | undefined,
  t: number,
  side: "left" | "right" | "both",
  factor: number,
): WidthPoint[] {
  const p = normalizeWidthPoints(points);
  if (!p.length) p.push({ t: 0, left: 1, right: 1 }, { t: 1, left: 1, right: 1 });
  const u = Math.max(0, Math.min(1, t));
  const f = Math.max(0.01, Math.min(80, factor));
  const near = p.findIndex((q) => Math.abs(q.t - u) <= 1e-4);
  const target = near >= 0 ? p[near] : { t: u, left: 1, right: 1 };
  if (side === "left" || side === "both") target.left = f;
  if (side === "right" || side === "both") target.right = f;
  if (near < 0) p.push(target);
  return normalizeWidthPoints(p);
}

/** 删除某个宽度点；0 / 1 端点保留。删到只剩全 1 的端点时视为无宽度点。 */
export function removeWidthPoint(points: WidthPoint[] | undefined, t: number): WidthPoint[] {
  const p = normalizeWidthPoints(points);
  const i = p.findIndex((q) => Math.abs(q.t - t) <= 1e-4);
  if (i >= 0 && p[i].t > EPS && p[i].t < 1 - EPS) p.splice(i, 1);
  const next = normalizeWidthPoints(p);
  if (next.every((q) => Math.abs(q.left - 1) < 1e-4 && Math.abs(q.right - 1) < 1e-4)) return [];
  return next;
}

function dedupe(points: Pt[], closed: boolean): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > EPS) out.push(p);
  }
  if (closed && out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.hypot(a.x - b.x, a.y - b.y) <= EPS) out.pop();
  }
  return out;
}

function lengthsOf(points: Pt[], closed: boolean): { cum: number[]; total: number } {
  const cum = [0];
  let total = 0;
  const count = closed ? points.length : Math.max(0, points.length - 1);
  for (let i = 0; i < count; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += Math.hypot(b.x - a.x, b.y - a.y);
    cum.push(total);
  }
  return { cum, total };
}

export interface SamplePoint {
  point: Pt;
  tangent: Pt;
}

/** 子路径上 t（按弧长比例）处的点与单位切线。 */
export function sampleAt(sub: SubPath, t: number): SamplePoint | null {
  const pts = dedupe(flatten(sub, 18), sub.closed);
  if (pts.length < 2) return null;
  const { cum, total } = lengthsOf(pts, sub.closed);
  if (total <= EPS) return null;
  const u = Math.max(0, Math.min(1, t));
  const target = u * total;
  const segs = sub.closed ? pts.length : pts.length - 1;
  let i = 0;
  while (i < segs - 1 && cum[i + 1] < target) i++;
  const a = pts[i];
  const b = pts[(i + 1) % pts.length];
  const len = cum[i + 1] - cum[i];
  const k = len <= EPS ? 0 : Math.max(0, Math.min(1, (target - cum[i]) / len));
  const point = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  return { point, tangent: { x: dx / l, y: dy / l } };
}

/** 最近的可调描边位置（只认可见、未锁定、有描边的路径）。 */
export function nearestOnNode(node: PathNode, p: Pt): PathSample | null {
  let best: PathSample | null = null;
  for (let si = 0; si < node.subpaths.length; si++) {
    const sub = node.subpaths[si];
    const pts = dedupe(flatten(sub, 18), sub.closed);
    if (pts.length < 2) continue;
    const { cum, total } = lengthsOf(pts, sub.closed);
    if (total <= EPS) continue;
    const segs = sub.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < segs; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l2 = dx * dx + dy * dy;
      let k = l2 <= EPS ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
      k = Math.max(0, Math.min(1, k));
      const q = { x: a.x + dx * k, y: a.y + dy * k };
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (best && d >= best.distance) continue;
      const len = Math.sqrt(l2) || 1;
      best = {
        si,
        t: (cum[i] + Math.sqrt(l2) * k) / total,
        point: q,
        tangent: { x: dx / len, y: dy / len },
        distance: d,
      };
    }
  }
  return best;
}

/** 当前宽度点的左右手柄位置（只在第一条子路径上显示）。 */
export function widthHandles(node: PathNode): WidthHandle[] {
  const points = normalizeWidthPoints(node.stroke.widthPoints);
  if (points.length < 2) return [];
  const sub = node.subpaths[0];
  if (!sub) return [];
  const base = Math.max(0.01, node.stroke.width);
  const out: WidthHandle[] = [];
  for (let i = 0; i < points.length; i++) {
    const wp = points[i];
    const at = sampleAt(sub, wp.t);
    if (!at) continue;
    const n = { x: at.tangent.y, y: -at.tangent.x };
    const c = at.point;
    out.push({
      index: i,
      t: wp.t,
      center: c,
      normal: n,
      left: { x: c.x + n.x * base * wp.left / 2, y: c.y + n.y * base * wp.left / 2 },
      right: { x: c.x - n.x * base * wp.right / 2, y: c.y - n.y * base * wp.right / 2 },
    });
  }
  return out;
}

/** 悬停处的宽度预览。 */
export function widthPreview(node: PathNode, t: number): WidthHandle | null {
  const points = normalizeWidthPoints(node.stroke.widthPoints);
  const sub = node.subpaths[0];
  if (!sub) return null;
  const at = sampleAt(sub, t);
  if (!at) return null;
  const [lw, rw] = points.length >= 2 ? widthAt(points, t) : [1, 1];
  const base = Math.max(0.01, node.stroke.width);
  const n = { x: at.tangent.y, y: -at.tangent.x };
  const c = at.point;
  return {
    index: -1,
    t,
    center: c,
    normal: n,
    left: { x: c.x + n.x * base * lw / 2, y: c.y + n.y * base * lw / 2 },
    right: { x: c.x - n.x * base * rw / 2, y: c.y - n.y * base * rw / 2 },
  };
}

function densify(points: Pt[], closed: boolean, step: number): Pt[] {
  if (points.length < 2) return points;
  const out: Pt[] = [];
  const segs = closed ? points.length : points.length - 1;
  for (let i = 0; i < segs; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (!out.length) out.push(a);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 1; k < n; k++) {
      const u = k / n;
      out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
    }
    if (!closed || i < segs - 1) out.push(b);
  }
  return dedupe(out, closed);
}

function tangentAt(points: Pt[], i: number, closed: boolean): Pt {
  const n = points.length;
  const prev = closed ? (i - 1 + n) % n : Math.max(0, i - 1);
  const next = closed ? (i + 1) % n : Math.min(n - 1, i + 1);
  const a = points[prev];
  const b = points[next];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
}

/**
 * 描边外轮廓。开放子路径输出一个闭合环；闭合子路径输出外环 + 反向内环，
 * 用非零规则填充即可得到空心描边。
 */
export function widthOutline(node: PathNode): Pt[][] | null {
  if (node.stroke.kind === "none" || node.stroke.width <= 0) return null;
  const points = normalizeWidthPoints(node.stroke.widthPoints);
  if (points.length < 2) return null;
  const base = node.stroke.width;
  const loops: Pt[][] = [];
  for (const sub of node.subpaths) {
    const dense = densify(dedupe(flatten(sub, 18), sub.closed), sub.closed, 4);
    if (dense.length < 2) continue;
    const { cum, total } = lengthsOf(dense, sub.closed);
    if (total <= EPS) continue;
    const left: Pt[] = [];
    const right: Pt[] = [];
    for (let i = 0; i < dense.length; i++) {
      const p = dense[i];
      const t = cum[i] / total;
      const [lw, rw] = widthAtSorted(points, t);
      const tan = tangentAt(dense, i, sub.closed);
      const n = { x: tan.y, y: -tan.x };
      left.push({ x: p.x + n.x * base * lw / 2, y: p.y + n.y * base * lw / 2 });
      right.push({ x: p.x - n.x * base * rw / 2, y: p.y - n.y * base * rw / 2 });
    }
    if (sub.closed) {
      loops.push(left, [...right].reverse());
    } else {
      loops.push([...left, ...right.reverse()]);
    }
  }
  return loops.length ? loops : null;
}
