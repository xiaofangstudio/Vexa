/** 画笔：图案/艺术/散点画笔引用图案砖，书法画笔用角度与圆度生成笔锋。画布/SVG/PDF 共用这里的采样与印章。 */
import { flatten } from "./geom";
import type { BrushDef, BrushKind, Node, PathNode, PatternDef, Pt, Stroke, VexaDoc } from "./types";

export const MAX_BRUSHES = 64;
const MAX_STAMPS = 2400;
const MAX_CALLIG_STAMPS = 4000;
const ART_SLICES = 160;
const ID_RE = /^[a-z0-9_-]{1,32}$/i;
const KIND_LIST: BrushKind[] = ["pattern", "art", "scatter", "calligraphic"];

export interface BrushStamp {
  x: number;
  y: number;
  angle: number;
  /** 印章在砖本地坐标里的横向/纵向缩放，已含画笔 scale。 */
  sx: number;
  sy: number;
  /** 艺术画笔的竖向切片：在砖本地坐标里裁出的源条带。 */
  slice?: { x: number; w: number };
}

export interface CalligraphyStamp {
  x: number;
  y: number;
  angle: number;
  rx: number;
  ry: number;
}

export function brushesOf(doc: VexaDoc): BrushDef[] {
  return Array.isArray(doc.brushes) ? doc.brushes : [];
}

export function brushById(doc: VexaDoc, id: string | undefined): BrushDef | undefined {
  if (!id) return undefined;
  return brushesOf(doc).find((b) => b.id === id);
}

/** 画笔引用的图案砖；书法画笔不需要图案，其余图案缺失时画笔视为失效。 */
export function brushPattern(doc: VexaDoc, brush: BrushDef | undefined): PatternDef | undefined {
  if (!brush || brush.kind === "calligraphic") return undefined;
  return (doc.patterns ?? []).find((p) => p.id === brush.patternId && p.root.length > 0);
}

export function brushUsable(doc: VexaDoc, brush: BrushDef | undefined): boolean {
  if (!brush) return false;
  return brush.kind === "calligraphic" || !!brushPattern(doc, brush);
}

export function canBrushStroke(doc: VexaDoc, ids: string[]): boolean {
  return ids.some((id) => {
    const node = doc.nodes[id];
    return !!node && node.visible && (node.kind === "path" || node.kind === "group");
  });
}

export function createBrush(
  doc: VexaDoc,
  kind: BrushKind = "pattern",
  patternId?: string,
  name?: string,
  scale = 1,
  spacing = 100,
): { ok: boolean; brush?: BrushDef; error?: string } {
  const list = brushesOf(doc);
  if (list.length >= MAX_BRUSHES) return { ok: false, error: `最多保存 ${MAX_BRUSHES} 个画笔` };
  const safeKind = KIND_LIST.includes(kind) ? kind : "pattern";
  let pattern: PatternDef | undefined;
  if (safeKind !== "calligraphic") {
    pattern = (doc.patterns ?? []).find((p) => p.id === patternId);
    if (!pattern || pattern.root.length === 0) return { ok: false, error: "先选中一个可用的图案" };
  }
  let n = 1;
  while (list.some((b) => b.id === `br${n}`)) n++;
  const baseName = cleanName(name);
  const fallback =
    safeKind === "pattern"
      ? `${pattern!.name}画笔`
      : safeKind === "art"
        ? `${pattern!.name}艺术画笔`
        : safeKind === "scatter"
          ? `${pattern!.name}散点画笔`
          : `书法画笔 ${n}`;
  const brush: BrushDef = {
    id: `br${n}`,
    name: baseName || fallback,
    kind: safeKind,
    ...(safeKind === "calligraphic" ? {} : { patternId: pattern!.id }),
    scale: clampScale(scale),
    spacing: clampSpacing(spacing),
    angle: 120,
    roundness: 35,
    jitter: 35,
    spread: 40,
    rev: 1,
  };
  doc.brushes = [...list, brush];
  return { ok: true, brush };
}

