/** SVG 导出与 SVG → Vexa 节点解析（描摹结果走这里）。 */
import { pathD, parseD, textBox, textLayout } from "./geom";
import { gradLine, normalizeGradStops, radialGeom, renderGradStops, stopAlpha } from "./paint";
import { widthOutline } from "./width";
import {
  noPaint,
  noStroke,
  solid,
  type Artboard,
  type GroupNode,
  type Node,
  type Paint,
  type PathNode,
  type Stroke,
  type SubPath,
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
  const stops = renderGradStops(fill)
    .map((s) => {
      const opacity = stopAlpha(s);
      const op = opacity < 0.999 ? ` stop-opacity="${round(opacity)}"` : "";
      return `      <stop offset="${round(s.offset)}" stop-color="${s.color}"${op}/>`;
    })
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
    const lay = textLayout(node);
    const fill = fillAttrs(node.fill, nodeBBox(node), defs, `g${seq.n++}`);
    const hs = (node.hScale ?? 100) / 100 || 1;
    const vs = (node.vScale ?? 100) / 100 || 1;
    const tracking = node.tracking ? ` letter-spacing="${round(node.tracking)}"` : "";
    const weight = node.bold ? ` font-weight="700"` : "";
    const style = node.italic ? ` font-style="italic"` : "";
    if (lay.mode === "path") {
      const chars = (lay.path?.chars ?? []).filter((c) => c.ch.trim());
      const body = chars
        .map((c) => {
          const deg = round((c.angle * 180) / Math.PI);
          return `${indent}  <text transform="translate(${round(c.x)} ${round(c.y)}) rotate(${deg}) scale(${round(hs)} ${round(vs)})" xml:space="preserve">${esc(c.ch)}</text>`;
        })
        .join("\n");
      return `${indent}<g${fill}${op}${blend} font-family="${esc(node.font)}" font-size="${round(node.size)}"${weight}${style} text-anchor="start">\n${body}\n${indent}</g>\n`;
    }
    if (lay.mode === "area") {
      const clipId = `tc${seq.n++}`;
      defs.push(
        `<clipPath id="${clipId}"><rect x="${round(lay.box.x)}" y="${round(lay.box.y)}" width="${round(lay.box.w)}" height="${round(lay.box.h)}"/></clipPath>`,
      );
      const body = lay.lines
        .map((l) => `${indent}  <tspan x="${round(l.x / hs)}" y="${round(l.baseline / vs)}">${esc(l.text)}</tspan>`)
        .join("\n");
      return `${indent}<g clip-path="url(#${clipId})">\n${indent}<text transform="scale(${round(hs)} ${round(vs)})" font-family="${esc(node.font)}" font-size="${round(node.size)}"${weight}${style}${tracking} text-anchor="start"${fill}${op}${blend}>\n${body}\n${indent}</text>\n${indent}</g>\n`;
    }
    const body = lay.lines
      .map((l, i) => `${indent}  <tspan x="0" dy="${i === 0 ? 0 : round(node.size * (node.lineHeight ?? 1.25))}">${esc(l.text)}</tspan>`)
      .join("\n");
    const scale = hs !== 1 || vs !== 1 ? ` scale(${round(hs)} ${round(vs)})` : "";
    const anchor = node.align === "center" ? "middle" : node.align === "right" ? "end" : "start";
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
  kind: "path";
  /** 该元素从根到自身继承的 clipPath；按由外到内排列，供导入时建组。 */
  clips?: ClipSpec[];
  d: string;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  fillOpacity: number;
  strokeOpacity: number;
  opacity: number;
  matrix: Matrix;
  gradientFill?: Paint | null;
}

interface RawText {
  kind: "text";
  clips?: ClipSpec[];
  text: string;
  x: number;
  y: number;
  size: number;
  font: string;
  bold: boolean;
  italic: boolean;
  align: "left" | "center" | "right";
  tracking: number;
  hScale: number;
  vScale: number;
  fill: Paint;
  opacity: number;
}

type RawItem = RawPath | RawText;

interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** 一次 clipPath 引用对应的已变换几何；同一引用下的兄弟元素共享。 */
interface ClipSpec {
  key: number;
  subpaths: SubPath[];
}

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

const NAMED_COLOR: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  yellow: "#ffff00",
  gray: "#808080",
  grey: "#808080",
  silver: "#c0c0c0",
  maroon: "#800000",
  navy: "#000080",
  teal: "#008080",
  orange: "#ffa500",
  purple: "#800080",
};

