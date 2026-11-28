/** 文档级图形样式：捕获/套用/更新填充、描边、透明度与混合模式。 */
import type { GraphicStyle, Node, Paint, Stroke, VexaDoc } from "./types";
import { BLEND_MODES, noStroke } from "./types";
import { normalizeGradStops } from "./paint";
import { normalizeWidthPoints } from "./width";

export const MAX_GRAPHIC_STYLES = 64;
const ID_RE = /^[a-z0-9_-]{1,32}$/i;
const HEX_RE = /^#[0-9a-f]{6}$/i;

export function stylesOf(doc: VexaDoc): GraphicStyle[] {
  return Array.isArray(doc.styles) ? doc.styles : [];
}

export function graphicStyleById(doc: VexaDoc, id: string | undefined): GraphicStyle | undefined {
  if (!id) return undefined;
  return stylesOf(doc).find((s) => s.id === id);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizePaint(raw: unknown, fallback = "#0f76d6"): Paint | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<Paint>;
  if (p.kind !== "none" && p.kind !== "solid" && p.kind !== "linear" && p.kind !== "radial" && p.kind !== "pattern") return null;
  const color = typeof p.color === "string" && HEX_RE.test(p.color) ? p.color.toLowerCase() : fallback;
  const opacity = typeof p.opacity === "number" && Number.isFinite(p.opacity) ? Math.max(0, Math.min(1, p.opacity)) : 1;
  if (p.kind === "pattern") {
    if (typeof p.patternId !== "string" || !ID_RE.test(p.patternId)) return { kind: "solid", color, opacity };
    return {
      kind: "pattern",
      color,
      opacity,
      patternId: p.patternId,
      patternScale: Number.isFinite(p.patternScale) ? Math.min(20, Math.max(0.05, p.patternScale as number)) : 1,
    };
  }
  if (p.kind === "linear" || p.kind === "radial") {
    const stops = Array.isArray(p.grad?.stops) ? normalizeGradStops(p.grad.stops, color) : null;
    if (!stops || stops.length < 2) return { kind: "solid", color, opacity };
    return {
      kind: p.kind,
      color: stops[0]?.color ?? color,
      opacity,
      grad: { angle: Number.isFinite(p.grad?.angle) ? (p.grad!.angle as number) : 90, stops },
    };
  }
  return { kind: p.kind, color, opacity };
}

function normalizeStroke(raw: unknown): Stroke | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const s = raw as Partial<Stroke>;
  if (s.kind !== "none" && s.kind !== "solid" && s.kind !== "linear" && s.kind !== "radial") return undefined;
  const color = typeof s.color === "string" && HEX_RE.test(s.color) ? s.color.toLowerCase() : "#17171c";
  const opacity = typeof s.opacity === "number" && Number.isFinite(s.opacity) ? Math.max(0, Math.min(1, s.opacity)) : 1;
  const width = typeof s.width === "number" && Number.isFinite(s.width) && s.width > 0 ? Math.min(1000, s.width) : 1;
  const dash = Array.isArray(s.dash) ? s.dash.filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0).slice(0, 8) : [];
  const cap = s.cap === "round" || s.cap === "square" ? s.cap : "butt";
  const join = s.join === "round" || s.join === "bevel" ? s.join : "miter";
  const arrow = s.arrow === "triangle" || s.arrow === "open" || s.arrow === "diamond" ? s.arrow : "none";
  const stroke: Stroke = { kind: s.kind, color, opacity, width, dash, cap, join, arrow };
  const widthPoints = normalizeWidthPoints(s.widthPoints);
  if (widthPoints.length >= 2) stroke.widthPoints = widthPoints;
  return stroke;
}

/** 清洗任意输入：限制 64 个、补 id、纠正非法颜色/画笔/混合模式。 */
export function normalizeGraphicStyles(input: unknown, swatchIds?: Set<string>): GraphicStyle[] {
  if (!Array.isArray(input)) return [];
  const out: GraphicStyle[] = [];
  for (let i = 0; i < input.length && out.length < MAX_GRAPHIC_STYLES; i++) {
    const raw = input[i] as Partial<GraphicStyle> | null;
    if (!raw || typeof raw !== "object") continue;
    const fill = normalizePaint(raw.fill);
    if (!fill) continue;
    let id = typeof raw.id === "string" && ID_RE.test(raw.id) ? raw.id : `gs${i + 1}`;
    while (out.some((s) => s.id === id)) id = `${id}_${out.length + 1}`;
    const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 24) : `样式 ${out.length + 1}`;
    const stroke = normalizeStroke(raw.stroke);
    const opacity = typeof raw.opacity === "number" && Number.isFinite(raw.opacity) ? Math.max(0, Math.min(1, raw.opacity)) : 1;
    const blend = raw.blend && BLEND_MODES.includes(raw.blend) ? raw.blend : undefined;
    if (fill.swatch && (!swatchIds || !swatchIds.has(fill.swatch))) delete fill.swatch;
    if (stroke?.swatch && (!swatchIds || !swatchIds.has(stroke.swatch))) delete stroke.swatch;
    out.push({ id, name, fill, ...(stroke ? { stroke } : {}), opacity, ...(blend ? { blend } : {}) });
  }
  return out;
}