/** 兼容第六十二批入口：按图案新建图案画笔。 */
export function createPatternBrush(
  doc: VexaDoc,
  patternId: string,
  name?: string,
  scale = 1,
  spacing = 100,
): { ok: boolean; brush?: BrushDef; error?: string } {
  return createBrush(doc, "pattern", patternId, name, scale, spacing);
}

export function renameBrush(doc: VexaDoc, id: string, name: string): boolean {
  const brush = brushById(doc, id);
  const next = cleanName(name);
  if (!brush || !next) return false;
  brush.name = next;
  brush.rev = (brush.rev ?? 1) + 1;
  return true;
}

export function setBrushParams(doc: VexaDoc, id: string, scale?: number, spacing?: number): boolean {
  const brush = brushById(doc, id);
  if (!brush) return false;
  if (scale !== undefined) brush.scale = clampScale(scale);
  if (spacing !== undefined) brush.spacing = clampSpacing(spacing);
  brush.rev = (brush.rev ?? 1) + 1;
  return true;
}

export interface BrushStylePatch {
  scale?: number;
  spacing?: number;
  angle?: number;
  roundness?: number;
  jitter?: number;
  spread?: number;
}

export function setBrushStyle(doc: VexaDoc, id: string, patch: BrushStylePatch): boolean {
  const brush = brushById(doc, id);
  if (!brush) return false;
  if (patch.scale !== undefined) brush.scale = clampScale(patch.scale);
  if (patch.spacing !== undefined) brush.spacing = clampSpacing(patch.spacing);
  if (patch.angle !== undefined) brush.angle = clampNumber(patch.angle, 0, 180, 120);
  if (patch.roundness !== undefined) brush.roundness = clampNumber(patch.roundness, 0, 100, 35);
  if (patch.jitter !== undefined) brush.jitter = clampNumber(patch.jitter, 0, 100, 35);
  if (patch.spread !== undefined) brush.spread = clampNumber(patch.spread, 0, 200, 40);
  brush.rev = (brush.rev ?? 1) + 1;
  return true;
}

export function redefineBrushPattern(doc: VexaDoc, id: string, patternId: string): boolean {
  const brush = brushById(doc, id);
  const pattern = (doc.patterns ?? []).find((p) => p.id === patternId);
  if (!brush || brush.kind === "calligraphic" || !pattern || pattern.root.length === 0) return false;
  brush.patternId = pattern.id;
  brush.rev = (brush.rev ?? 1) + 1;
  return true;
}

export function applyBrushStroke(doc: VexaDoc, ids: string[], id: string): number {
  const brush = brushById(doc, id);
  if (!brush || !brushUsable(doc, brush)) return 0;
  let n = 0;
  const visit = (nodeId: string) => {
    const node = doc.nodes[nodeId];
    if (!node || !node.visible) return;
    if (node.kind === "path") {
      node.stroke.kind = node.stroke.kind === "none" ? "solid" : node.stroke.kind;
      if (!(node.stroke.color && node.stroke.color !== "#000000")) node.stroke.color = "#111827";
      if (!(node.stroke.width > 0)) node.stroke.width = 1;
      node.stroke.brushId = brush.id;
      n++;
    } else if (node.kind === "group") {
      for (const child of node.children) visit(child);
    }
  };
  for (const nodeId of ids) visit(nodeId);
  return n;
}

export function removeBrushStroke(doc: VexaDoc, ids: string[]): number {
  let n = 0;
  const visit = (nodeId: string) => {
    const node = doc.nodes[nodeId];
    if (!node) return;
    if (node.kind === "path" && node.stroke.brushId) {
      delete node.stroke.brushId;
      n++;
    } else if (node.kind === "group") {
      for (const child of node.children) visit(child);
    }
  };
  for (const nodeId of ids) visit(nodeId);
  return n;
}

export function brushUsage(doc: VexaDoc, id: string): { nodes: number; styles: number } {
  let nodes = 0;
  for (const node of Object.values(doc.nodes)) {
    if (node.kind === "path" && node.stroke.brushId === id) nodes++;
  }
  for (const def of doc.symbols ?? []) {
    for (const node of Object.values(def.nodes)) {
      if (node.kind === "path" && node.stroke.brushId === id) nodes++;
    }
  }
  const styles = (doc.styles ?? []).filter((s) => s.stroke?.brushId === id).length;
  return { nodes, styles };
}