let colorProbe: CanvasRenderingContext2D | null | undefined;
const colorProbeCache = new Map<string, { color: string; alpha: number } | null>();

/** 浏览器端用 2D 上下文把任意 CSS 颜色（命名色 / hsl / 现代 rgb）归一化；Node 下走本地表。 */
function probeCssColor(raw: string): { color: string; alpha: number } | null {
  if (typeof document === "undefined") return null;
  if (colorProbeCache.has(raw)) return colorProbeCache.get(raw) ?? null;
  if (colorProbe === undefined) {
    try {
      colorProbe = document.createElement("canvas").getContext("2d");
    } catch {
      colorProbe = null;
    }
  }
  if (!colorProbe) return null;
  colorProbe.fillStyle = "#010203";
  colorProbe.fillStyle = raw;
  const v = String(colorProbe.fillStyle);
  if (v === "#010203") {
    colorProbeCache.set(raw, null);
    return null;
  }
  const m = v.match(/^rgba?\(([^)]+)\)$/i);
  let out: { color: string; alpha: number } | null = null;
  if (m) {
    const parts = m[1].split(/[,\s/]+/).filter(Boolean);
    const rgb = parts.slice(0, 3).map((s) => Number.parseFloat(s));
    if (rgb.every(Number.isFinite)) {
      out = {
        color: `#${rgb.map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join("")}`,
        alpha: Number.parseFloat(parts[3] ?? "1") || 1,
      };
    }
  } else if (v.startsWith("#")) {
    out = svgColor(v, "#000000");
  }
  colorProbeCache.set(raw, out);
  return out;
}

function pct(v: string | null, dv: number): number {
  if (!v) return dv;
  const t = v.trim();
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n)) return dv;
  return t.endsWith("%") ? n / 100 : n;
}

function svgColor(raw: string | null, fallback = "#000000"): { color: string; alpha: number } {
  let s = (raw ?? "").trim().toLowerCase();
  if (s === "transparent") return { color: "#000000", alpha: 0 };
  if (s === "currentcolor" || !s) return { color: fallback, alpha: 1 };
  if (NAMED_COLOR[s]) s = NAMED_COLOR[s];
  if (s.startsWith("#")) {
    let hex = s.slice(1);
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    if (hex.length === 4) {
      const a = hex[3] + hex[3];
      hex = hex.slice(0, 3).split("").map((c) => c + c).join("");
      return { color: `#${hex}`, alpha: Number.parseInt(a, 16) / 255 };
    }
    if (hex.length === 8) return { color: `#${hex.slice(0, 6)}`, alpha: Number.parseInt(hex.slice(6, 8), 16) / 255 };
    if (hex.length === 6) return { color: `#${hex}`, alpha: 1 };
  }
  const m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const parts = m[1].split(/[,\s/]+/).filter(Boolean);
    const channel = (v: string | undefined) => {
      if (!v) return 0;
      const n = Number.parseFloat(v);
      return v.trim().endsWith("%") ? n * 2.55 : n;
    };
    const r = channel(parts[0]);
    const g = channel(parts[1]);
    const b = channel(parts[2]);
    const a = parts[3]?.trim().endsWith("%") ? Number.parseFloat(parts[3]) / 100 : Number.parseFloat(parts[3] ?? "1");
    if ([r, g, b].every(Number.isFinite)) {
      const hex = [r, g, b]
        .map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0"))
        .join("");
      return { color: `#${hex}`, alpha: Number.isFinite(a) ? Math.max(0, Math.min(1, a)) : 1 };
    }
  }
  const probed = probeCssColor(s);
  if (probed) return probed;
  return { color: fallback, alpha: 1 };
}


function byId(root: Element, id: string): Element | null {
  if (root.getAttribute("id") === id) return root;
  const all = Array.from(root.getElementsByTagName("*"));
  return all.find((el) => el.getAttribute("id") === id) ?? null;
}

function gradientId(ref: string | null): string | null {
  const m = (ref ?? "").match(/^url\(\s*['"]?#([^)'"]+)['"]?\s*\)/i);
  return m ? m[1] : null;
}

/** clip-path 的 url(#id) 或裸 #id 引用。 */
function clipRefId(ref: string | null): string | null {
  const t = (ref ?? "").trim();
  const m = t.match(/^url\(\s*['"]?#([^)'"]+)['"]?\s*\)/i);
  if (m) return m[1];
  return /^#[^)\s]+$/.test(t) ? t.slice(1) : null;
}

