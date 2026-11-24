import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type LaunchIntent =
  | { kind: "home" }
  | { kind: "file"; path: string };

interface LaunchPayload {
  kind?: string;
  path?: string | null;
}

function openable(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith(".svg") || lower.endsWith(".vex");
}

/**
 * 读取本次启动意图。带 .svg / .vex 路径时直接进编辑器；
 * 其它情况（包括非 Tauri 环境）一律回欢迎页，不把软件卡在空白屏。
 */
export async function readLaunchIntent(): Promise<LaunchIntent> {
  const query = new URLSearchParams(window.location.search);
  const devOpen = query.get("open");
  if (devOpen) return { kind: "file", path: devOpen };

  try {
    const result = await invoke<LaunchPayload>("launch_intent");
    if (result && result.kind === "file" && result.path && openable(result.path)) {
      return { kind: "file", path: result.path };
    }
  } catch {
    /* 浏览器预览或命令未注册：按主动启动处理 */
  }
  return { kind: "home" };
}

/** 已运行的实例收到“再打开一个文件”时，内核转发的事件名。 */
const EXTERNAL_OPEN_EVENT = "vexa://launch-open";

export async function onExternalOpen(cb: (path: string) => void): Promise<() => void> {
  try {
    const unlisten = await listen<string>(EXTERNAL_OPEN_EVENT, (event) => {
      const path = typeof event.payload === "string" ? event.payload : "";
      if (path) cb(path);
    });
    return unlisten;
  } catch {
    return () => {};
  }
}