export function brushUsageCount(doc: VexaDoc, id: string): number {
  const use = brushUsage(doc, id);
  return use.nodes + use.styles;
}

function clearStroke(stroke: Stroke, id: string): boolean {
  if (stroke.brushId !== id) return false;
  delete stroke.brushId;
  return true;
}

export function deleteBrush(doc: VexaDoc, id: string): number {
  let n = 0;
  const visit = (node: Node) => {
    if (node.kind === "path") {
      if (clearStroke(node.stroke, id)) n++;
    } else if (node.kind === "group") {
      for (const child of node.children) {
        const c = doc.nodes[child];
        if (c) visit(c);
      }
    }
  };
  for (const node of Object.values(doc.nodes)) visit(node);
  for (const def of doc.symbols ?? []) {
    for (const node of Object.values(def.nodes)) visit(node);
  }
  for (const style of doc.styles ?? []) {
    if (style.stroke && clearStroke(style.stroke, id)) n++;
  }
  doc.brushes = brushesOf(doc).filter((b) => b.id !== id);
  return n;
}

/** 删除图案时一并移除引用它的画笔；返回移除的画笔数。 */
export function pruneBrushesForPattern(doc: VexaDoc, patternId: string): number {
  const list = brushesOf(doc);
  const keep = list.filter((b) => b.kind === "calligraphic" || b.patternId !== patternId);
  const removed = list.length - keep.length;
  if (removed) doc.brushes = keep;
  return removed;
}

/** 图案/艺术/散点画笔的砖印章。书法画笔返回空数组，走 calligraphyStamps。 */
export function brushStamps(doc: VexaDoc, node: PathNode, brush: BrushDef): BrushStamp[] {
  if (brush.kind === "calligraphic") return [];
  const pattern = brushPattern(doc, brush);
  if (!pattern) return [];
  if (brush.kind === "art") return artStamps(node, brush, pattern);
  if (brush.kind === "scatter") return scatterStamps(node, brush, pattern);
  return patternStamps(node, brush, pattern);
}

function patternStamps(node: PathNode, brush: BrushDef, pattern: PatternDef): BrushStamp[] {
  const step = Math.max(2, pattern.w * brush.scale * (brush.spacing / 100));
  const out: BrushStamp[] = [];
  for (const sub of node.subpaths) {
    const pts = dedupe(flatten(sub, 18), sub.closed);
    if (pts.length === 0) continue;
    if (pts.length === 1) {
      out.push(stampAt(pts[0], 0, brush.scale, brush.scale));
      continue;
    }
    let next = 0;
    const segCount = sub.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < segCount && out.length < MAX_STAMPS; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.001) continue;
      const angle = Math.atan2(dy, dx);
      while (next <= len + 0.001 && out.length < MAX_STAMPS) {
        const t = next / len;
        out.push(stampAt({ x: a.x + dx * t, y: a.y + dy * t }, angle, brush.scale, brush.scale));
        next += step;
      }
      next -= len;
      if (next < 0) next = 0;
    }
  }
  return out;
}

/** 艺术画笔：把整块砖按子路径长度切成竖向条带，条带沿路径连续铺开。 */
function artStamps(node: PathNode, brush: BrushDef, pattern: PatternDef): BrushStamp[] {
  const out: BrushStamp[] = [];
  for (const sub of node.subpaths) {
    const pts = dedupe(flatten(sub, 24), sub.closed);
    if (pts.length === 0) continue;
    if (pts.length === 1) {
      out.push(stampAt(pts[0], 0, brush.scale, brush.scale));
      continue;
    }
    const total = subLength(pts, sub.closed);
    if (total < 0.5) continue;
    const slices = Math.min(ART_SLICES, Math.max(1, Math.ceil(total / Math.max(6, pattern.h * brush.scale * 0.75))));
    const sx = total / Math.max(1, pattern.w);
    let start = 0;
    for (let k = 0; k < slices && out.length < MAX_STAMPS; k++) {
      const len = total / slices;
      const mid = start + len / 2;
      const hit = pointAtLength(pts, sub.closed, mid);
      if (hit) {
        out.push({
          x: hit.x,
          y: hit.y,
          angle: hit.angle,
          sx,
          sy: brush.scale,
          slice: { x: (pattern.w * k) / slices, w: pattern.w / slices },
        });
      }
      start += len;
    }
  }
  return out;
}