function mapSubpaths(subs: SubPath[], m: Matrix): SubPath[] {
  return subs.map((s) => ({
    ...s,
    anchors: s.anchors.map((a) => {
      const p = { x: m.a * a.x + m.c * a.y + m.e, y: m.b * a.x + m.d * a.y + m.f };
      const hin = a.hIn
        ? { x: m.a * a.hIn.x + m.c * a.hIn.y + m.e, y: m.b * a.hIn.x + m.d * a.hIn.y + m.f }
        : null;
      const hout = a.hOut
        ? { x: m.a * a.hOut.x + m.c * a.hOut.y + m.e, y: m.b * a.hOut.x + m.d * a.hOut.y + m.f }
        : null;
      return { ...a, x: p.x, y: p.y, hIn: hin, hOut: hout };
    }),
  }));
}

/** 把 clipPath 内的 path/rect/circle/ellipse/polygon 及 use 引用拍平成组剪切轮廓。 */
function clipSubpaths(root: Element, parent: Matrix, document: Document, stack: string[]): SubPath[] {
  const out: SubPath[] = [];
  const walk = (el: Element, parentMatrix: Matrix, depth: number): void => {
    if (depth > 10) return;
    const tag = (el.localName || el.tagName).toLowerCase();
    if (tag === "defs" || tag === "mask" || tag === "pattern" || tag === "marker") return;
    const m = mul(parentMatrix, parseTransform(el.getAttribute("transform")));
    if (tag === "g" || tag === "svg" || tag === "symbol" || tag === "a" || tag === "clippath") {
      for (const child of Array.from(el.children)) walk(child, m, depth + 1);
      return;
    }
    if (tag === "use") {
      const href = el.getAttribute("href") ?? el.getAttribute("xlink:href") ?? "";
      if (!href.startsWith("#")) return;
      const id = href.slice(1);
      if (!id || stack.includes(id)) return;
      const target = byId(document.documentElement, id);
      if (!target) return;
      const tx = Number(el.getAttribute("x")) || 0;
      const ty = Number(el.getAttribute("y")) || 0;
      walk(target, mul(m, { ...IDENTITY, e: tx, f: ty }), depth + 1);
      return;
    }
    const d = tag === "path" ? el.getAttribute("d") ?? "" : shapeD(el, tag);
    if (!d) return;
    const subs = parseD(d);
    if (subs.length) out.push(...mapSubpaths(subs, m));
  };
  walk(root, parent, 0);
  return out;
}

function clipSpec(ref: string | null, m: Matrix, document: Document, key: number): ClipSpec | null {
  const id = clipRefId(ref);
  if (!id) return null;
  const cp = byId(document.documentElement, id);
  if (!cp || (cp.localName || cp.tagName).toLowerCase() !== "clippath") return null;
  // objectBoundingBox 依赖引用元素的局部包围盒；暂不支持，避免错误套用全局坐标。
  if ((cp.getAttribute("clipPathUnits") ?? "userSpaceOnUse").toLowerCase() === "objectboundingbox") return null;
  let subpaths: SubPath[] = [];
  try {
    subpaths = clipSubpaths(cp, m, document, [id]);
  } catch {
    return null;
  }
  return subpaths.length ? { key, subpaths } : null;
}

function parseViewBox(raw: string | null): { x: number; y: number; w: number; h: number } | null {
  const n = (raw ?? "").split(/[,\s]+/).filter(Boolean).map(Number);
  if (n.length < 4 || n.some((v) => !Number.isFinite(v)) || n[2] <= 0 || n[3] <= 0) return null;
  return { x: n[0], y: n[1], w: n[2], h: n[3] };
}

/** use 引用 symbol/svg 时，把 viewBox 映射到 use 的 width/height 视口；普通组只做 x/y 位移。 */
function usePlacement(el: Element, target: Element, parent: Matrix): Matrix {
  const tx = Number(el.getAttribute("x")) || 0;
  const ty = Number(el.getAttribute("y")) || 0;
  let m = mul(parent, { ...IDENTITY, e: tx, f: ty });
  const tag = (target.localName || target.tagName).toLowerCase();
  if (tag !== "symbol" && tag !== "svg") return m;
  const vb = parseViewBox(target.getAttribute("viewBox"));
  if (!vb) return m;
  const wRaw = el.getAttribute("width") ?? target.getAttribute("width");
  const hRaw = el.getAttribute("height") ?? target.getAttribute("height");
  const w = svgLength(wRaw, vb.w);
  const h = svgLength(hRaw, vb.h);
  if (!(w > 0) || !(h > 0)) return m;
  const par = (target.getAttribute("preserveAspectRatio") ?? el.getAttribute("preserveAspectRatio") ?? "").toLowerCase();
  const none = /^none\b/.test(par);
  const sx = w / vb.w;
  const sy = h / vb.h;
  const s = none ? 1 : Math.min(sx, sy);
  const ax = none ? sx : s;
  const ay = none ? sy : s;
  const ox = (w - vb.w * ax) / 2;
  const oy = (h - vb.h * ay) / 2;
  m = mul(m, { ...IDENTITY, e: ox, f: oy });
  m = mul(m, { ...IDENTITY, a: ax, d: ay });
  m = mul(m, { ...IDENTITY, e: -vb.x, f: -vb.y });
  return m;
}


