/** 路径几何：贝塞尔求值、扁平化、包围盒、命中、SVG d 互转。 */
import type { Anchor, Node, PathNode, Pt, SubPath, TextNode } from "./types";

export const TOL = 3;

export function pt(x: number, y: number): Pt {
  return { x, y };
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 三次贝塞尔在 t 处取值。 */
export function cubicAt(p0: Pt, c1: Pt, c2: Pt, p1: Pt, t: number): Pt {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p1.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p1.y,
  };
}

/** 段的两枚控制点：没有手柄就退化成端点，等价于直线。 */
export function segmentControls(a: Anchor, b: Anchor): [Pt, Pt] {
  return [
    a.hOut ?? { x: a.x, y: a.y },
    b.hIn ?? { x: b.x, y: b.y },
  ];
}

export function isStraight(a: Anchor, b: Anchor): boolean {
  return !a.hOut && !b.hIn;
}

/** 一条子路径扁平化成折线（闭合路径首尾相接）。 */
export function flatten(sub: SubPath, steps = 14): Pt[] {
  const out: Pt[] = [];
  const { anchors } = sub;
  if (anchors.length === 0) return out;
  out.push({ x: anchors[0].x, y: anchors[0].y });
  const count = sub.closed ? anchors.length : anchors.length - 1;
  for (let i = 0; i < count; i++) {
    const a = anchors[i];
    const b = anchors[(i + 1) % anchors.length];
    if (isStraight(a, b)) {
      out.push({ x: b.x, y: b.y });
      continue;
    }
    const [c1, c2] = segmentControls(a, b);
    for (let s = 1; s <= steps; s++) out.push(cubicAt(a, c1, c2, b, s / steps));
  }
  return out;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function boxOfPoints(points: Pt[]): Box {
  if (!points.length) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function pathPoints(node: PathNode): Pt[] {
  const pts: Pt[] = [];
  for (const sub of node.subpaths) for (const p of flatten(sub)) pts.push(p);
  return pts;
}

/** 估算单行文字的 em 宽度：CJK 全角按 1em，拉丁按字符类别分档，空格更窄。 */
function textEmWidth(line: string): number {
  let w = 0;
  for (const ch of Array.from(line)) {
    const c = ch.codePointAt(0) ?? 0;
    if (
      (c >= 0x2e80 && c <= 0x9fff) ||
      (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xff00 && c <= 0xffef) ||
      (c >= 0x3000 && c <= 0x303f)
    ) {
      w += 1;
    } else if (ch === " " || ch === "\t") {
      w += 0.3;
    } else if (/[A-Z]/.test(ch)) {
      w += 0.68;
    } else if (/[ilI.,'`|]/.test(ch)) {
      w += 0.3;
    } else {
      w += 0.56;
    }
  }
  return Math.max(0.3, w);
}

/** 区域文字的内边距，保持文字不贴框。 */
export const AREA_INSET = 4;

export interface TextLineLayout {
  text: string;
  /** 该行基线起点（已含对齐偏移）。 */
  x: number;
  /** 该行基线。 */
  baseline: number;
  /** 未乘 hScale 的排版宽度。 */
  width: number;
}

/** 路径文字中一个字符的落点与切线角度。 */
export interface PathTextChar {
  ch: string;
  x: number;
  y: number;
  /** 切线角度（弧度，画布坐标：y 向下）。 */
  angle: number;
  advance: number;
}

export interface PathTextLayout {
  chars: PathTextChar[];
  length: number;
  start: number;
  end: number;
  overflow: boolean;
}

export interface TextLayout {
  mode: "point" | "area" | "path";
  lines: TextLineLayout[];
  box: Box;
  overflow: boolean;
  path?: PathTextLayout;
  vertical?: VerticalTextLayout;
}

/** 直排文字中的一个字符；y 为字格顶端，x 为列中心线。 */
export interface VerticalTextChar {
  ch: string;
  x: number;
  y: number;
  advance: number;
  /** 拉丁等窄字符随列旋转 90°，汉字保持正立。 */
  rotate: boolean;
}

export interface VerticalTextLayout {
  chars: VerticalTextChar[];
  box: Box;
  overflow: boolean;
  columns: number;
}

interface PathSample {
  x: number;
  y: number;
  dist: number;
  angle: number;
}

/** 路径文字采样：每个子路径按高密度折线取样，记录累计弧长与切线。 */
function pathSamples(subpaths: SubPath[]): PathSample[] {
  const pts: Pt[] = [];
  for (const sub of subpaths) {
    const flat = flatten(sub, 40);
    for (const p of flat) {
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 0.01) pts.push(p);
    }
  }
  if (pts.length < 2) return [];
  const out: PathSample[] = [];
  let dist = 0;
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const cur = pts[i];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    if (i > 0) dist += Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const angle = Math.atan2(next.y - prev.y, next.x - prev.x);
    out.push({ x: cur.x, y: cur.y, dist, angle });
  }
  return out;
}

/** 按弧长找到落点；超出路径末尾时返回最后一点并标记。 */
function sampleAt(samples: PathSample[], target: number): { x: number; y: number; angle: number; over: boolean } {
  const last = samples[samples.length - 1];
  if (target <= 0) return { ...samples[0], over: false };
  if (target >= last.dist) return { ...last, over: target > last.dist + 0.01 };
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].dist <= target) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  const span = b.dist - a.dist || 1;
  const t = (target - a.dist) / span;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    angle: a.angle + Math.atan2(Math.sin(b.angle - a.angle), Math.cos(b.angle - a.angle)) * t,
    over: false,
  };
}