function scatterStamps(node: PathNode, brush: BrushDef, pattern: PatternDef): BrushStamp[] {
  const base = pattern.w * brush.scale;
  const step = Math.max(2, base * (brush.spacing / 100));
  const jitter = clampNumber(brush.jitter, 0, 100, 35) / 100;
  const spread = clampNumber(brush.spread, 0, 200, 40) / 100;
  const out: BrushStamp[] = [];
  let index = 0;
  for (const sub of node.subpaths) {
    const pts = dedupe(flatten(sub, 18), sub.closed);
    if (pts.length === 0) continue;
    if (pts.length === 1) {
      out.push(stampAt(pts[0], 0, brush.scale, brush.scale));
      index++;
      continue;
    }
    let next = 0;
    const segCount = sub.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < segCount && out.length < MAX_STAMPS; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.001) continue;
      const angle = Math.atan2(dy, dx);
      const nx = -Math.sin(angle);
      const ny = Math.cos(angle);
      while (next <= len + 0.001 && out.length < MAX_STAMPS) {
        const t = next / len;
        const r1 = hashUnit(`${node.id}:${index}:a`);
        const r2 = hashUnit(`${node.id}:${index}:b`);
        const r3 = hashUnit(`${node.id}:${index}:c`);
        const r4 = hashUnit(`${node.id}:${index}:d`);
        const off = (r1 * 2 - 1) * spread * base;
        const sc = brush.scale * (1 + (r2 * 2 - 1) * jitter * 0.55);
        out.push({
          x: a.x + dx * t + nx * off,
          y: a.y + dy * t + ny * off,
          angle: angle + (r3 * 2 - 1) * jitter * Math.PI * 0.75,
          sx: Math.max(0.08, sc),
          sy: Math.max(0.08, sc * (1 + (r4 * 2 - 1) * jitter * 0.35)),
        });
        index++;
        next += step;
      }
      next -= len;
      if (next < 0) next = 0;
    }
  }
  return out;
}

/** 书法画笔：用固定角度的椭圆笔尖沿路径连续盖章，椭圆角度不跟路径转。 */
export function calligraphyStamps(node: PathNode, brush: BrushDef): CalligraphyStamp[] {
  const width = Math.max(0.5, node.stroke.width * clampScale(brush.scale));
  const rx = width / 2;
  const round = clampNumber(brush.roundness, 0, 100, 35) / 100;
  const ry = Math.max(0.35, rx * (0.04 + round * 0.96));
  const angle = (clampNumber(brush.angle, 0, 180, 120) * Math.PI) / 180;
  const step = Math.max(1.2, Math.min(rx, ry) * 0.42);
  const out: CalligraphyStamp[] = [];
  for (const sub of node.subpaths) {
    const pts = dedupe(flatten(sub, 24), sub.closed);
    if (pts.length === 0) continue;
    if (pts.length === 1) {
      out.push({ x: pts[0].x, y: pts[0].y, angle, rx, ry });
      continue;
    }
    const total = subLength(pts, sub.closed);
    if (total < 0.2) continue;
    for (let d = 0; d <= total + 0.001 && out.length < MAX_CALLIG_STAMPS; d += step) {
      const hit = pointAtLength(pts, sub.closed, d);
      if (hit) out.push({ x: hit.x, y: hit.y, angle, rx, ry });
    }
  }
  return out;
}