/** 渐变引用 → Vexa Paint。SVG 的坐标/变换只用于推角度；Vexa 仍按 bbox 铺开，半径与圆心固定。 */
function gradientPaint(ref: string | null, doc: Document, matrix: Matrix): Paint | null {
  const id = gradientId(ref);
  if (!id) return null;
  let g = byId(doc.documentElement, id);
  if (!g) return null;
  let stops: Array<{ offset: number; color: string; alpha?: number }> = [];
  for (let depth = 0; depth < 4 && g; depth++) {
    const tag = (g.localName || g.tagName).toLowerCase();
    if (tag !== "lineargradient" && tag !== "radialgradient") return null;
    const raw: Array<{ offset: number; color: string; alpha: number }> = [];
    for (const stop of Array.from(g.getElementsByTagName("*"))) {
      if ((stop.localName || stop.tagName).toLowerCase() !== "stop") continue;
      const st = styleOf(stop);
      const c = svgColor(st["stop-color"] ?? stop.getAttribute("stop-color"), "#000000");
      const o = pct(st["stop-opacity"] ?? stop.getAttribute("stop-opacity"), 1);
      raw.push({
        offset: pct(stop.getAttribute("offset"), 0),
        color: c.color,
        alpha: c.alpha * Math.max(0, Math.min(1, o)),
      });
    }
    if (raw.length >= 1) {
      stops = raw
        .map((s) => ({
          offset: Math.min(1, Math.max(0, s.offset)),
          color: s.color,
          ...(s.alpha < 0.999 ? { alpha: s.alpha } : {}),
        }))
        .sort((a, b) => a.offset - b.offset);
      break;
    }
    const href: string | null = g.getAttribute("href") ?? g.getAttribute("xlink:href");
    const next: Element | null = href && href.startsWith("#") ? byId(doc.documentElement, href.slice(1)) : null;
    if (!next || next === g) break;
    g = next;
  }
  if (!stops.length) return null;
  if (stops.length === 1) return solid(stops[0].color, stops[0].alpha ?? 1);
  if (!g) return null;
  const tag = (g.localName || g.tagName).toLowerCase();
  if (tag === "radialgradient") {
    return {
      kind: "radial",
      color: stops[0].color,
      opacity: 1,
      grad: { angle: 90, stops: normalizeGradStops(stops, stops[0].color) },
    };
  }
  let x1 = pct(g.getAttribute("x1"), 0);
  let y1 = pct(g.getAttribute("y1"), 0);
  let x2 = pct(g.getAttribute("x2"), 1);
  let y2 = pct(g.getAttribute("y2"), 0);
  if ((g.getAttribute("gradientUnits") ?? "objectBoundingBox").toLowerCase() === "userspaceonuse") {
    const n = (k: string, dv: number) => {
      const v = Number.parseFloat(g?.getAttribute(k) ?? "");
      return Number.isFinite(v) ? v : dv;
    };
    x1 = n("x1", 0);
    y1 = n("y1", 0);
    x2 = n("x2", 1);
    y2 = n("y2", 0);
  }
  const dx = matrix.a * (x2 - x1) + matrix.c * (y2 - y1);
  const dy = matrix.b * (x2 - x1) + matrix.d * (y2 - y1);
  const angle = Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9 ? 0 : (Math.atan2(dy, dx) * 180) / Math.PI;
  return {
    kind: "linear",
    color: stops[0].color,
    opacity: 1,
    grad: { angle: Math.round(angle * 10) / 10, stops: normalizeGradStops(stops, stops[0].color) },
  };
}