/** 路径文字排版：按字符前进，贴路径切线旋转；支持起点、左右侧与对齐。 */
export function pathTextLayout(node: TextNode): PathTextLayout {
  const samples = pathSamples(node.pathSubpaths ?? []);
  const length = samples.length ? samples[samples.length - 1].dist : 0;
  if (!length) return { chars: [], length: 0, start: 0, end: 0, overflow: false };
  const hs = Math.abs((node.hScale ?? 100) / 100) || 1;
  const tracking = node.tracking ?? 0;
  const text = node.text.replace(/\n/g, " ");
  const chars = Array.from(text);
  const advances = chars.map((ch) => (textEmWidth(ch) * node.size + tracking) * hs);
  const total = advances.reduce((a, b) => a + b, 0);
  let start = Math.max(0, Math.min(node.pathStart ?? 0, length));
  if (node.align === "center") start = Math.max(0, start + length / 2 - total / 2);
  else if (node.align === "right") start = Math.max(0, start + length - total);
  const side = node.pathSide === "right" ? -1 : 1;
  const offset = (node.baseline ?? 0) * side;
  const placed: PathTextChar[] = [];
  let pen = start;
  let overflow = false;
  for (let i = 0; i < chars.length; i++) {
    if (pen > length) {
      overflow = true;
      break;
    }
    const p = sampleAt(samples, pen);
    if (p.over) overflow = true;
    const nx = Math.sin(p.angle);
    const ny = -Math.cos(p.angle);
    placed.push({
      ch: chars[i],
      x: p.x + nx * offset,
      y: p.y + ny * offset,
      angle: p.angle,
      advance: advances[i],
    });
    pen += advances[i];
  }
  if (pen > length + 0.01) overflow = true;
  return { chars: placed, length, start, end: Math.min(pen, length), overflow };
}

/** 直排里保持正立的字符（汉字、假名、谚文、全角标点）；拉丁与数字随列旋转。 */
export function isVerticalUpright(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return (
    (c >= 0x2e80 && c <= 0x9fff) ||
    (c >= 0xac00 && c <= 0xd7af) ||
    (c >= 0xf900 && c <= 0xfaff) ||
    (c >= 0xff00 && c <= 0xffef) ||
    (c >= 0x3000 && c <= 0x303f) ||
    (c >= 0x3040 && c <= 0x30ff)
  );
}

/** 直排字格高度：正立字占一个字身，旋转拉丁按原字宽前进。 */
function verticalAdvance(node: TextNode, ch: string): number {
  const hs = Math.abs((node.hScale ?? 100) / 100) || 1;
  const base = isVerticalUpright(ch) ? node.size : textEmWidth(ch) * node.size;
  return Math.max(1, base * hs) + (node.tracking ?? 0);
}

