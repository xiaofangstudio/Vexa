/** 文件 IO：原生对话框 + Rust 侧读写/描摹。所有路径都在本机，不经网络。 */
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { docToSVG } from "../core/svg";
import type { VexaDoc } from "../core/types";

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function pickVexOpen(): Promise<string | null> {
  if (!isTauri()) return null;
  const r = await openDialog({
    title: "打开 Vexa 工程",
    multiple: false,
    filters: [{ name: "Vexa 工程", extensions: ["vex"] }],
  });
  return typeof r === "string" ? r : null;
}

export async function pickVexSave(defaultName: string): Promise<string | null> {
  if (!isTauri()) return null;
  const r = await saveDialog({
    title: "保存 Vexa 工程",
    defaultPath: `${defaultName || "未命名"}.vex`,
    filters: [{ name: "Vexa 工程", extensions: ["vex"] }],
  });
  return typeof r === "string" ? r : null;
}

export async function pickSVGOpen(): Promise<string | null> {
  if (!isTauri()) return null;
  const r = await openDialog({
    title: "导入 SVG",
    multiple: false,
    filters: [{ name: "SVG 矢量图", extensions: ["svg"] }],
  });
  return typeof r === "string" ? r : null;
}

export async function pickImage(): Promise<string | null> {
  if (!isTauri()) return null;
  const r = await openDialog({
    title: "导入图片",
    multiple: false,
    filters: [
      { name: "图片", extensions: ["png", "jpg", "jpeg", "webp", "bmp", "gif", "tif", "tiff"] },
    ],
  });
  return typeof r === "string" ? r : null;
}

export async function pickPresetOpen(): Promise<string | null> {
  if (!isTauri()) return null;
  const r = await openDialog({
    title: "导入画板预设",
    multiple: false,
    filters: [{ name: "Vexa 画板预设", extensions: ["json"] }],
  });
  return typeof r === "string" ? r : null;
}

export async function pickPresetSave(defaultName: string): Promise<string | null> {
  if (!isTauri()) return null;
  const r = await saveDialog({
    title: "导出画板预设",
    defaultPath: `${defaultName || "Vexa-画板预设"}.json`,
    filters: [{ name: "Vexa 画板预设", extensions: ["json"] }],
  });
  return typeof r === "string" ? r : null;
}

export async function pickSwatchOpen(): Promise<string | null> {
  if (!isTauri()) return null;
  const r = await openDialog({
    title: "导入文档色板",
    multiple: false,
    filters: [{ name: "Vexa 文档色板", extensions: ["json"] }],
  });
  return typeof r === "string" ? r : null;
}

export async function pickSwatchSave(defaultName: string): Promise<string | null> {
  if (!isTauri()) return null;
  const r = await saveDialog({
    title: "导出文档色板",
    defaultPath: `${defaultName || "Vexa-文档色板"}.json`,
    filters: [{ name: "Vexa 文档色板", extensions: ["json"] }],
  });
  return typeof r === "string" ? r : null;
}

export async function pickExport(defaultName: string, ext: "svg" | "png" | "pdf"): Promise<string | null> {
  if (!isTauri()) return null;
  const r = await saveDialog({
    title: ext === "svg" ? "导出 SVG" : ext === "png" ? "导出 PNG" : "导出 PDF",
    defaultPath: `${defaultName || "未命名"}.${ext}`,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  });
  return typeof r === "string" ? r : null;
}

export async function readTextFile(path: string): Promise<string> {
  return invoke<string>("read_text_file", { path });
}

export async function readBinaryBase64(path: string): Promise<string> {
  return invoke<string>("read_binary_file", { path });
}

export async function writeTextFile(path: string, text: string): Promise<void> {
  await invoke("write_text_file", { path, text });
}

export async function writeBinaryFile(path: string, base64: string): Promise<void> {
  await invoke("write_binary_file", { path, base64 });
}

function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(out);
}

export async function writeBinaryBytes(path: string, bytes: Uint8Array): Promise<void> {
  await writeBinaryFile(path, bytesToBase64(bytes));
}

export interface TraceOptions {
  preset: "photo" | "illustration" | "lineart" | "pixel";
  colors: number;
  detail: number;
  smooth: number;
  speckle: number;
}

export async function traceImage(path: string, opts: TraceOptions): Promise<string> {
  return invoke<string>("trace_image", { path, opts });
}

/** 用 SVG 光栅化结果当缩略图，供欢迎页最近列表使用。 */
export async function rasterizeSVG(svg: string, w: number, h: number, maxSide: number, mime: "image/png" | "image/jpeg" = "image/jpeg", quality = 0.72): Promise<string> {
  const scale = maxSide / Math.max(w, h, 1);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    if (img.decode) await img.decode();
    else
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("缩略图渲染失败"));
      });
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(w * scale));
    cv.height = Math.max(1, Math.round(h * scale));
    const ctx = cv.getContext("2d");
    if (!ctx) throw new Error("Canvas 不可用");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL(mime, quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function makeThumb(doc: VexaDoc): Promise<string> {
  const board = doc.artboards[0];
  const svg = docToSVG(doc);
  try {
    return await rasterizeSVG(svg, board?.w ?? 1000, board?.h ?? 1000, 240);
  } catch {
    return "";
  }
}

/** 导出 PNG：按倍率光栅化，透明背景。 */
export async function exportPNG(doc: VexaDoc, path: string, scale: number, boardId?: string): Promise<void> {
  const board = doc.artboards.find((b) => b.id === boardId) ?? doc.artboards[0];
  const w = (board?.w ?? 1000) * scale;
  const h = (board?.h ?? 1000) * scale;
  const svg = docToSVG(doc, { pretty: false, boardId: board?.id });
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    if (img.decode) await img.decode();
    else
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("PNG 渲染失败"));
      });
    const cv = document.createElement("canvas");
    cv.width = Math.round(w);
    cv.height = Math.round(h);
    const ctx = cv.getContext("2d");
    if (!ctx) throw new Error("Canvas 不可用");
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    const data = cv.toDataURL("image/png").split(",")[1];
    await writeBinaryFile(path, data);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 读本地图片为 data URL（置入用）。 */
export async function readImageDataURL(path: string): Promise<{ dataUrl: string; w: number; h: number }> {
  const base64 = await readBinaryBase64(path);
  const mime = mimeOf(path);
  const dataUrl = `data:${mime};base64,${base64}`;
  const img = new Image();
  img.src = dataUrl;
  if (img.decode) await img.decode();
  else
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("图片解码失败"));
    });
  return { dataUrl, w: img.naturalWidth, h: img.naturalHeight };
}

function mimeOf(path: string): string {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "bmp") return "image/bmp";
  if (ext === "tif" || ext === "tiff") return "image/tiff";
  return "image/png";
}

export function fileNameOf(path: string): string {
  const parts = path.split(/[\\/]/);
  const last = parts[parts.length - 1] || path;
  return last.replace(/\.vex$/i, "");
}
