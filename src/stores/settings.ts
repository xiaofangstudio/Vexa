/** 应用设置：一处定义、localStorage 持久化、界面即时生效。 */

export interface VexaSettings {
  /** 启动动画 */
  splash: boolean;
  /** 自动保存间隔（秒），0 表示关闭 */
  autoSave: number;
  /** 画布点阵网格 */
  grid: boolean;
  /** 拖拽/移动吸附到整像素 */
  snap: boolean;
  /** 新工程默认背景 */
  defaultBg: string;
  /** 默认导出格式 */
  exportFmt: "svg" | "png" | "pdf";
  /** 默认导出倍率 */
  exportScale: number;
  /** 界面密度 */
  density: "comfortable" | "compact";
  /** 画布外提示文案 */
  welcomeHints: boolean;
}

export const DEFAULT_SETTINGS: VexaSettings = {
  splash: true,
  autoSave: 120,
  grid: false,
  snap: true,
  defaultBg: "#ffffff",
  exportFmt: "svg",
  exportScale: 2,
  density: "comfortable",
  welcomeHints: true,
};

const KEY = "vexa.settings.v1";

export function loadSettings(): VexaSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<VexaSettings>;
    return sanitize({ ...DEFAULT_SETTINGS, ...parsed });
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function sanitize(s: VexaSettings): VexaSettings {
  return {
    splash: !!s.splash,
    autoSave: clamp(Math.round(Number(s.autoSave) || 0), 0, 600),
    grid: !!s.grid,
    snap: !!s.snap,
    defaultBg: /^#[0-9a-f]{6}$/i.test(s.defaultBg) ? s.defaultBg : "#ffffff",
    exportFmt: s.exportFmt === "png" ? "png" : s.exportFmt === "pdf" ? "pdf" : "svg",
    exportScale: clamp(Number(s.exportScale) || 1, 1, 4),
    density: s.density === "compact" ? "compact" : "comfortable",
    welcomeHints: !!s.welcomeHints,
  };
}

export function saveSettings(s: VexaSettings): void {
  localStorage.setItem(KEY, JSON.stringify(sanitize(s)));
}

export function resetSettings(): VexaSettings {
  localStorage.removeItem(KEY);
  return { ...DEFAULT_SETTINGS };
}

export function applyDensity(s: VexaSettings): void {
  document.documentElement.dataset.density = s.density;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