/** 从路径/文字捕获外观；组和位图没有可直接套用的图形样式。 */
export function captureGraphicStyle(node: Node | undefined): Omit<GraphicStyle, "id" | "name"> | null {
  if (!node || (node.kind !== "path" && node.kind !== "text")) return null;
  return {
    fill: clone(node.fill),
    ...(node.kind === "path" ? { stroke: clone(node.stroke) } : {}),
    opacity: node.opacity ?? 1,
    ...(node.blend ? { blend: node.blend } : {}),
  };
}

function nextId(doc: VexaDoc): string {
  const used = new Set(stylesOf(doc).map((s) => s.id));
  let n = 1;
  while (used.has(`gs${n}`)) n++;
  return `gs${n}`;
}

export interface GraphicStyleResult {
  ok: boolean;
  style?: GraphicStyle;
  error?: string;
}

export function addGraphicStyle(doc: VexaDoc, node: Node | undefined, name?: string): GraphicStyleResult {
  if (stylesOf(doc).length >= MAX_GRAPHIC_STYLES) return { ok: false, error: `最多保存 ${MAX_GRAPHIC_STYLES} 个图形样式` };
  const appearance = captureGraphicStyle(node);
  if (!appearance) return { ok: false, error: "先选中一个路径或文字对象" };
  const style: GraphicStyle = {
    id: nextId(doc),
    name: name?.trim().slice(0, 24) || `样式 ${stylesOf(doc).length + 1}`,
    ...appearance,
  };
  if (!doc.styles) doc.styles = [];
  doc.styles.push(style);
  return { ok: true, style };
}

function applyToNode(doc: VexaDoc, id: string, style: GraphicStyle): number {
  const n = doc.nodes[id];
  if (!n) return 0;
  if (n.kind === "group") {
    let count = 0;
    for (const child of n.children) count += applyToNode(doc, child, style);
    return count;
  }
  if (n.kind === "path") {
    n.fill = clone(style.fill);
    n.stroke = style.stroke ? clone(style.stroke) : noStroke();
    n.opacity = style.opacity;
    if (style.blend) n.blend = style.blend;
    else delete n.blend;
    n.graphicStyle = style.id;
    return 1;
  }
  if (n.kind === "text") {
    n.fill = clone(style.fill);
    n.opacity = style.opacity;
    if (style.blend) n.blend = style.blend;
    else delete n.blend;
    n.graphicStyle = style.id;
    return 1;
  }
  if (n.kind === "image") {
    n.opacity = style.opacity;
    if (style.blend) n.blend = style.blend;
    else delete n.blend;
    return 1;
  }
  return 0;
}

/** 套用样式到选中对象（组递归），返回改到的对象数。 */
export function applyGraphicStyle(doc: VexaDoc, ids: string[], styleId: string): number {
  const style = graphicStyleById(doc, styleId);
  if (!style) return 0;
  let count = 0;
  for (const id of ids) count += applyToNode(doc, id, style);
  return count;
}

/** 用当前对象外观更新样式，并同步所有链接对象。 */
export function updateGraphicStyle(doc: VexaDoc, styleId: string, sourceId: string): number {
  const style = graphicStyleById(doc, styleId);
  const source = doc.nodes[sourceId];
  if (!style || !source || (source.kind !== "path" && source.kind !== "text")) return 0;
  const appearance = captureGraphicStyle(source);
  if (!appearance) return 0;
  style.fill = appearance.fill;
  if (appearance.stroke) style.stroke = appearance.stroke;
  else delete style.stroke;
  style.opacity = appearance.opacity;
  if (appearance.blend) style.blend = appearance.blend;
  else delete style.blend;
  return syncGraphicStyle(doc, styleId);
}

/** 把所有带该样式链接的对象同步成样式当前外观；返回对象数。 */
export function syncGraphicStyle(doc: VexaDoc, styleId: string): number {
  const style = graphicStyleById(doc, styleId);
  if (!style) return 0;
  let count = 0;
  for (const [id, n] of Object.entries(doc.nodes)) {
    if ((n.kind === "path" || n.kind === "text") && n.graphicStyle === styleId) count += applyToNode(doc, id, style);
  }
  return count;
}

/** 删除样式与链接，但保留对象当前外观。 */
export function deleteGraphicStyle(doc: VexaDoc, id: string): boolean {
  const list = stylesOf(doc);
  const at = list.findIndex((s) => s.id === id);
  if (at < 0) return false;
  list.splice(at, 1);
  for (const n of Object.values(doc.nodes)) {
    if ((n.kind === "path" || n.kind === "text") && n.graphicStyle === id) delete n.graphicStyle;
  }
  return true;
}

/** 统计链接对象数，用于样式卡和删除说明。 */
export function graphicStyleUsage(doc: VexaDoc, id: string): number {
  return Object.values(doc.nodes).filter((n) => (n.kind === "path" || n.kind === "text") && n.graphicStyle === id).length;
}
