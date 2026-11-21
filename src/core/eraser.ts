/** 橡皮工具：闭合填充路径走多边形布尔减法（保留孔与轮廓），开口/纯描边路径按笔刷范围切开成多段。 */
import { booleanSubpaths } from "./bool";
import { flatten, hitPath, nodeBox, type Box } from "./geom";
import { anchorAt, type Anchor, type PathNode, type Pt, type SubPath } from "./types";
import { freehandAnchors } from "./vectorOps";

const CIRCLE_STEPS = 24;

function circleSubpath(cx: number, cy: number, r: number): SubPath {
  const anchors: Anchor[] = [];
  for (let i = 0; i < CIRCLE_STEPS; i++) {
    const a = (i / CIRCLE_STEPS) * Math.PI * 2;
    anchors.push(anchorAt(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  return { anchors, closed: true };
}

function circleNode(id: string, cx: number, cy: number, r: number): PathNode {
  return {
    kind: "path",
    id,
    name: "橡皮笔刷",
    subpaths: [circleSubpath(cx, cy, r)],
    fill: { kind: "none", color: "#000000", opacity: 1 },
    stroke: { kind: "none", color: "#000000", opacity: 1, width: 0, dash: [] },
    opacity: 1,
    visible: true,
    locked: false,
  };
}

function boundsOfPoints(points: Pt[], r: number): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x: x0 - r, y: y0 - r, w: x1 - x0 + r * 2, h: y1 - y0 + r * 2 };
}

function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function insideBrush(p: Pt, points: Pt[], r: number): boolean {
  for (const q of points) {
    const dx = p.x - q.x;
    const dy = p.y - q.y;
    if (dx * dx + dy * dy <= r * r) return true;
  }
  return false;
}

/** 把曲线/直线都加密成不超过 3px 的折线，保证细笔刷也能切到直线段。 */
function densePoints(sub: SubPath): Pt[] {
  const base = flatten(sub, 18);
  if (base.length < 2) return base;
  const out: Pt[] = [base[0]];
  for (let i = 1; i < base.length; i++) {
    const a = base[i - 1];
    const b = base[i];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(d / 3));
    for (let k = 1; k <= n; k++) out.push({ x: a.x + (b.x - a.x) * (k / n), y: a.y + (b.y - a.y) * (k / n) });
  }
  return out;
}

/** 开口/纯描边路径：按采样点把落在笔刷内的部分挖掉，剩下的连续段各自成为一条开口子路径。 */
function splitSubpath(sub: SubPath, points: Pt[], r: number): SubPath[] | null {
  const raw = densePoints(sub);
  if (raw.length < 2) return null;
  let pts = raw.map((p) => ({ x: p.x, y: p.y }));
  if (sub.closed && pts.length > 2) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-6) pts.pop();
  }
  const inside = pts.map((p) => insideBrush(p, points, r));
  if (!inside.some(Boolean)) return null;
  if (inside.every(Boolean)) return [];

  // 闭合路径从第一个“笔刷外”的采样点开始，保证跨接缝的连续段不被拆开
  if (sub.closed) {
    const start = inside.findIndex((v) => !v);
    if (start < 0) return [];
    if (start > 0) {
      pts = [...pts.slice(start), ...pts.slice(0, start)];
      const flags = [...inside.slice(start), ...inside.slice(0, start)];
      inside.length = 0;
      inside.push(...flags);
    }
  }

  const runs: Pt[][] = [];
  let cur: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    if (inside[i]) {
      if (cur.length >= 2) runs.push(cur);
      cur = [];
    } else {
      cur.push(pts[i]);
    }
  }
  if (cur.length >= 2) runs.push(cur);

  // 闭合路径首尾都在笔刷外时，末段与首段在接缝处其实是同一段
  if (sub.closed && runs.length > 1 && !inside[0] && !inside[inside.length - 1]) {
    const tail = runs.pop()!;
    runs[0] = [...tail, ...runs[0]];
  }

  const out: SubPath[] = [];
  for (const run of runs) {
    if (run.length < 2) continue;
    const clean: Pt[] = [];
    for (const p of run) {
      const last = clean[clean.length - 1];
      if (last && Math.hypot(last.x - p.x, last.y - p.y) < 0.8) continue;
      clean.push(p);
    }
    if (clean.length < 2) continue;
    out.push({ anchors: freehandAnchors(clean, 1), closed: false });
  }
  return out;
}

/**
 * 擦除一个路径节点。
 * - 返回 null：笔刷没碰到，节点保持不变；
 * - 返回 []：整条路径被擦空，调用方删除节点；
 * - 返回 SubPath[]：替换节点子路径。
 */
export function erasePathNode(node: PathNode, points: Pt[], radius: number): SubPath[] | null {
  if (!points.length || radius <= 0) return null;
  const brush = boundsOfPoints(points, radius);
  if (!intersects(nodeBox(node), brush)) return null;

  const filledClosed = node.fill.kind !== "none" && node.subpaths.some((s) => s.closed);
  if (filledClosed) {
    if (!points.some((p) => hitPath(node, p, radius))) return null;
    const circles = points.map((p, i) => circleNode(`er${i}`, p.x, p.y, radius));
    const result = booleanSubpaths([node, ...circles], "subtract");
    if (!result.length) return [];
    return JSON.stringify(result) === JSON.stringify(node.subpaths) ? null : result;
  }

  const strokePad = node.stroke.kind !== "none" && node.stroke.width > 0 ? node.stroke.width / 2 : 0;
  const r = radius + strokePad;
  let changed = false;
  const out: SubPath[] = [];
  for (const sub of node.subpaths) {
    if (sub.anchors.length < 2) {
      out.push(sub);
      continue;
    }
    const parts = splitSubpath(sub, points, r);
    if (parts === null) {
      out.push(sub);
    } else {
      changed = true;
      out.push(...parts);
    }
  }
  if (!changed) return null;
  return out;
}
