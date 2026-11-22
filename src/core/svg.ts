/** SVG 导出与 SVG → Vexa 节点解析（描摹结果走这里）。 */
import { pathD, parseD, textBox } from "./geom";
import { gradLine, paintStops, radialGeom } from "./paint";
import { widthOutline } from "./width";
import {
  noPaint,
  noStroke,
  solid,
  type Artboard,
  type Node,
  type Paint,
  type PathNode,
  type Stroke,
  type VexaDoc,
} from "./types";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const round = (n: number) => Math.round(n * 1000) / 1000;

function loopsD(loops: Array<Array<{ x: number; y: number }>>): string {
  return loops
    .filter((loop) => loop.length > 1)
    .map((loop) => `M${round(loop[0].x)} ${round(loop[0].y)}` + loop.slice(1).map((p) => `L${round(p.x)} ${round(p.y)}`).join("") + "Z")
    .join(" ");
}

interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 组包围盒：递归子节点，供多画板导出时筛内容。 */
function groupBBox(node: Node, doc: VexaDoc): BBox {
  if (node.kind !== "group") return nodeBBox(node);
  let box: BBox | null = null;
  for (const id of node.children) {
    if (id === node.clip) continue;
    const child = doc.nodes[id];
    if (!child || !child.visible) continue;
    const b = groupBBox(child, doc);
    if (!b.w && !b.h) continue;
    if (!box) box = { ...b };
    else {
      const x = Math.min(box.x, b.x);
      const y = Math.min(box.y, b.y);
      const r = Math.max(box.x + box.w, b.x + b.w);
      const bt = Math.max(box.y + box.h, b.y + b.h);
      box = { x, y, w: r - x, h: bt - y };
    }
  }
  return box ?? { x: 0, y: 0, w: 0, h: 0 };
}