function shapeD(el: Element, tag: string): string | null {  const num = (k: string, dv = 0) => {
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

interface InheritedStyle {
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  fillOpacity: number;
  strokeOpacity: number;
  opacity: number;
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  align: "left" | "center" | "right";
  tracking: number;
  baseline: string;
}

const DEFAULT_STYLE: InheritedStyle = {
  fill: null,
  stroke: null,
  strokeWidth: 1,
  fillOpacity: 1,
  strokeOpacity: 1,
  opacity: 1,
  fontSize: 16,
  fontFamily: "Microsoft YaHei",
  bold: false,
  italic: false,
  align: "left",
  tracking: 0,
  baseline: "alphabetic",
};

/** CSS 长度 → SVG 用户单位；不支持的值回退。 */
function svgLength(raw: string | null, fallback: number): number {
  if (!raw) return fallback;
  const t = raw.trim().toLowerCase();
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n)) return fallback;
  const unit = t.replace(/^[+-]?[\d.]+/, "").trim();
  if (!unit || unit === "px") return n;
  if (unit === "pt") return (n * 4) / 3;
  if (unit === "pc") return n * 16;
  if (unit === "mm") return (n * 96) / 25.4;
  if (unit === "cm") return (n * 96) / 2.54;
  if (unit === "in") return n * 96;
  if (unit === "%") return (n / 100) * fallback;
  if (unit === "em") return n * fallback;
  if (unit === "ex") return n * fallback * 0.5;
  return fallback;
}

function mapFamily(raw: string | null, fallback: string): string {
  const first = (raw ?? "").split(",")[0].replace(/['"]/g, "").trim();
  if (!first) return fallback;
  const generic = first.toLowerCase();
  if (generic === "sans-serif" || generic === "system-ui" || generic === "ui-sans-serif") return "Microsoft YaHei";
  if (generic === "serif") return "Georgia";
  if (generic === "monospace") return "Consolas";
  return first;
}

function isBold(raw: string | null, fallback: boolean): boolean {
  if (!raw) return fallback;
  const t = raw.trim().toLowerCase();
  if (t === "bold" || t === "bolder") return true;
  if (t === "normal" || t === "lighter") return false;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n >= 600 : fallback;
}

function textAlign(raw: string | null, fallback: InheritedStyle["align"]): InheritedStyle["align"] {
  if (raw === "middle" || raw === "center") return "center";
  if (raw === "end" || raw === "right") return "right";
  if (raw === "start" || raw === "left") return "left";
  return fallback;
}

function directText(el: Element): string {
  const parts: string[] = [];
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === 3) parts.push(child.nodeValue ?? "");
  }
  return parts.join("").replace(/\s+/g, " ").trim();
}

