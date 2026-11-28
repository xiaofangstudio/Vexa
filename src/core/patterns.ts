/** 图案填充：捕获矢量砖、套用到路径/文字、砖排平铺、重定义与删除。 */
import { nodeBox } from "./geom";
import { captureArtwork, cleanDefNode } from "./symbols";
import type { Node, PatternDef, PatternTile, Paint, VexaDoc } from "./types";
import { solid } from "./types";

export const MAX_PATTERNS = 32;
const ID_RE = /^[a-z0-9_-]{1,32}$/i;

export function patternsOf(doc: VexaDoc): PatternDef[] {
  return Array.isArray(doc.patterns) ? doc.patterns : [];
}

export function patternById(doc: VexaDoc, id: string | undefined): PatternDef | undefined {
  if (!id) return undefined;
  return patternsOf(doc).find((p) => p.id === id);
}

/** 选中对象里是否存在可填色的路径或文字（组会继续下钻）。 */
export function canPatternFill(doc: VexaDoc, ids: string[]): boolean {
  const visit = (id: string, depth = 0): boolean => {
    if (depth > 16) return false;
    const n = doc.nodes[id];
    if (!n) return false;
    if (n.kind === "path" || n.kind === "text") return true;
    if (n.kind === "group") return n.children.some((c) => visit(c, depth + 1));
    return false;
  };
  return ids.some((id) => visit(id));
}

function clamp(n: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function cleanPaint(p: Paint | undefined): Paint | undefined {
  if (!p || typeof p !== "object") return p;
  if (p.kind === "pattern") {
    if (!p.patternId || !ID_RE.test(p.patternId)) return solid(p.color || "#0f76d6", p.opacity ?? 1);
    p.patternScale = clamp(p.patternScale ?? 1, 0.05, 20, 1);
    delete p.grad;
    delete p.swatch;
  } else {
    delete p.patternId;
    delete p.patternScale;
  }
  return p;
}

function stripPatternFills(nodes: Record<string, Node>): void {
  for (const n of Object.values(nodes)) {
    if (n.kind === "path" || n.kind === "text") {
      const fill = n.fill;
      if (fill?.kind === "pattern") n.fill = solid(fill.color || "#0f76d6", fill.opacity ?? 1);
      else if (fill) cleanPaint(fill);
    }
  }
}

function collectParents(nodes: Record<string, Node>): Map<string, string> {
  const parent = new Map<string, string>();
  for (const n of Object.values(nodes)) {
    if (n.kind === "group") for (const c of n.children) parent.set(c, n.id);
  }
  return parent;
}

/** 清洗图案定义：补 id、限制数量、剔除悬空节点并断开图案内嵌图案（避免递归）。 */
export function normalizePatterns(doc: VexaDoc): void {
  const raw = Array.isArray(doc.patterns) ? doc.patterns : [];
  const out: PatternDef[] = [];
  const ids = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object" || !ID_RE.test(item.id) || ids.has(item.id)) continue;
    ids.add(item.id);
    const w = clamp(item.w, 1, 4000, 40);
    const h = clamp(item.h, 1, 4000, 40);
    const nodes: Record<string, Node> = {};
    if (item.nodes && typeof item.nodes === "object") {
      for (const node of Object.values(item.nodes)) {
        if (!node || typeof node !== "object") continue;
        const clean = cleanDefNode(node);
        if (clean) nodes[clean.id] = clean;
      }
    }
    stripPatternFills(nodes);
    let root = Array.isArray(item.root) ? item.root.filter((id) => !!nodes[id]) : [];
    if (!root.length && Object.keys(nodes).length) {
      const parent = collectParents(nodes);
      root = Object.keys(nodes).filter((id) => !parent.has(id));
    }
    out.push({
      id: item.id,
      name: typeof item.name === "string" && item.name.trim() ? item.name.trim().slice(0, 24) : "图案",
      w,
      h,
      tile: item.tile === "brick" ? "brick" : "grid",
      nodes,
      root,
      rev: Number.isFinite(item.rev) ? Math.max(1, Math.round(item.rev as number)) : 1,
    });
    if (out.length >= MAX_PATTERNS) break;
  }
  doc.patterns = out;
}

