/** 路径效果：偏移路径、描边转轮廓、平滑。
 *
 * 先按曲线拍平成多边形，再做几何偏移。结果仍是可编辑路径（折线）。
 * 曲线保真的 offset/outline 留到后续，当前保证方向、闭合与孔洞正确。
 */
import { flatten } from "./geom";
import { anchorAt, noStroke, solid, type PathNode, type Pt, type Stroke, type SubPath } from "./types";

const EPS = 1e-6;

function signedArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function cleanRing(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1e-7) out.push({ x: p.x, y: p.y });
  }
  if (out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-7) out.pop();
  }
  return out;
}

/** 闭合环沿法线偏移；distance 为正即向环外扩。 */
function offsetRing(raw: Pt[], distance: number): Pt[] {
  const pts = cleanRing(raw);
  if (pts.length < 3) return pts;
  const ccw = signedArea(pts) > 0;
  const dir = ccw ? -1 : 1; // 左手法线朝内，逆时针环要反向才是外扩
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[(i - 1 + pts.length) % pts.length];
    const cur = pts[i];
    const next = pts[(i + 1) % pts.length];
    const n1 = norm(prev, cur);
    const n2 = norm(cur, next);
    const l1 = { x: -n1.y * dir, y: n1.x * dir };
    const l2 = { x: -n2.y * dir, y: n2.x * dir };
    let mx = l1.x + l2.x;
    let my = l1.y + l2.y;
    const ml = Math.hypot(mx, my);
    if (ml < EPS) {
      mx = l1.x;
      my = l1.y;
    } else {
      mx /= ml;
      my /= ml;
    }
    const denom = Math.max(0.25, mx * l1.x + my * l1.y);
    out.push({ x: cur.x + (mx * distance) / denom, y: cur.y + (my * distance) / denom });
  }
  return out;
}

function norm(a: Pt, b: Pt): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < EPS) return { x: 0, y: 0 };
  return { x: dx / len, y: dy / len };
}

function toSub(pts: Pt[], closed: boolean): SubPath {
  return { anchors: pts.map((p) => anchorAt(p.x, p.y)), closed };
}

function reverse(pts: Pt[]): Pt[] {
  return [...pts].reverse();
}

/** 偏移路径：闭口子路径按环外扩/内缩，开口路径沿一侧平移。 */
export function offsetPathNode(node: PathNode, distance: number, steps = 10): PathNode {
  const d = distance;
  const subpaths: SubPath[] = [];
  for (const sub of node.subpaths) {
    const pts = flatten(sub, steps);
    if (sub.closed) {
      const ring = offsetRing(pts, d);
      if (ring.length >= 3) subpaths.push(toSub(ring, true));
    } else {
      // 开口：按顶点平均法线向一侧偏移，保持开口
      const out: Pt[] = [];
      for (let i = 0; i < pts.length; i++) {
        const prev = pts[Math.max(0, i - 1)];
        const cur = pts[i];
        const next = pts[Math.min(pts.length - 1, i + 1)];
        const a = norm(prev, cur);
        const b = norm(cur, next);
        const mx = a.x + b.x;
        const my = a.y + b.y;
        const ml = Math.hypot(mx, my);
        const nx = ml < EPS ? -a.y : -my / ml;
        const ny = ml < EPS ? a.x : mx / ml;
        const denom = Math.max(0.25, Math.abs(nx * -a.y + ny * a.x));
        out.push({ x: cur.x + (nx * d) / denom, y: cur.y + (ny * d) / denom });
      }
      subpaths.push(toSub(out, false));
    }
  }
  return { ...node, subpaths, name: `${node.name} 偏移` };
}

/** 描边转轮廓：把描边宽度变成一条填充路径；开口路径加平头端帽。 */
export function outlineStrokeNode(node: PathNode, steps = 12): PathNode | null {
  if (node.stroke.kind === "none" || node.stroke.width <= 0) return null;
  const hw = node.stroke.width / 2;
  const subpaths: SubPath[] = [];
  for (const sub of node.subpaths) {
    const pts = cleanRing(flatten(sub, steps));
    if (pts.length < 2) continue;
    if (sub.closed) {
      if (pts.length < 3) continue;
      const outer = offsetRing(pts, hw);
      const inner = offsetRing(pts, -hw);
      if (outer.length >= 3) subpaths.push(toSub(outer, true));
      if (inner.length >= 3) subpaths.push(toSub(reverse(inner), true));
    } else {
      // 开口：左右两侧 + 两个平头端帽组成闭合轮廓
      const left: Pt[] = [];
      const right: Pt[] = [];
      for (let i = 0; i < pts.length; i++) {
        const prev = pts[Math.max(0, i - 1)];
        const cur = pts[i];
        const next = pts[Math.min(pts.length - 1, i + 1)];
        const a = norm(prev, cur);
        const b = norm(cur, next);
        let mx = a.x + b.x;
        let my = a.y + b.y;
        const ml = Math.hypot(mx, my);
        if (ml < EPS) {
          mx = a.x;
          my = a.y;
        } else {
          mx /= ml;
          my /= ml;
        }
        const nx = -my;
        const ny = mx;
        const denom = Math.max(0.25, Math.abs(nx * -a.y + ny * a.x));
        left.push({ x: cur.x + (nx * hw) / denom, y: cur.y + (ny * hw) / denom });
        right.push({ x: cur.x - (nx * hw) / denom, y: cur.y - (ny * hw) / denom });
      }
      const ring = [...left, ...reverse(right)];
      subpaths.push(toSub(ring, true));
    }
  }
  if (!subpaths.length) return null;
  const fill =
    node.stroke.kind === "solid"
      ? solid(node.stroke.color, node.stroke.opacity)
      : node.fill.kind === "none"
        ? solid("#17171c", 1)
        : node.fill;
  return {
    ...node,
    name: `${node.name} 轮廓`,
    subpaths,
    fill,
    stroke: noStroke(node.stroke.color) as Stroke,
    opacity: node.opacity,
  };
}

/** 平滑：每个锚点向相邻两点的中点靠拢，闭合环首尾也参与。 */
export function smoothPathNode(node: PathNode, amount = 0.35): PathNode {
  const k = Math.max(0, Math.min(1, amount));
  const subpaths = node.subpaths.map((sub) => {
    const n = sub.anchors.length;
    if (n < 3) return sub;
    const anchors = sub.anchors.map((a, i) => {
      const prev = sub.anchors[(i - 1 + n) % n];
      const next = sub.anchors[(i + 1) % n];
      if (!sub.closed && (i === 0 || i === n - 1)) return { ...a };
      const mx = (prev.x + next.x) / 2;
      const my = (prev.y + next.y) / 2;
      return { ...a, x: a.x + (mx - a.x) * k, y: a.y + (my - a.y) * k };
    });
    return { ...sub, anchors };
  });
  return { ...node, subpaths, name: `${node.name} 平滑` };
}