/** 收集路径与文字；`use` 按引用递归展开，保持文档叠放顺序。 */
function collectItems(root: Element): RawItem[] {
  const document = root.ownerDocument;
  const out: RawItem[] = [];
  let clipKey = 0;

  const visit = (
    el: Element,
    parent: Matrix,
    inherited: InheritedStyle,
    depth: number,
    useStack: string[],
    clips: ClipSpec[],
  ): void => {
    if (depth > 12) return;
    const tag = (el.localName || el.tagName).toLowerCase();
    if (tag === "defs" || tag === "clippath" || tag === "mask" || tag === "pattern" || tag === "marker") return;
    const rawStyle = styleOf(el);
    const m = mul(parent, parseTransform(el.getAttribute("transform")));
    const ownOpacity = pct(rawStyle.opacity ?? el.getAttribute("opacity"), 1);
    const opacity = inherited.opacity * (Number.isFinite(ownOpacity) ? Math.max(0, Math.min(1, ownOpacity)) : 1);
    const fill = rawStyle.fill ?? el.getAttribute("fill") ?? inherited.fill;
    const stroke = rawStyle.stroke ?? el.getAttribute("stroke") ?? inherited.stroke;
    const swRaw = rawStyle["stroke-width"] ?? el.getAttribute("stroke-width");
    const strokeWidth = swRaw ? svgLength(swRaw, inherited.strokeWidth) : inherited.strokeWidth;
    const fillOpacity = pct(rawStyle["fill-opacity"] ?? el.getAttribute("fill-opacity"), inherited.fillOpacity);
    const strokeOpacity = pct(rawStyle["stroke-opacity"] ?? el.getAttribute("stroke-opacity"), inherited.strokeOpacity);
    const fontSize = svgLength(rawStyle["font-size"] ?? el.getAttribute("font-size"), inherited.fontSize);
    const fontFamily = mapFamily(rawStyle["font-family"] ?? el.getAttribute("font-family"), inherited.fontFamily);
    const bold = isBold(rawStyle["font-weight"] ?? el.getAttribute("font-weight"), inherited.bold);
    const italic = /italic|oblique/i.test(rawStyle["font-style"] ?? el.getAttribute("font-style") ?? "")
      ? true
      : /normal/i.test(rawStyle["font-style"] ?? el.getAttribute("font-style") ?? "")
        ? false
        : inherited.italic;
    const align = textAlign(rawStyle["text-anchor"] ?? el.getAttribute("text-anchor"), inherited.align);
    const tracking = svgLength(rawStyle["letter-spacing"] ?? el.getAttribute("letter-spacing"), inherited.tracking);
    const baseline = rawStyle["dominant-baseline"] ?? el.getAttribute("dominant-baseline") ?? inherited.baseline;
    const own: InheritedStyle = {
      fill,
      stroke,
      strokeWidth,
      fillOpacity,
      strokeOpacity,
      opacity,
      fontSize,
      fontFamily,
      bold,
      italic,
      align,
      tracking,
      baseline,
    };
    const ownClip = clipSpec(
      rawStyle["clip-path"] ?? el.getAttribute("clip-path"),
      m,
      document,
      clipKey + 1,
    );
    if (ownClip) clipKey = ownClip.key;
    const clipped = ownClip ? [...clips, ownClip] : clips;

    if (tag === "g" || tag === "svg" || tag === "symbol" || tag === "a") {
      for (const child of Array.from(el.children)) visit(child, m, own, depth + 1, useStack, clipped);
      return;
    }

    if (tag === "use") {
      const href = el.getAttribute("href") ?? el.getAttribute("xlink:href") ?? "";
      if (!href.startsWith("#")) return;
      const id = href.slice(1);
      if (!id || useStack.includes(id)) return;
      const target = byId(document.documentElement, id);
      if (!target) return;
      const um = usePlacement(el, target, m);
      visit(target, um, own, depth + 1, [...useStack, id], clipped);
      return;
    }

    if (tag === "text") {
      const tspans = Array.from(el.children).filter((c) => (c.localName || c.tagName).toLowerCase() === "tspan");
      const addText = (
        nodeEl: Element,
        rawX: number,
        rawY: number,
        matrix: Matrix,
        base: InheritedStyle,
      ): void => {
        const ts = styleOf(nodeEl);
        const tx = ts.x ?? nodeEl.getAttribute("x");
        const ty = ts.y ?? nodeEl.getAttribute("y");
        const x = tx ? svgLength(tx, rawX) : rawX;
        let y = ty ? svgLength(ty, rawY) : rawY;
        const text = (tspans.length ? nodeEl.textContent ?? "" : directText(nodeEl)).replace(/\s+/g, " ").trim();
        if (!text) return;
        const tFill = ts.fill ?? nodeEl.getAttribute("fill") ?? base.fill ?? "#000000";
        const tFillOpacity = pct(ts["fill-opacity"] ?? nodeEl.getAttribute("fill-opacity"), base.fillOpacity);
        const tOpacity = base.opacity * pct(ts.opacity ?? nodeEl.getAttribute("opacity"), 1);
        const tSize = svgLength(ts["font-size"] ?? nodeEl.getAttribute("font-size"), base.fontSize);
        const tFamily = mapFamily(ts["font-family"] ?? nodeEl.getAttribute("font-family"), base.fontFamily);
        const tBold = isBold(ts["font-weight"] ?? nodeEl.getAttribute("font-weight"), base.bold);
        const tItalic = /italic|oblique/i.test(ts["font-style"] ?? nodeEl.getAttribute("font-style") ?? "")
          ? true
          : /normal/i.test(ts["font-style"] ?? nodeEl.getAttribute("font-style") ?? "")
            ? false
            : base.italic;
        const tAlign = textAlign(ts["text-anchor"] ?? nodeEl.getAttribute("text-anchor"), base.align);
        const tTracking = svgLength(ts["letter-spacing"] ?? nodeEl.getAttribute("letter-spacing"), base.tracking);
        const tBaseline = ts["dominant-baseline"] ?? nodeEl.getAttribute("dominant-baseline") ?? base.baseline;
        if (/middle|central/i.test(tBaseline)) y += tSize * 0.35;
        else if (/hanging|top|text-before-edge/i.test(tBaseline)) y += tSize * 0.8;
        if (tSize <= 0) return;
        const gradient = tFill && tFill !== "none" ? gradientPaint(tFill, document, matrix) : null;
        const tFillPaint: Paint = gradient
          ? { ...gradient, opacity: gradient.opacity * Math.max(0, Math.min(1, tFillOpacity)) }
          : tFill && tFill !== "none" && !tFill.startsWith("url(")
            ? solid(svgColor(tFill).color, svgColor(tFill).alpha * Math.max(0, Math.min(1, tFillOpacity)))
            : noPaint();
        const sx = Math.hypot(matrix.a, matrix.b);
        const sy = Math.hypot(matrix.c, matrix.d);
        const px = matrix.a * x + matrix.c * y + matrix.e;
        const py = matrix.b * x + matrix.d * y + matrix.f;
        out.push({
          kind: "text",
          clips,
          text,
          x: px,
          y: py,
          size: Math.max(0.5, tSize * sy),
          font: tFamily,
          bold: tBold,
          italic: tItalic,
          align: tAlign,
          tracking: tTracking * sx,
          hScale: sy > 0 ? (sx / sy) * 100 : 100,
          vScale: 100,
          fill: tFillPaint,
          opacity: Math.max(0, Math.min(1, tOpacity)),
        });
      };
      const base = own;
      if (!tspans.length) {
        addText(el, svgLength(el.getAttribute("x"), 0), svgLength(el.getAttribute("y"), 0), m, base);
        return;
      }
      let cursorY = svgLength(el.getAttribute("y"), 0);
      for (const span of tspans) {
        const dy = svgLength(span.getAttribute("dy"), 0);
        cursorY += dy;
        const sx = span.getAttribute("x") ?? el.getAttribute("x") ?? "0";
        const sm = mul(m, parseTransform(span.getAttribute("transform")));
        addText(span, svgLength(sx, 0), cursorY, sm, base);
      }
      return;
    }

    const d = tag === "path" ? el.getAttribute("d") ?? "" : shapeD(el, tag);
    if (!d) return;
    const gradientFill = fill ? gradientPaint(fill, document, m) : null;
    const strokeGradient = stroke ? gradientPaint(stroke, document, m) : null;
    out.push({
      kind: "path",
      clips,
      d,
      fill,
      stroke: strokeGradient ? strokeGradient.color : stroke,
      strokeWidth,
      fillOpacity: Math.max(0, Math.min(1, fillOpacity)),
      strokeOpacity: Math.max(0, Math.min(1, strokeOpacity)),
      opacity,
      matrix: m,
      gradientFill,
    });
  };

  visit(root, IDENTITY, DEFAULT_STYLE, 0, [], []);
  return out;
}