function hitsBoard(b: BBox, board: Artboard): boolean {
  if (!b.w && !b.h) return true;
  return b.x < board.x + board.w && b.x + b.w > board.x && b.y < board.y + board.h && b.y + b.h > board.y;
}
function nodeBBox(node: Node): BBox {
  if (node.kind === "path") {
    const pts = node.subpaths.flatMap((s) => s.anchors);
    if (!pts.length) return { x: 0, y: 0, w: 0, h: 0 };
    const minX = Math.min(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxX = Math.max(...pts.map((p) => p.x));
    const maxY = Math.max(...pts.map((p) => p.y));
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  if (node.kind === "text") return textBox(node);
  if (node.kind === "image") return { x: node.x, y: node.y, w: node.w, h: node.h };
  return { x: 0, y: 0, w: 0, h: 0 };
}

/** 填充属性；渐变顺手把 defs 塞进收集器。 */
function fillAttrs(fill: Paint, box: BBox, defs: string[], id: string): string {
  if (fill.kind === "none") return ` fill="none"`;
  const stops = paintStops(fill)
    .map((s) => `      <stop offset="${round(s.offset)}" stop-color="${s.color}"/>`)
    .join("\n");
  if (fill.kind === "radial") {
    const { cx, cy, r } = radialGeom(box);
    defs.push(
      `    <radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${round(cx)}" cy="${round(cy)}" r="${round(r)}">\n${stops}\n    </radialGradient>`,
    );
    return ` fill="url(#${id})" fill-opacity="${round(fill.opacity)}"`;
  }
  if (fill.kind === "linear" && fill.grad) {
    const { x1, y1, x2, y2 } = gradLine(fill.grad.angle, box);
    defs.push(
      `    <linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${round(x1)}" y1="${round(y1)}" x2="${round(x2)}" y2="${round(y2)}">\n${stops}\n    </linearGradient>`,
    );
    return ` fill="url(#${id})" fill-opacity="${round(fill.opacity)}"`;
  }
  return ` fill="${fill.color}" fill-opacity="${round(fill.opacity)}"`;
}

/** 箭头 marker：方向跟随末段切线，尺寸按线宽缩放。 */
function arrowMarker(stroke: Stroke, defs: string[], id: string): string {
  const kind = stroke.arrow && stroke.arrow !== "none" ? stroke.arrow : "";
  if (!kind) return "";
  const body =
    kind === "triangle"
      ? `<path d="M1 1 L9 5 L1 9 Z" fill="${stroke.color}"/>`
      : kind === "diamond"
        ? `<path d="M1 5 L5 1 L9 5 L5 9 Z" fill="${stroke.color}"/>`
        : `<path d="M1.5 1.5 L8.5 5 L1.5 8.5" fill="none" stroke="${stroke.color}" stroke-width="1.6"/>`;
  defs.push(
    `    <marker id="${id}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="2.2" markerHeight="2.2" orient="auto" markerUnits="strokeWidth">\n      ${body}\n    </marker>`,
  );
  return ` marker-end="url(#${id})"`;
}

function strokeAttrs(stroke: Stroke, defs: string[], id: string): string {
  if (stroke.kind === "none") return ` stroke="none"`;
  let s = ` stroke="${stroke.color}" stroke-opacity="${round(stroke.opacity)}" stroke-width="${round(stroke.width)}"`;
  s += ` stroke-linecap="${stroke.cap ?? "butt"}" stroke-linejoin="${stroke.join ?? "miter"}"`;
  if (stroke.dash.length) s += ` stroke-dasharray="${stroke.dash.map(round).join(" ")}"`;
  s += arrowMarker(stroke, defs, id);
  return s;
}

function nodeSVG(doc: VexaDoc, node: Node, indent: string, defs: string[], seq: { n: number }): string {
  if (!node.visible) return "";
  const op = node.opacity < 1 ? ` opacity="${round(node.opacity)}"` : "";
  const blend = node.blend && node.blend !== "normal" ? ` style="mix-blend-mode:${node.blend}"` : "";
  if (node.kind === "path") {
    const id = `g${seq.n++}`;
    const fill = fillAttrs(node.fill, nodeBBox(node), defs, id);
    const outline = widthOutline(node);
    if (outline && outline.length) {
      return `${indent}<g${op}${blend}>\n${indent}  <path d="${pathD(node)}"${fill} stroke="none"/>\n${indent}  <path d="${loopsD(outline)}" fill="${node.stroke.color}" fill-opacity="${round(node.stroke.opacity)}"/>\n${indent}</g>\n`;
    }
    const hasOpen = node.subpaths.some((s) => !s.closed && s.anchors.length > 1);
    const stroke = strokeAttrs(hasOpen ? node.stroke : { ...node.stroke, arrow: "none" }, defs, `a${id}`);
    return `${indent}<path d="${pathD(node)}"${fill}${stroke}${op}${blend}/>\n`;
  }
  if (node.kind === "text") {
    const lines = node.text.split("\n");
    const lh = node.size * (node.lineHeight ?? 1.25);
    const body = lines
      .map((l, i) => `${indent}  <tspan x="0" dy="${i === 0 ? 0 : round(lh)}">${esc(l)}</tspan>`)
      .join("\n");
    const id = `g${seq.n++}`;
    const fill = fillAttrs(node.fill, nodeBBox(node), defs, id);
    const hs = (node.hScale ?? 100) / 100;
    const vs = (node.vScale ?? 100) / 100;
    const scale = hs !== 1 || vs !== 1 ? ` scale(${round(hs)} ${round(vs)})` : "";
    const anchor = node.align === "center" ? "middle" : node.align === "right" ? "end" : "start";
    const tracking = node.tracking ? ` letter-spacing="${round(node.tracking)}"` : "";
    const weight = node.bold ? ` font-weight="700"` : "";
    const style = node.italic ? ` font-style="italic"` : "";
    return `${indent}<text transform="translate(${round(node.x)} ${round(node.y - (node.baseline ?? 0))})${scale}" font-family="${esc(node.font)}" font-size="${round(node.size)}"${weight}${style}${tracking} text-anchor="${anchor}"${fill}${op}${blend}>\n${body}\n${indent}</text>\n`;
  }
  if (node.kind === "image") {
    return `${indent}<image x="${round(node.x)}" y="${round(node.y)}" width="${round(node.w)}" height="${round(node.h)}" href="${esc(node.src)}"${op}${blend}/>\n`;
  }
  let clipAttr = "";
  const clipNode = node.clip ? doc.nodes[node.clip] : undefined;
  if (clipNode && clipNode.kind === "path") {
    const cid = `c${seq.n++}`;
    defs.push(`    <clipPath id="${cid}"><path d="${pathD(clipNode)}"/></clipPath>`);
    clipAttr = ` clip-path="url(#${cid})"`;
  }
  const kids = node.children
    .filter((id) => id !== node.clip)
    .map((id) => doc.nodes[id])
    .filter((n): n is Node => !!n)
    .map((n) => nodeSVG(doc, n, indent + "  ", defs, seq))
    .join("");
  return `${indent}<g${op}${blend}${clipAttr}>\n${kids}${indent}</g>\n`;
}

function boardSVG(doc: VexaDoc, board: Artboard, index: number, defs: string[], seq: { n: number }): string {
  const kids = doc.root
    .map((id) => doc.nodes[id])
    .filter((n): n is Node => !!n)
    .filter((n) => hitsBoard(groupBBox(n, doc), board))
    .map((n) => nodeSVG(doc, n, "      ", defs, seq))
    .join("");
  return [
    `    <g id="board-${index}" data-name="${esc(board.name)}">`,
    `      <rect x="${round(board.x)}" y="${round(board.y)}" width="${round(board.w)}" height="${round(board.h)}" fill="${board.bg}"/>`,
    kids.trimEnd(),
    `    </g>`,
  ].join("\n");
}

export function docToSVG(doc: VexaDoc, opts: { pretty?: boolean; boardId?: string } = {}): string {
  const boards = opts.boardId ? doc.artboards.filter((b) => b.id === opts.boardId) : doc.artboards;
  const list = boards.length ? boards : doc.artboards.slice(0, 1);
  const minX = Math.min(...list.map((b) => b.x));
  const minY = Math.min(...list.map((b) => b.y));
  const maxX = Math.max(...list.map((b) => b.x + b.w));
  const maxY = Math.max(...list.map((b) => b.y + b.h));
  const w = maxX - minX;
  const h = maxY - minY;
  const defs: string[] = [];
  const seq = { n: 0 };
  const body = list.map((b) => boardSVG(doc, b, doc.artboards.indexOf(b), defs, seq)).join("\n");
  const defsBlock = defs.length ? `  <defs>\n${defs.join("\n")}\n  </defs>\n` : "";
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"`,
    `     width="${round(w)}" height="${round(h)}" viewBox="${round(minX)} ${round(minY)} ${round(w)} ${round(h)}"`,
    `     version="1.1" data-generator="Vexa">`,
    opts.pretty === false ? defsBlock + body : `  <!-- ${esc(doc.name)} · 小方工作室 Vexa -->\n${defsBlock}${body}`,
    `</svg>`,
    ``,
  ].join("\n");
}

/* ---------------- 导入：SVG 路径 → 可编辑节点 ---------------- */

interface RawPath {
  d: string;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  opacity: number;
  matrix: Matrix;
}

interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function mul(m: Matrix, n: Matrix): Matrix {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}

/** SVG transform 列表：translate / scale / rotate / matrix，按书写顺序依次左乘。 */
export function parseTransform(s: string | null): Matrix {
  let m = { ...IDENTITY };
  if (!s) return m;
  const re = /(translate|scale|rotate|matrix)\s*\(([^)]*)\)/g;
  let hit: RegExpExecArray | null;
  while ((hit = re.exec(s))) {
    const nums = hit[2].split(/[,\s]+/).filter(Boolean).map(Number);
    if (nums.some((n) => !Number.isFinite(n))) continue;
    const kind = hit[1];
    let n: Matrix = { ...IDENTITY };
    if (kind === "translate") n = { ...IDENTITY, e: nums[0] ?? 0, f: nums[1] ?? 0 };
    else if (kind === "scale") n = { ...IDENTITY, a: nums[0] ?? 1, d: nums[1] ?? nums[0] ?? 1 };
    else if (kind === "matrix" && nums.length >= 6) n = { a: nums[0], b: nums[1], c: nums[2], d: nums[3], e: nums[4], f: nums[5] };
    else if (kind === "rotate") {
      const rad = ((nums[0] ?? 0) * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const rot = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
      if (nums.length >= 3) {
        const cx = nums[1];
        const cy = nums[2];
        n = mul(mul({ ...IDENTITY, e: cx, f: cy }, rot), { ...IDENTITY, e: -cx, f: -cy });
      } else n = rot;
    }
    m = mul(m, n);
  }
  return m;
}

function styleOf(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (el.getAttribute("style") ?? "").split(";")) {
    const i = part.indexOf(":");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

/** 基本图形 → path d；只做导入侧的近似，不追求 SVG 全规范。 */
function shapeD(el: Element, tag: string): string | null {
  const num = (k: string, dv = 0) => {
    const v = Number(el.getAttribute(k));
    return Number.isFinite(v) ? v : dv;
  };
  if (tag === "rect") {
    const x = num("x");
    const y = num("y");
    const w = num("width");
    const h = num("height");
    if (w <= 0 || h <= 0) return null;
    return `M${x} ${y} L${x + w} ${y} L${x + w} ${y + h} L${x} ${y + h} Z`;
  }
  if (tag === "circle" || tag === "ellipse") {
    const cx = num("cx");
    const cy = num("cy");
    const rx = tag === "circle" ? num("r") : num("rx");
    const ry = tag === "circle" ? num("r") : num("ry");
    if (rx <= 0 || ry <= 0) return null;
    const k = 0.5522847498;
    const ox = rx * k;
    const oy = ry * k;
    return `M${cx - rx} ${cy} C${cx - rx} ${cy - oy} ${cx - ox} ${cy - ry} ${cx} ${cy - ry} C${cx + ox} ${cy - ry} ${cx + rx} ${cy - oy} ${cx + rx} ${cy} C${cx + rx} ${cy + oy} ${cx + ox} ${cy + ry} ${cx} ${cy + ry} C${cx - ox} ${cy + ry} ${cx - rx} ${cy + oy} ${cx - rx} ${cy} Z`;
  }
  if (tag === "polygon" || tag === "polyline") {
    const pts = (el.getAttribute("points") ?? "").split(/[,\s]+/).filter(Boolean).map(Number);
    if (pts.length < 4) return null;
    let d = "";
    for (let i = 0; i < pts.length; i += 2) d += `${i === 0 ? "M" : " L"}${pts[i]} ${pts[i + 1]}`;
    return tag === "polygon" ? d + " Z" : d;
  }
  if (tag === "line") {
    return `M${num("x1")} ${num("y1")} L${num("x2")} ${num("y2")}`;
  }
  return null;
}

function collectPaths(
  root: Element,
  out: RawPath[],
  parent: Matrix = IDENTITY,
  inherit: { fill: string | null; stroke: string | null; strokeWidth: number; opacity: number } = {
    fill: null,
    stroke: null,
    strokeWidth: 1,
    opacity: 1,
  },
): void {
  for (const el of Array.from(root.children)) {
    const tag = el.tagName.toLowerCase();
    const style = styleOf(el);
    const m = mul(parent, parseTransform(el.getAttribute("transform")));
    const opRaw = Number(el.getAttribute("opacity") ?? "1");
    const opacity = inherit.opacity * (Number.isFinite(opRaw) ? opRaw : 1);
    const fill = style.fill ?? el.getAttribute("fill") ?? inherit.fill;
    const stroke = style.stroke ?? el.getAttribute("stroke") ?? inherit.stroke;
    const swRaw = style["stroke-width"] ?? el.getAttribute("stroke-width");
    const strokeWidth = swRaw ? Number(swRaw) || inherit.strokeWidth : inherit.strokeWidth;
    if (tag === "g" || tag === "svg") {
      collectPaths(el, out, m, { fill, stroke, strokeWidth, opacity });
      continue;
    }
    const d = tag === "path" ? el.getAttribute("d") ?? "" : shapeD(el, tag);
    if (!d) continue;
    const foRaw = Number(style["fill-opacity"] ?? el.getAttribute("fill-opacity") ?? "1");
    const fo = Number.isFinite(foRaw) ? foRaw : 1;
    out.push({
      d,
      fill,
      stroke,
      strokeWidth,
      opacity: opacity * fo,
      matrix: m,
    });
  }
}

/** 解析 SVG 文本，返回按文档叠放顺序排列的路径节点（颜色沿用描摹结果）。
 *  startSeq 由调用方给起点，避免在未提交的文档上偷偷加序号。 */
export function svgToPathNodes(svg: string, startSeq: number): { nodes: PathNode[]; nextSeq: number } {
  const parser = new DOMParser();
  const dom = parser.parseFromString(svg, "image/svg+xml");
  if (dom.querySelector("parsererror")) return { nodes: [], nextSeq: startSeq };
  const raw: RawPath[] = [];
  collectPaths(dom.documentElement, raw);

  let seq = startSeq;
  const nodes: PathNode[] = [];
  for (const r of raw) {
    const subs = parseD(r.d);
    if (!subs.length) continue;
    const m = r.matrix;
    const mapPt = (p: { x: number; y: number }) => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f });
    // 描摹输出按图层堆叠，后画的在上层；与 Vexa 的 root 顺序一致。
    const fill =
      r.fill && r.fill !== "none" && !r.fill.startsWith("url(") ? solid(r.fill, 1) : noPaint();
    const stroke =
      r.stroke && r.stroke !== "none" && !r.stroke.startsWith("url(")
        ? { kind: "solid" as const, color: r.stroke, opacity: 1, width: r.strokeWidth, dash: [] }
        : noStroke();
    nodes.push({
      kind: "path",
      id: `n${seq++}`,
      name: `描摹路径 ${nodes.length + 1}`,
      subpaths: subs.map((s) => ({
        ...s,
        anchors: s.anchors.map((a) => {
          const p = mapPt(a);
          return {
            ...a,
            x: p.x,
            y: p.y,
            hIn: a.hIn ? mapPt(a.hIn) : null,
            hOut: a.hOut ? mapPt(a.hOut) : null,
          };
        }),
      })),
      fill,
      stroke,
      opacity: Number.isFinite(r.opacity) ? Math.max(0, Math.min(1, r.opacity)) : 1,
      visible: true,
      locked: false,
    });
  }
  return { nodes, nextSeq: seq };
}