/** 清洗整个文档里指向不存在图案的填充，同时修正缩放范围。 */
export function cleanPatternLinks(doc: VexaDoc): void {
  const ids = new Set(patternsOf(doc).map((p) => p.id));
  const visit = (nodes: Record<string, Node>): void => {
    for (const n of Object.values(nodes)) {
      if (n.kind !== "path" && n.kind !== "text") continue;
      const fill = n.fill;
      if (!fill) continue;
      if (fill.kind === "pattern" && (!fill.patternId || !ids.has(fill.patternId))) {
        n.fill = solid(fill.color || "#0f76d6", fill.opacity ?? 1);
      } else if (fill.kind === "pattern") {
        fill.patternScale = clamp(fill.patternScale ?? 1, 0.05, 20, 1);
        fill.color = fill.color || "#0f76d6";
        fill.opacity = clamp(fill.opacity ?? 1, 0, 1, 1);
      } else {
        delete fill.patternId;
        delete fill.patternScale;
      }
    }
  };
  visit(doc.nodes);
  for (const s of doc.symbols ?? []) visit(s.nodes);
  for (const s of doc.styles ?? []) {
    if (s.fill?.kind === "pattern" && (!s.fill.patternId || !ids.has(s.fill.patternId))) {
      s.fill = solid(s.fill.color || "#0f76d6", s.fill.opacity ?? 1);
    } else if (s.fill) {
      if (s.fill.kind === "pattern") s.fill.patternScale = clamp(s.fill.patternScale ?? 1, 0.05, 20, 1);
      else {
        delete s.fill.patternId;
        delete s.fill.patternScale;
      }
    }
  }
}

function nextPatternId(doc: VexaDoc): string {
  let n = 1;
  while (doc.nodes[`pat${n}`] || patternsOf(doc).some((p) => p.id === `pat${n}`)) n++;
  return `pat${n}`;
}

/** 从选中对象创建图案砖；选中对象需有共同包围盒且不能是符号实例。 */
export function addPattern(
  doc: VexaDoc,
  ids: string[],
  name?: string,
  tile: PatternTile = "grid",
): { ok: boolean; pattern?: PatternDef; error?: string } {
  if (patternsOf(doc).length >= MAX_PATTERNS) return { ok: false, error: `最多 ${MAX_PATTERNS} 个图案` };
  const art = captureArtwork(doc, ids);
  if (!art) return { ok: false, error: "请选中可转为图案的路径、文字或组" };
  stripPatternFills(art.nodes);
  const id = nextPatternId(doc);
  const def: PatternDef = {
    id,
    name: (name || "").trim().slice(0, 24) || `图案 ${patternsOf(doc).length + 1}`,
    w: Math.max(4, Math.round(art.w * 100) / 100),
    h: Math.max(4, Math.round(art.h * 100) / 100),
    tile,
    nodes: art.nodes,
    root: art.root,
    rev: 1,
  };
  doc.patterns = [...patternsOf(doc), def];
  return { ok: true, pattern: def };
}

export function renamePattern(doc: VexaDoc, id: string, name: string): boolean {
  const def = patternById(doc, id);
  const trimmed = name.trim().slice(0, 24);
  if (!def || !trimmed) return false;
  def.name = trimmed;
  return true;
}

export function setPatternTile(doc: VexaDoc, id: string, tile: PatternTile): boolean {
  const def = patternById(doc, id);
  if (!def) return false;
  def.tile = tile === "brick" ? "brick" : "grid";
  def.rev = (def.rev ?? 1) + 1;
  return true;
}

