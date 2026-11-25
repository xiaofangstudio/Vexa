/** 自定义画板预设的本地持久化与订阅。 */
import { useSyncExternalStore } from "react";
import type { BoardPreset } from "../core/artboards";
import {
  addCustomPreset,
  exportPresetsJSON,
  mergeCustomPresets,
  parsePresetsJSON,
  removeCustomPreset,
  sanitizeCustomPresets,
  type PresetInput,
} from "../core/boardPresets";

const STORAGE_KEY = "vexa.board-presets.v1";
const listeners = new Set<() => void>();
let presets: BoardPreset[] | null = null;

function readStorage(): BoardPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return sanitizeCustomPresets(JSON.parse(raw));
  } catch {
    return [];
  }
}

function getList(): BoardPreset[] {
  if (presets === null) presets = readStorage();
  return presets;
}

function writeStorage(next: BoardPreset[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 本地存储不可用时仍保留本次会话内存状态
  }
}

function publish(next: BoardPreset[]): void {
  presets = next;
  writeStorage(next);
  for (const cb of listeners) cb();
}

export function subscribeCustomPresets(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function customPresetsSnapshot(): BoardPreset[] {
  return getList();
}

export function useCustomPresets(): BoardPreset[] {
  return useSyncExternalStore(subscribeCustomPresets, customPresetsSnapshot, customPresetsSnapshot);
}

export function addPreset(input: PresetInput): { preset: BoardPreset | null; error: string | null } {
  const result = addCustomPreset(getList(), input);
  if (!result.error && result.preset) publish(result.list);
  return { preset: result.preset, error: result.error };
}

export function deletePreset(id: string): void {
  publish(removeCustomPreset(getList(), id));
}

export function importPresets(text: string): { added: number; error: string | null } {
  const parsed = parsePresetsJSON(text);
  if (parsed.error) return { added: 0, error: parsed.error };
  const before = getList().length;
  const merged = mergeCustomPresets(getList(), parsed.list);
  publish(merged);
  const added = merged.length - before;
  return {
    added,
    error: added ? null : "这些尺寸都已在预设中",
  };
}

export function exportPresetsText(): string {
  return exportPresetsJSON(getList());
}

/** 测试与重置用：清空内存与本地存储。 */
export function resetCustomPresets(): void {
  presets = [];
  writeStorage([]);
  for (const cb of listeners) cb();
}
