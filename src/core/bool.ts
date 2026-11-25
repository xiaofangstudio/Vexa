/** 路径布尔运算（路径查找器）：先用容差把曲线拍平成多边形，做完布尔再简化为折线路径。
 *  曲线保真的 pathops 版本（更接近 Illustrator）留作后续；当前结果节点数量可控、可直接编辑。 */
import * as pcNs from "polygon-clipping";
import type { MultiPolygon, Pair, Polygon, Ring } from "polygon-clipping";
import { flatten, type Box } from "./geom";
import { anchorAt, noPaint, noStroke, type PathNode, type Paint, type Pt, type Stroke, type SubPath, type VexaDoc } from "./types";

/** CJS/ESM 双形态兼容：有些打包器把函数挂在 default 上，有些直接挂命名空间。 */
type Geom = Polygon | MultiPolygon;
type BoolFn = (geom: Geom, ...rest: Geom[]) => MultiPolygon;
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

/** 按文档叠放顺序排序：底层在前、顶层在后，路径查找器的“减去顶层/裁剪”依赖该顺序。 */
export function sortPathNodesByZ(doc: VexaDoc, nodes: PathNode[]): PathNode[] {
  const order = new Map<string, number>();
  let i = 0;
  const visit = (ids: string[]) => {
    for (const id of ids) {
      const n = doc.nodes[id];
      if (!n) continue;
      if (n.kind === "group") visit(n.children);
      else order.set(id, i++);
    }
  };
  visit(doc.root);
  return [...nodes].sort((a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER));
}

export type PathfinderOp = "divide" | "trim" | "merge" | "crop" | "outline";

export interface PathfinderPiece {
  subpaths: SubPath[];
  fill: Paint;
  stroke: Stroke;
  opacity: number;
  name: string;
  sourceId: string;
}

interface ShapedPath {
  node: PathNode;
  poly: Polygon;
}

function asMulti(g: Geom): MultiPolygon {
  const p = g[0] as unknown[] | undefined;
  return p && p[0] && typeof (p[0] as unknown[])[0] === "number" ? [g as Polygon] : (g as MultiPolygon);
}

function unionPolygons(polys: Geom[]): MultiPolygon {
  const [first, ...rest] = polys;
  if (!first) return [];
  return rest.length ? resolve("union")(first, ...rest) : asMulti(first);
}

function intersectPolygons(polys: Geom[]): MultiPolygon {
  const [first, ...rest] = polys;
  if (!first) return [];
  return rest.length ? resolve("intersection")(first, ...rest) : asMulti(first);
}

/** 多面体逐块减去若干多边形。 */
function differenceMulti(mp: MultiPolygon, others: Geom[]): MultiPolygon {
  if (!others.length) return mp;
  const out: MultiPolygon = [];
  for (const poly of mp) out.push(...resolve("difference")(poly, ...others));
  return out;
}

function multiArea(mp: MultiPolygon): number {
  let area = 0;
  for (const poly of mp) for (const ring of poly) area += Math.abs(signedArea(ring));
  return area;
}

function clonePaint(p: Paint): Paint {
  return JSON.parse(JSON.stringify(p)) as Paint;
}

function cloneStroke(s: Stroke): Stroke {
  return JSON.parse(JSON.stringify(s)) as Stroke;
}

function shapedPaths(nodes: PathNode[]): ShapedPath[] {
  const out: ShapedPath[] = [];
  for (const node of nodes) {
    const poly = polyOf(node);
    if (poly) out.push({ node, poly });
  }
  return out;
}

function pieceOf(node: PathNode, mp: MultiPolygon, fill: Paint, stroke: Stroke, opacity = node.opacity): PathfinderPiece | null {
  if (multiArea(mp) < 0.01) return null;
  const subpaths = subpathsOf(mp);
  if (!subpaths.length) return null;
  return { subpaths, fill, stroke, opacity, name: node.name, sourceId: node.id };
}

/** 分割：把叠加区域拆成互不重叠的面，每个面保留覆盖它的最上层外观。 */
function dividePieces(shaped: ShapedPath[]): PathfinderPiece[] {
  const n = shaped.length;
  if (n <= 8) {
    const out: PathfinderPiece[] = [];
    for (let mask = 1; mask < 1 << n; mask++) {
      const inside: Polygon[] = [];
      const outside: Polygon[] = [];
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) inside.push(shaped[i].poly);
        else outside.push(shaped[i].poly);
      }
      let mp = intersectPolygons(inside);
      mp = differenceMulti(mp, outside);
      const topIndex = 31 - Math.clz32(mask);
      const top = shaped[topIndex]!;
      const piece = pieceOf(top.node, mp, clonePaint(top.node.fill), noStroke());
      if (piece) out.push(piece);
    }
    return out;
  }
  // 超过 8 个形状不做 2^n 排列：按顶层到下层依次切出可见面。
  let remaining = unionPolygons(shaped.map((s) => s.poly));
  const out: PathfinderPiece[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const inside = intersectPolygons([...remaining, shaped[i].poly]);
    remaining = differenceMulti(remaining, [shaped[i].poly]);
    const piece = pieceOf(shaped[i].node, inside, clonePaint(shaped[i].node.fill), noStroke());
    if (piece) out.push(piece);
  }
  return out;
}

export function pathfinderPieces(nodes: PathNode[], op: PathfinderOp): PathfinderPiece[] {
  const shaped = shapedPaths(nodes);
  if (!shaped.length) return [];
  switch (op) {
    case "divide":
      return dividePieces(shaped);
    case "trim": {
      const out: PathfinderPiece[] = [];
      for (let i = 0; i < shaped.length; i++) {
        const above = shaped.slice(i + 1).map((x) => x.poly);
        const mp = differenceMulti([shaped[i].poly], above);
        const piece = pieceOf(shaped[i].node, mp, clonePaint(shaped[i].node.fill), noStroke());
        if (piece) out.push(piece);
      }
      return out;
    }
    case "merge": {
      const groups = new Map<string, { node: PathNode; polys: Polygon[] }>();
      for (const s of shaped) {
        const key = JSON.stringify([s.node.opacity, s.node.fill, s.node.stroke]);
        const g = groups.get(key);
        if (g) g.polys.push(s.poly);
        else groups.set(key, { node: s.node, polys: [s.poly] });
      }
      const out: PathfinderPiece[] = [];
      for (const g of groups.values()) {
        const piece = pieceOf(g.node, unionPolygons(g.polys), clonePaint(g.node.fill), cloneStroke(g.node.stroke));
        if (piece) out.push(piece);
      }
      return out;
    }
    case "crop": {
      if (shaped.length < 2) return [];
      const top = shaped[shaped.length - 1]!;
      const out: PathfinderPiece[] = [];
      for (const s of shaped.slice(0, -1)) {
        const mp = intersectPolygons([s.poly, top.poly]);
        const piece = pieceOf(s.node, mp, clonePaint(s.node.fill), noStroke());
        if (piece) out.push(piece);
      }
      return out;
    }
    case "outline": {
      const outline: Stroke = { kind: "solid", color: "#17171c", opacity: 1, width: 1, dash: [], cap: "butt", join: "miter" };
      return shaped.map((s) => ({
        subpaths: JSON.parse(JSON.stringify(s.node.subpaths)) as SubPath[],
        fill: noPaint(),
        stroke: outline,
        opacity: s.node.opacity,
        name: s.node.name,
        sourceId: s.node.id,
      }));
    }
    default:
      return [];
  }
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