/** 用当前选中对象替换图案砖内容；实例引用不变，画布立即换图。 */
export function redefinePattern(doc: VexaDoc, id: string, ids: string[]): boolean {
  const def = patternById(doc, id);
  const art = captureArtwork(doc, ids);
  if (!def || !art) return false;
  stripPatternFills(art.nodes);
  def.w = Math.max(4, Math.round(art.w * 100) / 100);
  def.h = Math.max(4, Math.round(art.h * 100) / 100);
  def.nodes = art.nodes;
  def.root = art.root;
  def.rev = (def.rev ?? 1) + 1;
  return true;
}

/** 把图案套到选中路径/文字；组会递归处理其子对象。 */
export function applyPatternFill(doc: VexaDoc, ids: string[], id: string, scale = 1): number {
  const def = patternById(doc, id);
  if (!def) return 0;
  let count = 0;
  const visit = (nodeId: string, depth = 0): void => {
    if (depth > 16) return;
    const n = doc.nodes[nodeId];
    if (!n) return;
    if (n.kind === "path" || n.kind === "text") {
      n.fill = {
        kind: "pattern",
        color: n.fill?.color || "#0f76d6",
        opacity: n.fill?.opacity ?? 1,
        patternId: id,
        patternScale: clamp(scale, 0.05, 20, 1),
      };
      count++;
    } else if (n.kind === "group") {
      for (const c of n.children) visit(c, depth + 1);
    }
  };
  for (const nodeId of ids) visit(nodeId);
  return count;
}

export function patternUsage(doc: VexaDoc, id: string): number {
  let count = 0;
  const scan = (nodes: Record<string, Node>): void => {
    for (const n of Object.values(nodes)) {
      if ((n.kind === "path" || n.kind === "text") && n.fill?.kind === "pattern" && n.fill.patternId === id) count++;
    }
  };
  scan(doc.nodes);
  for (const s of doc.symbols ?? []) scan(s.nodes);
  for (const s of doc.styles ?? []) if (s.fill?.kind === "pattern" && s.fill.patternId === id) count++;
  return count;
}

/** 删除图案并把所有引用降级为原来的近似实色，避免留下悬空填充。 */
export function deletePattern(doc: VexaDoc, id: string): number {
  let replaced = 0;
  const visit = (nodes: Record<string, Node>): void => {
    for (const n of Object.values(nodes)) {
      if (n.kind !== "path" && n.kind !== "text") continue;
      const fill = n.fill;
      if (fill?.kind === "pattern" && fill.patternId === id) {
        n.fill = solid(fill.color || "#0f76d6", fill.opacity ?? 1);
        replaced++;
      }
    }
  };
  visit(doc.nodes);
  for (const s of doc.symbols ?? []) visit(s.nodes);
  for (const s of doc.styles ?? []) {
    if (s.fill?.kind === "pattern" && s.fill.patternId === id) {
      s.fill = solid(s.fill.color || "#0f76d6", s.fill.opacity ?? 1);
      replaced++;
    }
  }
  doc.patterns = patternsOf(doc).filter((p) => p.id !== id);
  return replaced;
}

/** 图案砖内容的包围盒，用于面板缩略图尺寸与调试。 */
export function patternContentBox(def: PatternDef): { x: number; y: number; w: number; h: number } {
  let box: { x: number; y: number; w: number; h: number } | null = null;
  for (const id of def.root) {
    const n = def.nodes[id];
    if (!n) continue;
    const b = nodeBox(n);
    box = box
      ? {
          x: Math.min(box.x, b.x),
          y: Math.min(box.y, b.y),
          w: Math.max(box.x + box.w, b.x + b.w) - Math.min(box.x, b.x),
          h: Math.max(box.y + box.h, b.y + b.h) - Math.min(box.y, b.y),
        }
      : b;
  }
  return box ?? { x: 0, y: 0, w: def.w, h: def.h };
}