/** 直排排版：逐字向下，换行/换列向左；区域文字按框高自动换列。 */
export function verticalTextLayout(node: TextNode): VerticalTextLayout {
  const lh = node.size * (node.lineHeight ?? 1.25);
  const area = (node.textMode ?? "point") === "area";
  const box: Box = area
    ? { x: node.x, y: node.y, w: Math.max(1, node.boxW ?? 120), h: Math.max(1, node.boxH ?? 60) }
    : { x: node.x, y: node.y, w: lh, h: node.size };
  const chars: VerticalTextChar[] = [];
  const paras = node.text.split("\n");
  let overflow = false;

  if (!area) {
    let maxH = node.size;
    const ncols = Math.max(1, paras.length);
    paras.forEach((para, li) => {
      const colX = node.x - li * lh;
      let penY = node.y;
      for (const ch of Array.from(para)) {
        const adv = verticalAdvance(node, ch);
        chars.push({ ch, x: colX, y: penY, advance: adv, rotate: !isVerticalUpright(ch) });
        penY += adv;
      }
      maxH = Math.max(maxH, penY - node.y);
    });
    const b: Box = {
      x: node.x - (ncols - 1) * lh - lh / 2,
      y: node.y,
      w: ncols * lh,
      h: Math.max(node.size, maxH),
    };
    return { chars, box: { x: b.x, y: b.y, w: Math.max(1, b.w), h: Math.max(1, b.h) }, overflow: false, columns: ncols };
  }

  const inset = AREA_INSET;
  const colStep = Math.max(1, lh);
  const cols = Math.max(1, Math.floor((box.w - inset * 2) / colStep));
  const rightX = box.x + box.w - inset - colStep / 2;
  const topY = box.y + inset;
  const maxBottom = box.y + box.h - inset;
  const used: number[] = new Array(cols).fill(topY);
  let col = 0;
  let penY = topY;

  for (let pi = 0; pi < paras.length; pi++) {
    if (pi > 0) {
      col++;
      penY = topY + Math.max(0, node.paraSpace ?? 0);
      if (col >= cols) {
        if (Array.from(paras[pi]).length) overflow = true;
        break;
      }
    }
    const para = Array.from(paras[pi]);
    if (!para.length) {
      used[col] = Math.max(used[col], penY);
      continue;
    }
    penY += Math.max(0, node.firstIndent ?? 0);
    for (const ch of para) {
      const adv = verticalAdvance(node, ch);
      if (penY + adv > maxBottom + 0.01) {
        col++;
        penY = topY;
        if (col >= cols) {
          overflow = true;
          break;
        }
      }
      const x = rightX - col * colStep;
      chars.push({ ch, x, y: penY, advance: adv, rotate: !isVerticalUpright(ch) });
      penY += adv;
      used[col] = Math.max(used[col], penY);
    }
    if (overflow) break;
  }

  let shift = 0;
  if (chars.length) {
    const last = Math.max(...used);
    const free = maxBottom - last;
    const v = node.areaVAlign ?? "top";
    if (free > 0) shift = v === "middle" ? free / 2 : v === "bottom" ? free : 0;
  }
  if (shift) for (const c of chars) c.y += shift;
  return {
    chars,
    box,
    overflow,
    columns: cols,
  };
}


function pathTextBox(node: TextNode, path: PathTextLayout): Box {
  const pts: Pt[] = [];
  for (const sub of node.pathSubpaths ?? []) for (const p of flatten(sub, 18)) pts.push(p);
  const bottom = node.size * 0.25;
  const top = node.size * 0.9;
  for (const c of path.chars) {
    const cos = Math.cos(c.angle);
    const sin = Math.sin(c.angle);
    const corners = [
      { x: 0, y: -top },
      { x: c.advance, y: -top },
      { x: c.advance, y: bottom },
      { x: 0, y: bottom },
    ];
    for (const q of corners) {
      pts.push({ x: c.x + q.x * cos - q.y * sin, y: c.y + q.x * sin + q.y * cos });
    }
  }
  const b = boxOfPoints(pts);
  return { x: b.x - 2, y: b.y - 2, w: Math.max(4, b.w + 4), h: Math.max(4, b.h + 4) };
}