/** 解析 SVG，返回按文档叠放顺序排列的路径与可编辑文字节点。
 *  clipPath 会包成带 clip 的组，roots 只列顶层节点；
 *  startSeq 由调用方给起点，避免在未提交的文档上偷偷加序号；
 *  namePrefix 让描摹与 SVG 导入在图层里可区分。 */
export function svgToNodes(
  svg: string,
  startSeq: number,
  namePrefix = "导入路径",
): { nodes: Node[]; roots: string[]; nextSeq: number } {
  const parser = new DOMParser();
  let dom: Document;
  try {
    dom = parser.parseFromString(svg, "image/svg+xml");
  } catch {
    return { nodes: [], roots: [], nextSeq: startSeq };
  }
  if (dom.getElementsByTagName("parsererror").length) return { nodes: [], roots: [], nextSeq: startSeq };
  let raw: RawItem[];
  try {
    raw = collectItems(dom.documentElement);
  } catch {
    return { nodes: [], roots: [], nextSeq: startSeq };
  }

  const textPrefix = namePrefix.includes("导入")
    ? namePrefix.replace("路径", "文字")
    : namePrefix === "描摹路径" ? "导入文字" : namePrefix;
  let seq = startSeq;
  let pathCount = 0;
  let textCount = 0;
  let groupCount = 0;
  let clipCount = 0;
  const nodes: Node[] = [];
  const roots: string[] = [];
  const active: Array<{ key: number; group: GroupNode }> = [];

  const addLeaf = (id: string): void => {
    const last = active[active.length - 1];
    if (last) last.group.children.push(id);
    else roots.push(id);
  };

  /** 按 raw.clips 的由外到内顺序切换到对应剪裁组；相同前缀复用。 */
  const ensureClips = (clips: ClipSpec[] | undefined): void => {
    const specs = clips ?? [];
    let common = 0;
    while (common < active.length && common < specs.length && active[common].key === specs[common].key) common++;
    active.length = common;
    for (let i = common; i < specs.length; i++) {
      const spec = specs[i];
      const clipNode: PathNode = {
        kind: "path",
        id: `n${seq++}`,
        name: `导入剪裁路径 ${++clipCount}`,
        subpaths: spec.subpaths,
        fill: noPaint(),
        stroke: noStroke(),
        opacity: 1,
        visible: false,
        locked: true,
      };
      const group: GroupNode = {
        kind: "group",
        id: `n${seq++}`,
        name: `导入剪裁组 ${++groupCount}`,
        children: [clipNode.id],
        clip: clipNode.id,
        opacity: 1,
        visible: true,
        locked: false,
      };
      nodes.push(clipNode, group);
      const parent = active[active.length - 1];
      if (parent) parent.group.children.push(group.id);
      else roots.push(group.id);
      active.push({ key: spec.key, group });
    }
  };

  for (const r of raw) {
    ensureClips(r.clips);
    if (r.kind === "text") {
      const node: Node = {
        kind: "text",
        id: `n${seq++}`,
        name: `${textPrefix} ${++textCount}`,
        x: r.x,
        y: r.y,
        text: r.text,
        size: r.size,
        font: r.font,
        bold: r.bold,
        italic: r.italic,
        align: r.align,
        tracking: r.tracking,
        hScale: r.hScale,
        vScale: r.vScale,
        fill: r.fill,
        opacity: r.opacity,
        visible: true,
        locked: false,
      };
      nodes.push(node);
      addLeaf(node.id);
      continue;
    }
    const subs = parseD(r.d);
    if (!subs.length) continue;
    const m = r.matrix;
    const mapPt = (p: { x: number; y: number }) => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f });
    // 描摹输出按图层堆叠，后画的在上层；与 Vexa 的 root 顺序一致。
    const fill = r.gradientFill
      ? { ...r.gradientFill, opacity: r.gradientFill.opacity * r.fillOpacity }
      : r.fill && r.fill !== "none" && !r.fill.startsWith("url(")
        ? solid(svgColor(r.fill).color, svgColor(r.fill).alpha * r.fillOpacity)
        : noPaint();
    const stroke: Stroke =
      r.stroke && r.stroke !== "none" && !r.stroke.startsWith("url(")
        ? {
            kind: "solid",
            color: svgColor(r.stroke).color,
            opacity: svgColor(r.stroke).alpha * r.strokeOpacity,
            width: r.strokeWidth,
            dash: [],
          }
        : noStroke();
    const node: PathNode = {
      kind: "path",
      id: `n${seq++}`,
      name: `${namePrefix} ${++pathCount}`,
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
    };
    nodes.push(node);
    addLeaf(node.id);
  }
  return { nodes, roots, nextSeq: seq };
}