/** 清理引用与非法定义：画笔缺失的描边、图案缺失的画笔一并降级。 */
export function normalizeBrushes(doc: VexaDoc): void {
  if (!Array.isArray(doc.brushes)) {
    delete doc.brushes;
    return;
  }
  const patterns = new Set((doc.patterns ?? []).map((p) => p.id));
  const seen = new Set<string>();
  const list: BrushDef[] = [];
  for (const raw of doc.brushes) {
    if (!raw || typeof raw !== "object") continue;
    const id = typeof raw.id === "string" && ID_RE.test(raw.id) ? raw.id : "";
    if (!id || seen.has(id)) continue;
    const kind: BrushKind = KIND_LIST.includes(raw.kind) ? raw.kind : "pattern";
    if (kind !== "calligraphic" && (typeof raw.patternId !== "string" || !patterns.has(raw.patternId))) continue;
    seen.add(id);
    list.push({
      id,
      name: cleanName(raw.name) || `画笔 ${list.length + 1}`,
      kind,
      ...(kind === "calligraphic" ? {} : { patternId: raw.patternId }),
      scale: clampScale(Number(raw.scale)),
      spacing: clampSpacing(Number(raw.spacing)),
      angle: clampNumber(Number(raw.angle), 0, 180, 120),
      roundness: clampNumber(Number(raw.roundness), 0, 100, 35),
      jitter: clampNumber(Number(raw.jitter), 0, 100, 35),
      spread: clampNumber(Number(raw.spread), 0, 200, 40),
      rev: Math.max(1, Math.round(Number(raw.rev) || 1)),
    });
  }
  doc.brushes = list.slice(0, MAX_BRUSHES);
}

export function cleanBrushLinks(doc: VexaDoc): void {
  const ids = new Set(brushesOf(doc).map((b) => b.id));
  const visit = (node: Node) => {
    if (node.kind === "path") {
      if (node.stroke.brushId && !ids.has(node.stroke.brushId)) delete node.stroke.brushId;
    } else if (node.kind === "group") {
      for (const child of node.children) {
        const c = doc.nodes[child];
        if (c) visit(c);
      }
    }
  };
  for (const node of Object.values(doc.nodes)) visit(node);
  for (const def of doc.symbols ?? []) for (const node of Object.values(def.nodes)) visit(node);
  for (const style of doc.styles ?? []) {
    if (style.stroke?.brushId && !ids.has(style.stroke.brushId)) delete style.stroke.brushId;
  }
}

function stampAt(p: Pt, angle: number, sx: number, sy: number): BrushStamp {
  return { x: p.x, y: p.y, angle, sx, sy };
}

function subLength(pts: Pt[], closed: boolean): number {
  const segCount = closed ? pts.length : pts.length - 1;
  let total = 0;
  for (let i = 0; i < segCount; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

function pointAtLength(pts: Pt[], closed: boolean, distance: number): { x: number; y: number; angle: number } | undefined {
  let left = Math.max(0, distance);
  const segCount = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < segCount; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) continue;
    if (left <= len) {
      const t = left / len;
      return { x: a.x + dx * t, y: a.y + dy * t, angle: Math.atan2(dy, dx) };
    }
    left -= len;
  }
  const last = pts[pts.length - 1];
  return last ? { x: last.x, y: last.y, angle: 0 } : undefined;
}

function hashUnit(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x21f0aaad);
  h ^= h >>> 15;
  h = Math.imul(h, 0x735a2d97);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967295;
}

function cleanName(name: unknown): string {
  return typeof name === "string" ? name.trim().slice(0, 24) : "";
}

function clampScale(n: number): number {
  return Math.min(10, Math.max(0.1, Number.isFinite(n) && n > 0 ? n : 1));
}

function clampSpacing(n: number): number {
  return Math.min(400, Math.max(20, Number.isFinite(n) && n > 0 ? n : 100));
}

function clampNumber(n: number | undefined, min: number, max: number, fallback: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(n) ? (n as number) : fallback));
}

function dedupe(pts: Pt[], closed: boolean): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.001) out.push(p);
  }
  if (closed && out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.hypot(a.x - b.x, a.y - b.y) <= 0.001) out.pop();
  }
  return out;
}