/** 单行文字的近似包围盒：按字符宽度估，字距、缩放、对齐一起算。 */
export function textBox(node: TextNode): Box {
  if ((node.textMode ?? "point") === "path") {
    return pathTextBox(node, pathTextLayout(node));
  }
  if (node.textDirection === "vertical") {
    return verticalTextLayout(node).box;
  }
  if ((node.textMode ?? "point") === "area") {
    return {
      x: node.x,
      y: node.y,
      w: Math.max(1, node.boxW ?? 100),
      h: Math.max(1, node.boxH ?? 60),
    };
  }
  const lines = node.text.split("\n");
  const lh = node.size * (node.lineHeight ?? 1.25);
  const tracking = node.tracking ?? 0;
  const hs = (node.hScale ?? 100) / 100;
  const vs = (node.vScale ?? 100) / 100;
  const longest = Math.max(
    1,
    ...lines.map((l) => textEmWidth(l) * node.size + Math.max(0, Array.from(l).length - 1) * tracking),
  );
  const w = Math.max(1, longest * Math.abs(hs));
  const h = Math.max(node.size, lh * lines.length) * Math.abs(vs);
  const align = node.align ?? "left";
  const x = node.x + (align === "center" ? -w / 2 : align === "right" ? -w : 0);
  return { x, y: node.y - (node.baseline ?? 0) - node.size * 1.2, w, h };
}

/** 按字符贪心换行；CJK 可逐字断，拉丁长词也会在框内断开。首行缩进只作用于每个段落第一行。 */
function wrapAreaText(node: TextNode, innerW: number): string[][] {
  const tracking = node.tracking ?? 0;
  const hs = Math.abs((node.hScale ?? 100) / 100) || 1;
  const indent = Math.max(0, Math.min(node.firstIndent ?? 0, innerW - 1));
  const paragraphs = node.text.split("\n");
  return paragraphs.map((para) => {
    const chars = Array.from(para);
    if (!chars.length) return [""];
    const lines: string[] = [];
    let cur = "";
    let curW = 0;
    let limit = Math.max(1, innerW - indent);
    for (const ch of chars) {
      const cw = textEmWidth(ch) * node.size;
      const nextW = cur ? curW + tracking + cw : cw;
      if (cur && (nextW * hs > limit || nextW * hs < 0)) {
        lines.push(cur);
        cur = ch;
        curW = cw;
        limit = innerW;
      } else {
        cur += ch;
        curW = nextW;
      }
    }
    if (cur || !lines.length) lines.push(cur);
    return lines;
  });
}

/** 区域文字分栏：先填满第一栏再流到下一栏，跨栏保留段落与首行缩进。 */
function layoutAreaColumns(
  node: TextNode,
  box: Box,
  columns: number,
  colW: number,
  gutter: number,
  lh: number,
  hs: number,
  indent: number,
  paraSpace: number,
  baselineOffset: number,
): { lines: TextLineLayout[]; overflow: boolean } {
  const lines: TextLineLayout[] = [];
  const paras = node.text.split("\n");
  const maxBaseline = box.y + box.h - AREA_INSET - node.size * 0.25;
  const topBaseline = box.y + AREA_INSET + node.size * 1.2 - baselineOffset;
  const align = node.align ?? "left";
  const tracking = node.tracking ?? 0;
  let pi = 0;
  let ci = 0;
  let overflow = false;

  for (let col = 0; col < columns && pi < paras.length; col++) {
    const colX = box.x + AREA_INSET + col * (colW + gutter);
    let baseline = topBaseline;
    let firstLine = true;
    while (pi < paras.length) {
      if (baseline > maxBaseline) { break; }
      const chars = Array.from(paras[pi]);
      if (!chars.length) {
        lines.push({ text: "", x: colX + (firstLine ? indent : 0), baseline, width: 0 });
        baseline += lh;
        firstLine = false;
        pi++;
        ci = 0;
        if (pi < paras.length) baseline += paraSpace;
        continue;
      }
      const lineIndent = firstLine ? indent : 0;
      const limit = Math.max(1, colW - lineIndent);
      let line = "";
      let width = 0;
      while (ci < chars.length) {
        const ch = chars[ci];
        const cw = textEmWidth(ch) * node.size;
        const nextW = line ? width + tracking + cw : cw;
        if (line && nextW * hs > limit) break;
        line += ch;
        width = nextW;
        ci++;
      }
      const scaled = width * hs;
      const x =
        colX + lineIndent +
        (align === "center" ? Math.max(0, limit - scaled) / 2 : align === "right" ? Math.max(0, limit - scaled) : 0);
      lines.push({ text: line, x, baseline, width });
      baseline += lh;
      firstLine = false;
      if (ci >= chars.length) {
        pi++;
        ci = 0;
        if (pi < paras.length) baseline += paraSpace;
      }
    }
  }
  if (pi < paras.length) overflow = true;

  if (lines.length) {
    const last = lines.reduce((m, l) => Math.max(m, l.baseline), topBaseline);
    const free = maxBaseline - last;
    const vAlign = node.areaVAlign ?? "top";
    const shift = free > 0 && vAlign === "middle" ? free / 2 : free > 0 && vAlign === "bottom" ? free : 0;
    if (shift) for (const l of lines) l.baseline += shift;
  }
  return { lines, overflow };
}