/** SVG 画板尺寸：优先 viewBox，其次 width/height；夹到 Vexa 能承受的 32–8000。 */
export function svgIntrinsicSize(svg: string): { w: number; h: number } {
  const fallback = { w: 1000, h: 1000 };
  try {
    const dom = new DOMParser().parseFromString(svg, "image/svg+xml");
    if (dom.getElementsByTagName("parsererror").length) return fallback;
    const root = dom.documentElement;
    const viewBox = (root.getAttribute("viewBox") ?? "")
      .trim()
      .split(/[\s,]+/)
      .map((part) => Number.parseFloat(part));
    if (viewBox.length === 4 && Number.isFinite(viewBox[2]) && Number.isFinite(viewBox[3])) {
      const w = Math.abs(viewBox[2]);
      const h = Math.abs(viewBox[3]);
      if (w >= 1 && h >= 1) return { w: clampSide(w), h: clampSide(h) };
    }
    const width = Number.parseFloat(root.getAttribute("width") ?? "");
    const height = Number.parseFloat(root.getAttribute("height") ?? "");
    if (Number.isFinite(width) && Number.isFinite(height) && width >= 1 && height >= 1) {
      return { w: clampSide(width), h: clampSide(height) };
    }
  } catch {
    /* 解析失败按默认画板，不让启动卡死 */
  }
  return fallback;
}

function clampSide(value: number): number {
  return Math.max(32, Math.min(8000, Math.round(value * 100) / 100));
}

/** 兼容描摹通道：只取 SVG 中可见的路径节点。 */
export function svgToPathNodes(svg: string, startSeq: number, namePrefix = "描摹路径"): { nodes: PathNode[]; nextSeq: number } {
  const all = svgToNodes(svg, startSeq, namePrefix);
  return {
    nodes: all.nodes.filter((n): n is PathNode => n.kind === "path" && n.visible),
    nextSeq: all.nextSeq,
  };
}
