/** 自定义画板预设：校验、去重、增删、合并与 JSON 导入导出。 */

import type { BoardPreset } from "./artboards";

export const MAX_CUSTOM_PRESETS = 20;
export const MAX_PRESET_SIZE = 20000;
const MAX_LABEL = 18;

export interface PresetInput {
  label: string;
  width: number;
  height: number;
}

export interface AddPresetResult {
  list: BoardPreset[];
  preset: BoardPreset | null;
  error: string | null;
}

export interface ImportPresetResult {
  list: BoardPreset[];
  added: number;
  error: string | null;
}

function presetNote(w: number, h: number): string {
  return `${w} × ${h}`;
}

function sizeOf(preset: { w?: unknown; h?: unknown; width?: unknown; height?: unknown }): [number, number] | null {
  const w = Math.round(Number(preset.w ?? preset.width));
  const h = Math.round(Number(preset.h ?? preset.height));
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
  if (w < 1 || h < 1 || w > MAX_PRESET_SIZE || h > MAX_PRESET_SIZE) return null;
  return [w, h];
}

function validLabel(raw: unknown, fallback: string): string {
  const label = typeof raw === "string" ? raw.trim() : "";
  return (label || fallback).slice(0, MAX_LABEL);
}

function nextId(list: BoardPreset[], idFactory?: () => string): string {
  const used = new Set(list.map((p) => p.id));
  for (let i = 0; i < 20; i++) {
    const id = idFactory?.() ?? `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    if (id.startsWith("custom-") && !used.has(id)) return id;
  }
  let i = list.length + 1;
  while (used.has(`custom-${i}`)) i++;
  return `custom-${i}`;
}

/** 读取本地/JSON 数据时清洗：忽略非法项、按尺寸去重、补齐 id 与说明。 */
export function sanitizeCustomPresets(raw: unknown): BoardPreset[] {
  if (!Array.isArray(raw)) return [];
  const out: BoardPreset[] = [];
  const sizes = new Set<string>();
  const ids = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const src = item as { w?: unknown; h?: unknown; width?: unknown; height?: unknown; label?: unknown; id?: unknown };
    const size = sizeOf(src);
    if (!size) continue;
    const [w, h] = size;
    const key = `${w}x${h}`;
    if (sizes.has(key)) continue;
    sizes.add(key);
    let id = typeof src.id === "string" ? src.id.trim() : "";
    if (!id.startsWith("custom-") || ids.has(id)) id = `custom-${w}x${h}-${out.length + 1}`;
    while (ids.has(id)) id = `custom-${w}x${h}-${out.length + 1}-${ids.size}`;
    ids.add(id);
    out.push({
      id,
      label: validLabel(src.label, `自定义 ${out.length + 1}`),
      note: presetNote(w, h),
      w,
      h,
    });
    if (out.length >= MAX_CUSTOM_PRESETS) break;
  }
  return out;
}

export function findPresetBySize(list: BoardPreset[], w: number, h: number): BoardPreset | null {
  return list.find((p) => p.w === w && p.h === h) ?? null;
}

export function addCustomPreset(
  list: BoardPreset[],
  input: PresetInput,
  idFactory?: () => string,
): AddPresetResult {
  const size = sizeOf({ width: input.width, height: input.height });
  if (!size) {
    return { list, preset: null, error: "尺寸需为 1–20000 的整数" };
  }
  const [w, h] = size;
  if (findPresetBySize(list, w, h)) {
    return { list, preset: null, error: "该尺寸已在预设中" };
  }
  if (list.length >= MAX_CUSTOM_PRESETS) {
    return { list, preset: null, error: `最多保存 ${MAX_CUSTOM_PRESETS} 个自定义预设` };
  }
  const preset: BoardPreset = {
    id: nextId(list, idFactory),
    label: validLabel(input.label, `自定义 ${list.length + 1}`),
    note: presetNote(w, h),
    w,
    h,
  };
  return { list: [...list, preset], preset, error: null };
}

export function removeCustomPreset(list: BoardPreset[], id: string): BoardPreset[] {
  return list.filter((p) => p.id !== id);
}

/** 导入时保留已有项，只补充尺寸不重复的项，仍受 20 个上限约束。 */
export function mergeCustomPresets(existing: BoardPreset[], incoming: BoardPreset[]): BoardPreset[] {
  let list = sanitizeCustomPresets(existing);
  for (const p of incoming) {
    if (findPresetBySize(list, p.w, p.h)) continue;
    if (list.length >= MAX_CUSTOM_PRESETS) break;
    const added = addCustomPreset(list, { label: p.label, width: p.w, height: p.h });
    if (!added.error && added.preset) list = added.list;
  }
  return list;
}

export interface PresetFile {
  format: "vexa-board-presets";
  version: 1;
  presets: Array<{ label: string; w: number; h: number }>;
}

export function exportPresetsJSON(list: BoardPreset[]): string {
  const payload: PresetFile = {
    format: "vexa-board-presets",
    version: 1,
    presets: sanitizeCustomPresets(list).map((p) => ({ label: p.label, w: p.w, h: p.h })),
  };
  return JSON.stringify(payload, null, 2);
}

export function parsePresetsJSON(text: string): ImportPresetResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { list: [], added: 0, error: "JSON 解析失败" };
  }
  if (Array.isArray(data)) {
    const list = sanitizeCustomPresets(data);
    return list.length
      ? { list, added: list.length, error: null }
      : { list: [], added: 0, error: "文件里没有可用预设" };
  }
  if (!data || typeof data !== "object") {
    return { list: [], added: 0, error: "文件里没有可用预设" };
  }
  const obj = data as { format?: unknown; presets?: unknown };
  if (obj.format !== undefined && obj.format !== "vexa-board-presets") {
    return { list: [], added: 0, error: "不是 Vexa 画板预设文件" };
  }
  const list = sanitizeCustomPresets(obj.presets);
  return list.length
    ? { list, added: list.length, error: null }
    : { list: [], added: 0, error: "文件里没有可用预设" };
}