/** 统一的文本行布局：单点文字与区域文字共用渲染、导出的换行/对齐结果。 */
export function textLayout(node: TextNode): TextLayout {
  const mode = node.textMode ?? "point";
  if (mode === "path") {
    const path = pathTextLayout(node);
    return { mode, lines: [], box: textBox(node), overflow: path.overflow, path };
  }
  if (node.textDirection === "vertical") {
    const vertical = verticalTextLayout(node);
    return { mode, lines: [], box: vertical.box, overflow: vertical.overflow, vertical };
  }
  const lh = node.size * (node.lineHeight ?? 1.25);
  const align = node.align ?? "left";
  const hs = Math.abs((node.hScale ?? 100) / 100) || 1;
  const baselineOffset = node.baseline ?? 0;
  if (mode === "area") {
    const box = textBox(node);
    const innerW = Math.max(1, box.w - AREA_INSET * 2);
    const innerH = Math.max(1, box.h - AREA_INSET * 2);
    const indent = Math.max(0, Math.min(node.firstIndent ?? 0, innerW - 1));
    const paraSpace = Math.max(0, node.paraSpace ?? 0);
    const columns = Math.max(1, Math.min(6, Math.round(node.columns ?? 1)));
    const gutter = Math.max(0, node.columnGutter ?? 0);
    if (columns > 1) {
      const colW = Math.max(1, (innerW - gutter * (columns - 1)) / columns);
      const colLayout = layoutAreaColumns(node, box, columns, colW, gutter, lh, hs, indent, paraSpace, baselineOffset);
      return { mode, lines: colLayout.lines, box, overflow: colLayout.overflow };
    }
    const plan = wrapAreaText(node, innerW);
    const gaps = Math.max(0, plan.length - 1);
    const lineCount = plan.reduce((n, para) => n + para.length, 0);
    const blockH = node.size * 1.2 + Math.max(0, lineCount - 1) * lh + gaps * paraSpace + node.size * 0.25;
    const free = innerH - blockH;
    const vAlign = node.areaVAlign ?? "top";
    const topOffset = free > 0 ? (vAlign === "middle" ? free / 2 : vAlign === "bottom" ? free : 0) : 0;
    let baseline = box.y + AREA_INSET + node.size * 1.2 - baselineOffset + topOffset;
    const lines: TextLineLayout[] = [];
    plan.forEach((para, pi) => {
      para.forEach((text, li) => {
        const lineIndent = li === 0 ? indent : 0;
        const avail = Math.max(1, innerW - lineIndent);
        const width =
          textEmWidth(text) * node.size +
          Math.max(0, Array.from(text).length - 1) * (node.tracking ?? 0);
        const scaled = width * hs;
        const x =
          box.x + AREA_INSET + lineIndent +
          (align === "center" ? Math.max(0, avail - scaled) / 2 : align === "right" ? Math.max(0, avail - scaled) : 0);
        lines.push({ text, x, baseline, width });
        baseline += lh;
      });
      if (pi < plan.length - 1) baseline += paraSpace;
    });
    const maxBaseline = box.y + box.h - AREA_INSET - node.size * 0.25;
    const overflow = lines.length > 0 && lines[lines.length - 1].baseline > maxBaseline;
    return { mode, lines, box, overflow };
  }
  const box = textBox(node);
  const lines = node.text.split("\n").map((text, i) => {
    const width =
      textEmWidth(text) * node.size +
      Math.max(0, Array.from(text).length - 1) * (node.tracking ?? 0);
    const scaled = width * hs;
    return {
      text,
      width,
      x: node.x + (align === "center" ? -scaled / 2 : align === "right" ? -scaled : 0),
      baseline: node.y + i * lh - baselineOffset,
    };
  });
  return { mode, lines, box, overflow: false };
}

