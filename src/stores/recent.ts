/** 最近工程：浏览器本地记录，不上传、不联网。 */
export interface RecentEntry {
  path: string;
  name: string;
  w: number;
  h: number;
  when: number;
  thumb?: string;
}

const KEY = "vexa.recent";
const MAX = 8;

export function loadRecent(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as RecentEntry[];
    return Array.isArray(list) ? list.filter((e) => e && e.path) : [];
  } catch {
    return [];
  }
}

export function pushRecent(entry: RecentEntry): RecentEntry[] {
  const list = loadRecent().filter((e) => e.path !== entry.path);
  list.unshift(entry);
  const next = list.slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 缩略图过多导致配额不足时，退化成不带缩略图
    try {
      localStorage.setItem(KEY, JSON.stringify(next.map((e) => ({ ...e, thumb: "" }))));
    } catch {
      /* 忽略 */
    }
  }
  return next;
}

export function removeRecent(path: string): RecentEntry[] {
  const next = loadRecent().filter((e) => e.path !== path);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function formatWhen(ms: number): string {
  const d = new Date(ms);
  const now = Date.now();
  const diff = now - ms;
  if (diff < 60_000) return "刚刚";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
