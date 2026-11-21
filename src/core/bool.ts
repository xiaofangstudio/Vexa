/** 路径布尔运算（路径查找器）：先用容差把曲线拍平成多边形，做完布尔再简化为折线路径。
 *  曲线保真的 pathops 版本（更接近 Illustrator）留作后续；当前结果节点数量可控、可直接编辑。 */
import * as pcNs from "polygon-clipping";
import type { MultiPolygon, Pair, Polygon, Ring } from "polygon-clipping";
import { flatten, type Box } from "./geom";
import { anchorAt, type PathNode, type Pt, type SubPath } from "./types";

/** CJS/ESM 双形态兼容：有些打包器把函数挂在 default 上，有些直接挂命名空间。 */
type BoolFn = (geom: Polygon, ...rest: Polygon[]) => MultiPolygon;
function resolve(name: "union" | "intersection" | "difference" | "xor"): BoolFn {
  const ns = pcNs as unknown as Record<string, unknown>;
  const def = ns.default as unknown as Record<string, unknown> | undefined;
  const fn = (typeof ns[name] === "function" ? ns[name] : def?.[name]) as BoolFn | undefined;
  if (typeof fn !== "function") throw new Error(`polygon-clipping 缺少 ${name}`);
  return fn;
}

export type BoolOp = "union" | "intersect" | "subtract" | "exclude";

/** 拍平一条子路径，去掉与首点重合的尾点（布尔库要求环不自闭合重复）。 */
function ringOf(sub: SubPath, steps = 16): Ring | null {
  const pts = flatten(sub, steps);
  if (pts.length < 3) return null;
  const ring: Ring = pts.map((p) => [p.x, p.y] as Pair);
  const a = ring[0];
  const b = ring[ring.length - 1];
  if (Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6) ring.pop();
  if (ring.length < 3) return null;
  return simplify(ring, 0.32);
}

function polyOf(node: PathNode): Polygon | null {
  const outer = node.subpaths[0] ? ringOf(node.subpaths[0]) : null;
  if (!outer) return null;
  const holes: Ring[] = [];
  for (let i = 1; i < node.subpaths.length; i++) {
    const s = node.subpaths[i];
    const r = s && s.closed ? ringOf(s) : null;
    if (r) holes.push(r);
  }
  return holes.length ? [outer, ...holes] : [outer];
}

/* ---------------- 简化（Douglas–Peucker） ---------------- */

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  if (len < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

function simplifyRing(points: Pt[], tol: number): Pt[] {
  if (points.length < 5) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let best = -1;
    let max = tol;
    for (let i = s + 1; i < e; i++) {
      const d = segDist(points[i], points[s], points[e]);
      if (d > max) {
        max = d;
        best = i;
      }
    }
    if (best > 0) {
      keep[best] = 1;
      stack.push([s, best], [best, e]);
    }
  }
  const out: Pt[] = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
  return out;
}

function simplify(ring: Ring, tol: number): Ring {
  const pts: Pt[] = ring.map((p) => ({ x: p[0], y: p[1] }));
  const s = simplifyRing(pts, tol);
  return s.map((p) => [p.x, p.y] as Pair);
}

function signedArea(ring: Ring): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return a / 2;
}

/* ---------------- 布尔 ---------------- */

function runOp(op: BoolOp, polys: Polygon[]): MultiPolygon {
  const [first, ...rest] = polys;
  if (!first) return [];
  if (!rest.length) return [first];
  switch (op) {
    case "union":
      return resolve("union")(first, ...rest);
    case "intersect":
      return resolve("intersection")(first, ...rest);
    case "subtract":
      return resolve("difference")(first, ...rest);
    case "exclude":
      return resolve("xor")(first, ...rest);
    default:
      return [first];
  }
}

/** 把多面体结果转成路径子路径（外环正向、洞反向，配 nonzero 填充）。 */
export function subpathsOf(mp: MultiPolygon, tol = 0.32): SubPath[] {
  const out: SubPath[] = [];
  for (const poly of mp) {
    poly.forEach((ring, idx) => {
      const area = signedArea(ring);
      let pts = ring;
      // 外环统一为正向；洞反向
      if ((idx === 0 && area < 0) || (idx > 0 && area > 0)) pts = [...ring].reverse();
      pts = simplify(pts, tol);
      if (pts.length < 3) return;
      out.push({ anchors: pts.map((p) => anchorAt(p[0], p[1])), closed: true });
    });
  }
  return out;
}

/** 对选中的路径做布尔，返回新路径的 subpaths（调用方负责删旧节点、加新节点）。 */
export function booleanSubpaths(nodes: PathNode[], op: BoolOp, tol = 0.32): SubPath[] {
  const polys: Polygon[] = [];
  for (const n of nodes) {
    const p = polyOf(n);
    if (p) polys.push(p);
  }
  if (polys.length < 2) return [];
  return subpathsOf(runOp(op, polys), tol);
}

/** 面积（用来判断结果是否为空）。 */
export function areaOf(subpaths: SubPath[]): number {
  let a = 0;
  for (const s of subpaths) {
    const pts = s.anchors;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      a += pts[j].x * pts[i].y - pts[i].x * pts[j].y;
    }
  }
  return Math.abs(a) / 2;
}

export function boundsOf(subpaths: SubPath[]): Box | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of subpaths) {
    for (const p of s.anchors) {
      if (p.x < x0) x0 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.x > x1) x1 = p.x;
      if (p.y > y1) y1 = p.y;
    }
  }
  if (!isFinite(x0)) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
