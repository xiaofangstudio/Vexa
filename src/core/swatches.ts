/** 文档色板：全局色（process）与专色（spot），以及填充/描边链接更新。 */
import type { Paint, Stroke, Swatch, SwatchKind, VexaDoc } from "./types";

export const MAX_SWATCHES = 64;

const HEX_RE = /^#[0-9a-f]{6}$/i;
const ID_RE = /^[a-z0-9_-]{1,32}$/i;

export const SWATCH_KINDS: Array<{ id: SwatchKind; label: string }> = [
  { id: "process", label: "印刷色" },
  { id: "spot", label: "专色" },
];

export function normalizeHex(color: string): string | null {
  return HEX_RE.test(color) ? color.toLowerCase() : null;
}

export function swatchesOf(doc: VexaDoc): Swatch[] {
  return Array.isArray(doc.swatches) ? doc.swatches : [];
}

export function swatchById(doc: VexaDoc, id: string | undefined): Swatch | undefined {
  if (!id) return undefined;
  return swatchesOf(doc).find((s) => s.id === id);
}

/** 清洗任意输入，保住名字/颜色/类型，限制 64 个并给缺失 id 补 sN。 */
export function normalizeSwatches(input: unknown): Swatch[] {
  if (!Array.isArray(input)) return [];
  const out: Swatch[] = [];
  for (let i = 0; i < input.length && out.length < MAX_SWATCHES; i++) {
    const raw = input[i] as Partial<Swatch> | null;
    if (!raw || typeof raw !== "object") continue;
    const color = typeof raw.color === "string" ? normalizeHex(raw.color) : null;
    if (!color) continue;
    let id = typeof raw.id === "string" && ID_RE.test(raw.id) ? raw.id : `s${i + 1}`;
    while (out.some((s) => s.id === id)) id = `${id}_${out.length + 1}`;
    const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 24) : `色板 ${out.length + 1}`;
    const kind: SwatchKind = raw.kind === "spot" ? "spot" : "process";
    out.push({ id, name, color, kind });
  }
  return out;
}

function nextId(doc: VexaDoc): string {
  const used = new Set(swatchesOf(doc).map((s) => s.id));
  let n = 1;
  while (used.has(`s${n}`)) n++;
  return `s${n}`;
}

export interface SwatchResult {
  ok: boolean;
  swatch?: Swatch;
  error?: string;
}

export function addSwatch(doc: VexaDoc, input: { name?: string; color: string; kind?: SwatchKind }): SwatchResult {
  if (swatchesOf(doc).length >= MAX_SWATCHES) return { ok: false, error: `最多保存 ${MAX_SWATCHES} 个色板` };
  const color = normalizeHex(input.color);
  if (!color) return { ok: false, error: "色板颜色需为 6 位十六进制" };
  const name = input.name?.trim().slice(0, 24) || `色板 ${swatchesOf(doc).length + 1}`;
  if (swatchesOf(doc).some((s) => s.name === name && s.color === color)) {
    return { ok: false, error: "同名同色色板已存在" };
  }
  const swatch: Swatch = { id: nextId(doc), name, color, kind: input.kind === "spot" ? "spot" : "process" };
  if (!doc.swatches) doc.swatches = [];
  doc.swatches.push(swatch);
  return { ok: true, swatch };
}

/** 改色板；同名色板仍允许重名，但名称/颜色必须合法。 */
export function updateSwatch(doc: VexaDoc, id: string, patch: Partial<Pick<Swatch, "name" | "color" | "kind">>): SwatchResult {
  const swatch = swatchById(doc, id);
  if (!swatch) return { ok: false, error: "色板不存在" };
  if (patch.color !== undefined) {
    const color = normalizeHex(patch.color);
    if (!color) return { ok: false, error: "色板颜色需为 6 位十六进制" };
    if (color !== swatch.color) {
      swatch.color = color;
      recolorSwatch(doc, id, color);
    }
  }
  if (patch.name !== undefined) {
    const name = patch.name.trim().slice(0, 24);
    if (!name) return { ok: false, error: "色板名称不能为空" };
    swatch.name = name;
  }
  if (patch.kind !== undefined) swatch.kind = patch.kind === "spot" ? "spot" : "process";
  return { ok: true, swatch };
}

export function deleteSwatch(doc: VexaDoc, id: string): boolean {
  const list = swatchesOf(doc);
  const at = list.findIndex((s) => s.id === id);
  if (at < 0) return false;
  list.splice(at, 1);
  unlinkSwatch(doc, id);
  return true;
}

/** 把填充改成该实色并记下链接；透明度保留。 */
export function linkFill(paint: Paint, swatch: Swatch): void {
  paint.kind = "solid";
  paint.color = swatch.color;
  paint.swatch = swatch.id;
  delete paint.grad;
}