/** 单点 ↔ 区域 ↔ 路径文字转换，保留可见文字与大致位置。 */
export function convertTextMode(node: TextNode, mode: "point" | "area"): void {
  const cur = node.textMode ?? "point";
  if (cur === mode) return;
  if (cur === "path") {
    const p = pathTextLayout(node);
    const first = p.chars[0];
    const b = textBox(node);
    delete node.pathSubpaths;
    delete node.pathStart;
    delete node.pathSide;
    delete node.textDirection;
    node.baseline = 0;
    if (mode === "area") {
      node.textMode = "area";
      node.x = b.x;
      node.y = b.y;
      node.boxW = Math.max(50, b.w + AREA_INSET * 2);
      node.boxH = Math.max(node.size * 1.25 + AREA_INSET * 2, b.h + AREA_INSET * 2);
      return;
    }
    node.textMode = "point";
    node.align = "left";
    node.x = first?.x ?? node.x;
    node.y = first?.y ?? node.y;
    return;
  }
  if (mode === "area") {
    const b = textBox(node);
    node.textMode = "area";
    node.x = b.x;
    node.y = b.y;
    node.boxW = Math.max(50, b.w + AREA_INSET * 2);
    node.boxH = Math.max(node.size * 1.25 + AREA_INSET * 2, b.h + AREA_INSET * 2);
    node.baseline = 0;
    return;
  }
  const lay = textLayout(node);
  const innerW = Math.max(1, lay.box.w - AREA_INSET * 2);
  const align = node.align ?? "left";
  node.text = lay.lines.map((l) => l.text).join("\n");
  node.x = lay.box.x + AREA_INSET + (align === "center" ? innerW / 2 : align === "right" ? innerW : 0);
  node.y = lay.lines[0]?.baseline ?? lay.box.y + AREA_INSET + node.size * 1.2;
  node.textMode = "point";
  node.baseline = 0;
  delete node.boxW;
  delete node.boxH;
  delete node.areaVAlign;
  delete node.firstIndent;
  delete node.paraSpace;
  delete node.columns;
  delete node.columnGutter;
}

export function nodeBox(node: Node): Box {
  if (node.kind === "path") return boxOfPoints(pathPoints(node));
  if (node.kind === "text") return textBox(node);
  if (node.kind === "image") return { x: node.x, y: node.y, w: node.w, h: node.h };
  return { x: 0, y: 0, w: 0, h: 0 };
}

export function unionBox(a: Box | null, b: Box): Box {
  if (!a) return b;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const r = Math.max(a.x + a.w, b.x + b.w);
  const bt = Math.max(a.y + a.h, b.y + b.h);
  return { x, y, w: r - x, h: bt - y };
}

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** 多子路径的环绕数判定。 */
export function pointInPolys(polys: Pt[][], p: Pt): boolean {
  let winding = 0;
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (a.y <= p.y) {
        if (b.y > p.y && (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y) > 0) winding++;
      } else if (b.y <= p.y && (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y) < 0) {
        winding--;
      }
    }
  }
  return winding !== 0;
}

export function hitPath(node: PathNode, p: Pt, tol = TOL): boolean {
  const tolDoc = tol;
  const polys = node.subpaths.map((s) => flatten(s));
  if (node.fill.kind !== "none" && pointInPolys(polys, p)) return true;
  const strokeTol = node.stroke.kind === "none" ? tolDoc : Math.max(tolDoc, node.stroke.width / 2 + 1);
  const widthPad = node.stroke.kind === "none" || !node.stroke.widthPoints
    ? 0
    : Math.max(0, node.stroke.widthPoints.reduce((m, q) => Math.max(m, q.left, q.right), 1) - 1) * node.stroke.width / 2;
  const reach = strokeTol + widthPad;
  for (const poly of polys) {
    for (let i = 0; i < poly.length - 1; i++) {
      if (segDist(p, poly[i], poly[i + 1]) <= reach) return true;
    }
    if (poly.length > 2 && segDist(p, poly[0], poly[poly.length - 1]) <= reach) return true;
  }
  return false;
}

