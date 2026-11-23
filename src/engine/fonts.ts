/** 桌面端系统字体读取：只在本机找字体文件，不联网、不打包字体。 */
import { readBinaryBase64 } from "../engine/io";

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

interface FaceFiles {
  regular: string[];
  bold?: string[];
  italic?: string[];
  boldItalic?: string[];
}

const FACE_FILES: Array<{ match: RegExp; files: FaceFiles }> = [
  {
    match: /微软雅黑|Microsoft\s*YaHei/i,
    files: { regular: ["msyh.ttc", "msyh.ttf"], bold: ["msyhbd.ttc", "msyhbd.ttf"] },
  },
  {
    match: /宋体|SimSun/i,
    files: { regular: ["simsun.ttc", "simsun.ttf"] },
  },
  {
    match: /黑体|SimHei/i,
    files: { regular: ["simhei.ttf"] },
  },
  {
    match: /楷体|KaiTi/i,
    files: { regular: ["simkai.ttf"] },
  },
  {
    match: /仿宋|FangSong/i,
    files: { regular: ["simfang.ttf"] },
  },
  {
    match: /^Arial$/i,
    files: { regular: ["arial.ttf"], bold: ["arialbd.ttf"], italic: ["ariali.ttf"], boldItalic: ["arialbi.ttf"] },
  },
  {
    match: /^Georgia$/i,
    files: { regular: ["georgia.ttf"], bold: ["georgiab.ttf"], italic: ["georgiai.ttf"], boldItalic: ["georgiaz.ttf"] },
  },
  {
    match: /^Times New Roman$/i,
    files: { regular: ["times.ttf"], bold: ["timesbd.ttf"], italic: ["timesi.ttf"], boldItalic: ["timesbi.ttf"] },
  },
  {
    match: /^Courier New$/i,
    files: { regular: ["cour.ttf"], bold: ["courbd.ttf"], italic: ["couri.ttf"], boldItalic: ["courbi.ttf"] },
  },
  {
    match: /Segoe UI/i,
    files: { regular: ["segoeui.ttf"], bold: ["segoeuib.ttf"], italic: ["segoeuii.ttf"] },
  },
];

const FONT_DIRS = [
  "C:\\Windows\\Fonts\\",
  "C:/Windows/Fonts/",
  "/System/Library/Fonts/",
  "/Library/Fonts/",
  "/usr/share/fonts/opentype/noto/",
  "/usr/share/fonts/truetype/noto/",
];

const bytesCache = new Map<string, Uint8Array>();

function pickFiles(set: FaceFiles, bold: boolean, italic: boolean): string[] {
  if (bold && italic) return set.boldItalic ?? set.bold ?? set.italic ?? set.regular;
  if (bold) return set.bold ?? set.regular;
  if (italic) return set.italic ?? set.regular;
  return set.regular;
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 按字体名找本机文件，读成原始字节交给 PDF 导出器。 */
export async function loadSystemFont(family: string, bold: boolean, italic: boolean): Promise<Uint8Array> {
  if (!isTauri()) throw new Error("PDF 文字导出需要桌面版字体支持");
  const hit = FACE_FILES.find((f) => f.match.test(family));
  const selected = hit ? pickFiles(hit.files, bold, italic) : ["msyh.ttc", "msyhbd.ttc", "simhei.ttf", "segoeui.ttf"];
  const tried: string[] = [];
  for (const dir of FONT_DIRS) {
    for (const file of selected) {
      const path = dir + file;
      const cached = bytesCache.get(path);
      if (cached) return cached;
      tried.push(path);
      try {
        const b64 = await readBinaryBase64(path);
        const bytes = decodeBase64(b64);
        bytesCache.set(path, bytes);
        return bytes;
      } catch {
        /* try next */
      }
    }
  }
  // 最后兜底：用本机无衬线字体，避免整个 PDF 因一个字体名缺失而失败。
  for (const dir of FONT_DIRS) {
    for (const file of ["segoeui.ttf", "msyh.ttc", "simhei.ttf"]) {
      const path = dir + file;
      const cached = bytesCache.get(path);
      if (cached) return cached;
      try {
        const b64 = await readBinaryBase64(path);
        const bytes = decodeBase64(b64);
        bytesCache.set(path, bytes);
        return bytes;
      } catch {
        /* try next */
      }
    }
  }
  throw new Error(`找不到字体：${family}（已尝试 ${tried.slice(0, 3).join("、")}…）`);
}

/** 设置面板字体下拉与 PDF 使用同一份字体名。 */
export const PDF_FONTS = [
  "微软雅黑", "宋体", "黑体", "楷体", "仿宋",
  "Arial", "Georgia", "Times New Roman", "Courier New", "Segoe UI",
];