/** 描边同理。 */
export function linkStroke(stroke: Stroke, swatch: Swatch): void {
  stroke.kind = "solid";
  stroke.color = swatch.color;
  stroke.swatch = swatch.id;
  delete stroke.grad;
}

/** 把选中对象（组递归）的填充或描边套用色板；返回改到的 paint 数。 */
export function applySwatchToNodes(doc: VexaDoc, ids: string[], swatchId: string, target: "fill" | "stroke"): number {
  const swatch = swatchById(doc, swatchId);
  if (!swatch) return 0;
  let count = 0;
  const walk = (id: string) => {
    const n = doc.nodes[id];
    if (!n) return;
    if (n.kind === "group") {
      for (const child of n.children) walk(child);
      return;
    }
    if ((n.kind === "path" || n.kind === "text") && target === "fill") {
      linkFill(n.fill, swatch);
      count++;
    }
    if (n.kind === "path" && target === "stroke") {
      linkStroke(n.stroke, swatch);
      count++;
    }
  };
  for (const id of ids) walk(id);
  return count;
}

export interface SwatchUsage {
  fills: number;
  strokes: number;
  total: number;
}

export function swatchUsage(doc: VexaDoc, id: string): SwatchUsage {
  let fills = 0;
  let strokes = 0;
  for (const n of Object.values(doc.nodes)) {
    if (n.kind === "path" || n.kind === "text") {
      if (n.fill.swatch === id) fills++;
    }
    if (n.kind === "path" && n.stroke.swatch === id) strokes++;
  }
  return { fills, strokes, total: fills + strokes };
}

/** 改一个色板的颜色，所有链接的填充/描边同步换色，返回改动数。 */
export function recolorSwatch(doc: VexaDoc, id: string, color: string): number {
  const hex = normalizeHex(color);
  if (!hex) return 0;
  let count = 0;
  for (const n of Object.values(doc.nodes)) {
    if (n.kind === "path" || n.kind === "text") {
      if (n.fill.swatch === id) {
        n.fill.color = hex;
        if (n.fill.kind !== "solid") n.fill.kind = "solid";
        count++;
      }
    }
    if (n.kind === "path" && n.stroke.swatch === id) {
      n.stroke.color = hex;
      if (n.stroke.kind !== "none") n.stroke.kind = "solid";
      delete n.stroke.grad;
      count++;
    }
  }
  return count;
}

/** 删色板时清掉所有引用，避免留下悬空 id。 */
export function unlinkSwatch(doc: VexaDoc, id: string): number {
  let count = 0;
  for (const n of Object.values(doc.nodes)) {
    if ((n.kind === "path" || n.kind === "text") && n.fill.swatch === id) {
      delete n.fill.swatch;
      count++;
    }
    if (n.kind === "path" && n.stroke.swatch === id) {
      delete n.stroke.swatch;
      count++;
    }
  }
  return count;
}

export function exportSwatchesText(doc: VexaDoc): string {
  return JSON.stringify({ format: "vexa-swatches", version: 1, swatches: swatchesOf(doc) }, null, 2);
}

export interface ParsedSwatches {
  list: Swatch[];
  error?: string;
}

/** 接受 Vexa 色板文件或直接色板数组；导入只做清洗，不合并。 */
export function parseSwatchesJSON(text: string): ParsedSwatches {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { list: [], error: "JSON 解析失败" };
  }
  if (Array.isArray(data)) {
    const list = normalizeSwatches(data);
    return list.length ? { list } : { list: [], error: "文件里没有可用色板" };
  }
  if (!data || typeof data !== "object") return { list: [], error: "不是 Vexa 色板文件" };
  const obj = data as { format?: unknown; swatches?: unknown };
  if (obj.format !== "vexa-swatches") return { list: [], error: "不是 Vexa 色板文件" };
  const list = normalizeSwatches(obj.swatches);
  return list.length ? { list } : { list: [], error: "文件里没有可用色板" };
}

export interface MergeSwatchesResult {
  added: number;
  error?: string;
}

/** 导入合并：同名称+同颜色跳过，受 64 个上限约束。 */
export function mergeSwatches(doc: VexaDoc, list: Swatch[]): MergeSwatchesResult {
  let added = 0;
  for (const s of list) {
    if (swatchesOf(doc).length >= MAX_SWATCHES) return { added, error: `最多保存 ${MAX_SWATCHES} 个色板` };
    if (swatchesOf(doc).some((e) => e.name === s.name && e.color === s.color)) continue;
    const result = addSwatch(doc, { name: s.name, color: s.color, kind: s.kind });
    if (result.ok) added++;
  }
  return { added };
}