export function hitNode(node: Node, p: Pt): boolean {
  if (node.kind === "path") return hitPath(node, p);
  const b = nodeBox(node);
  return p.x >= b.x - 2 && p.x <= b.x + b.w + 2 && p.y >= b.y - 2 && p.y <= b.y + b.h + 2;
}

/** 路径 → SVG d。数字保留 3 位小数，足够印刷又不臃肿。 */
export function num(n: number): string {
  const r = Math.round(n * 1000) / 1000;
  return String(r);
}

export function subPathD(sub: SubPath): string {
  const { anchors } = sub;
  if (!anchors.length) return "";
  const parts: string[] = [`M ${num(anchors[0].x)} ${num(anchors[0].y)}`];
  const count = sub.closed ? anchors.length : anchors.length - 1;
  for (let i = 0; i < count; i++) {
    const a = anchors[i];
    const b = anchors[(i + 1) % anchors.length];
    if (isStraight(a, b)) {
      parts.push(`L ${num(b.x)} ${num(b.y)}`);
    } else {
      const [c1, c2] = segmentControls(a, b);
      parts.push(
        `C ${num(c1.x)} ${num(c1.y)} ${num(c2.x)} ${num(c2.y)} ${num(b.x)} ${num(b.y)}`,
      );
    }
  }
  if (sub.closed) parts.push("Z");
  return parts.join(" ");
}

export function pathD(node: PathNode): string {
  return node.subpaths.map(subPathD).filter(Boolean).join(" ");
}

/** 把一段 d 解析成子路径。支持 M/L/C/Q/S/T/H/V/Z 及其相对形式；弧线以折线近似。 */
export function parseD(d: string): SubPath[] {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const subs: SubPath[] = [];
  let cur: SubPath | null = null;
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let cmd = "";
  let i = 0;
  const isNum = (s: string) => /^[-+]?\d*\.?\d+(?:e[-+]?\d+)?$/i.test(s);
  const push = (ax: number, ay: number) => {
    if (!cur) {
      cur = { anchors: [], closed: false };
      subs.push(cur);
    }
    cur.anchors.push({ x: ax, y: ay, hIn: null, hOut: null, smooth: false });
  };

  const readNum = (): number => {
    const v = Number(tokens[i]);
    i++;
    return v;
  };

  while (i < tokens.length) {
    const t = tokens[i];
    if (isNum(t)) {
      // 隐式重复上一个命令
    } else {
      cmd = t;
      i++;
    }
    const rel = cmd === cmd.toLowerCase();
    const c = cmd.toUpperCase();
    if (c === "Z") {
      if (cur) cur.closed = true;
      x = sx;
      y = sy;
      cur = null;
      continue;
    }
    if (c === "M") {
      const nx = readNum();
      const ny = readNum();
      x = rel ? x + nx : nx;
      y = rel ? y + ny : ny;
      sx = x;
      sy = y;
      cur = { anchors: [{ x, y, hIn: null, hOut: null, smooth: false }], closed: false };
      subs.push(cur);
      cmd = rel ? "l" : "L";
      continue;
    }
    if (c === "L") {
      const nx = readNum();
      const ny = readNum();
      x = rel ? x + nx : nx;
      y = rel ? y + ny : ny;
      push(x, y);
      continue;
    }
    if (c === "H") {
      const nx = readNum();
      x = rel ? x + nx : nx;
      push(x, y);
      continue;
    }
    if (c === "V") {
      const ny = readNum();
      y = rel ? y + ny : ny;
      push(x, y);
      continue;
    }
    if (c === "C" || c === "Q" || c === "S" || c === "T") {
      let c1x: number;
      let c1y: number;
      let c2x: number;
      let c2y: number;
      let ex: number;
      let ey: number;
      const last = cur && cur.anchors.length ? cur.anchors[cur.anchors.length - 1] : null;
      if (c === "C") {
        c1x = readNum();
        c1y = readNum();
        c2x = readNum();
        c2y = readNum();
        ex = readNum();
        ey = readNum();
        if (rel) {
          c1x += x; c1y += y; c2x += x; c2y += y; ex += x; ey += y;
        }
      } else if (c === "S") {
        c2x = readNum();
        c2y = readNum();
        ex = readNum();
        ey = readNum();
        if (rel) { c2x += x; c2y += y; ex += x; ey += y; }
        const ph = last?.hIn;
        c1x = ph ? 2 * x - ph.x : x;
        c1y = ph ? 2 * y - ph.y : y;
      } else if (c === "Q") {
        c1x = readNum();
        c1y = readNum();
        ex = readNum();
        ey = readNum();
        if (rel) { c1x += x; c1y += y; ex += x; ey += y; }
        c2x = c1x;
        c2y = c1y;
      } else {
        ex = readNum();
        ey = readNum();
        if (rel) { ex += x; ey += y; }
        const ph = last?.hIn;
        c1x = ph ? 2 * x - ph.x : x;
        c1y = ph ? 2 * y - ph.y : y;
        c2x = c1x;
        c2y = c1y;
      }
      if (cur && last) {
        last.hOut = { x: c1x, y: c1y };
        cur.anchors.push({ x: ex, y: ey, hIn: { x: c2x, y: c2y }, hOut: null, smooth: false });
      } else {
        push(ex, ey);
      }
      x = ex;
      y = ey;
      continue;
    }
    if (c === "A") {
      // 弧线：取终点，用直线补上（矢量化输出几乎不用弧线）
      readNum(); readNum(); readNum(); readNum(); readNum();
      const ex = readNum();
      const ey = readNum();
      x = rel ? x + ex : ex;
      y = rel ? y + ey : ey;
      push(x, y);
      continue;
    }
    // 未知命令：跳过
    i++;
  }
  // 相邻重合锚点去重
  return subs
    .map((s) => ({
      ...s,
      anchors: s.anchors.filter((a, idx, arr) => {
        if (idx === 0) return true;
        const p = arr[idx - 1];
        return Math.abs(a.x - p.x) > 1e-9 || Math.abs(a.y - p.y) > 1e-9;
      }),
    }))
    .filter((s) => s.anchors.length > 1);
}

