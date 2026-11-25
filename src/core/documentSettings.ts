/** 文档设置：读取、校验并应用文档名称、画板名称/尺寸/背景。 */

import type { VexaDoc } from "./types";

export interface DocSettings {
  name: string;
  boardName: string;
  width: number;
  height: number;
  background: string;
}

export interface DocSettingsStats {
  artboards: number;
  nodes: number;
  roots: number;
}

export interface ApplyDocSettingsResult {
  ok: boolean;
  error?: string;
}

const MIN_SIZE = 1;
const MAX_SIZE = 20000;

export function readDocSettings(doc: VexaDoc, index: number): DocSettings | null {
  const board = doc.artboards[index];
  if (!board) return null;
  return {
    name: doc.name,
    boardName: board.name,
    width: Math.round(board.w),
    height: Math.round(board.h),
    background: board.bg,
  };
}

export function docSettingsStats(doc: VexaDoc): DocSettingsStats {
  return {
    artboards: doc.artboards.length,
    nodes: Object.keys(doc.nodes).length,
    roots: doc.root.length,
  };
}

/** 空名称回退到稳定默认值；尺寸取整并限制在 1–20000。 */
export function normalizeDocSettings(patch: DocSettings, index: number): DocSettings {
  return {
    name: patch.name.trim() || "未命名",
    boardName: patch.boardName.trim() || `画板 ${index + 1}`,
    width: clampSize(patch.width),
    height: clampSize(patch.height),
    background: /^#[0-9a-f]{6}$/i.test(patch.background) ? patch.background.toLowerCase() : "#ffffff",
  };
}

export function applyDocSettings(doc: VexaDoc, index: number, patch: DocSettings): ApplyDocSettingsResult {
  const board = doc.artboards[index];
  if (!board) return { ok: false, error: "画板不存在" };
  const bad = badSize(patch.width, patch.height);
  if (bad) return { ok: false, error: bad };
  const next = normalizeDocSettings(patch, index);
  doc.name = next.name;
  board.name = next.boardName;
  board.w = next.width;
  board.h = next.height;
  board.bg = next.background;
  return { ok: true };
}

/** 表单即时校验，和 apply 使用同一组边界。 */
export function validateDocSettings(patch: DocSettings): string | null {
  if (!Number.isFinite(patch.width) || !Number.isFinite(patch.height)) return "尺寸必须是数字";
  if (patch.width < MIN_SIZE || patch.height < MIN_SIZE) return "画板尺寸不能小于 1 px";
  if (patch.width > MAX_SIZE || patch.height > MAX_SIZE) return "画板尺寸不能超过 20000 px";
  if (!/^#[0-9a-f]{6}$/i.test(patch.background)) return "背景色需为 6 位十六进制";
  return null;
}

function badSize(w: number, h: number): string | null {
  if (!Number.isFinite(w) || !Number.isFinite(h)) return "尺寸必须是数字";
  if (w < MIN_SIZE || h < MIN_SIZE) return "画板尺寸不能小于 1 px";
  if (w > MAX_SIZE || h > MAX_SIZE) return "画板尺寸不能超过 20000 px";
  return null;
}

function clampSize(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(n)));
}