export function moveNodePoints(node: Node, dx: number, dy: number): void {
  if (node.kind === "path") {
    for (const sub of node.subpaths) {
      for (const a of sub.anchors) {
        a.x += dx;
        a.y += dy;
        if (a.hIn) { a.hIn.x += dx; a.hIn.y += dy; }
        if (a.hOut) { a.hOut.x += dx; a.hOut.y += dy; }
      }
    }
    return;
  }
  if (node.kind === "text" || node.kind === "image") {
    node.x += dx;
    node.y += dy;
  }
}

/** 文字装饰线（画布 / SVG / PDF 共用）；路径文字暂不装饰。 */
export interface TextDecorationLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
}

export function textDecorationLines(node: TextNode, layout = textLayout(node)): TextDecorationLine[] {
  if (!node.underline && !node.strike) return [];
  if (layout.mode === "path") return [];
  const thickness = Math.max(0.5, node.size * 0.06);
  const out: TextDecorationLine[] = [];
  if (layout.vertical) {
    const hs = Math.abs((node.hScale ?? 100) / 100);
    const cols = new Map<number, { x: number; top: number; bottom: number }>();
    for (const c of layout.vertical.chars) {
      if (!c.ch.trim()) continue;
      const key = Math.round(c.x * 100) / 100;
      const item = cols.get(key) ?? { x: c.x, top: c.y, bottom: c.y + c.advance };
      item.top = Math.min(item.top, c.y);
      item.bottom = Math.max(item.bottom, c.y + c.advance);
      cols.set(key, item);
    }
    for (const col of cols.values()) {
      if (node.underline) out.push({ x1: col.x + node.size * 0.45 * hs, y1: col.top, x2: col.x + node.size * 0.45 * hs, y2: col.bottom, thickness });
      if (node.strike) out.push({ x1: col.x, y1: col.top, x2: col.x, y2: col.bottom, thickness });
    }
    return out;
  }
  const hs = Math.abs((node.hScale ?? 100) / 100);
  const vs = Math.abs((node.vScale ?? 100) / 100);
  for (const line of layout.lines) {
    const width = line.width * hs;
    if (width <= 0.01) continue;
    if (node.underline) out.push({ x1: line.x, y1: line.baseline + node.size * 0.12 * vs, x2: line.x + width, y2: line.baseline + node.size * 0.12 * vs, thickness });
    if (node.strike) out.push({ x1: line.x, y1: line.baseline - node.size * 0.3 * vs, x2: line.x + width, y2: line.baseline - node.size * 0.3 * vs, thickness });
  }
  return out;
}
