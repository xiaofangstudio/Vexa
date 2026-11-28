/** PDF 导出：纯本地、矢量优先。路径/渐变/文字轮廓/位图都写成 PDF 内容流，不联网。 */
import { create as createFont, type Font, type FontCollection, type Glyph } from "fontkit";
import { zlibSync } from "fflate";
import { AREA_INSET, nodeBox, pathTextLayout, textBox, textDecorationLines, textLayout, verticalTextLayout, type Box } from "./geom";
import { gradLine, radialGeom, renderGradStops, stopAlpha } from "./paint";
import type { Artboard, GradStop, Node, Paint, PathNode, Stroke, TextNode, VexaDoc } from "./types";
import { widthOutline } from "./width";
import { brushById, brushPattern, brushStamps, calligraphyStamps } from "./brushes";

export interface PdfExportOptions {
  /** 只导出这一块画板；缺省时每块画板一页。 */
  boardId?: string;
  /** 桌面端加载系统字体；没有它时文字会被跳过（并返回 warning）。 */
  fontLoader?: (family: string, bold: boolean, italic: boolean) => Promise<Uint8Array> | Uint8Array;
  /** 允许测试脚本关闭位图解码。 */
  images?: boolean;
}

export interface PdfExportResult {
  bytes: Uint8Array;
  warnings: string[];
}

function ellipseOps(rx: number, ry: number): string[] {
  const kx = rx * 0.5522847498;
  const ky = ry * 0.5522847498;
  return [
    `${n(rx)} 0 m`,
    `${n(rx)} ${n(ky)} ${n(kx)} ${n(ry)} 0 ${n(ry)} c`,
    `${n(-kx)} ${n(ry)} ${n(-rx)} ${n(ky)} ${n(-rx)} 0 c`,
    `${n(-rx)} ${n(-ky)} ${n(-kx)} ${n(-ry)} 0 ${n(-ry)} c`,
    `${n(kx)} ${n(-ry)} ${n(rx)} ${n(-ky)} ${n(rx)} 0 c`,
  ];
}

const enc = new TextEncoder();

function n(v: number): string {
  if (!Number.isFinite(v)) return "0";
  const s = v.toFixed(4).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  return s === "-0" ? "0" : s;
}

function escPdfText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** 常见 CSS 颜色转 RGB；浏览器里再用 canvas 兜底命名色/HSL。 */
function parseColor(raw: string): { r: number; g: number; b: number; a: number } {
  const s = (raw || "#000000").trim().toLowerCase();
  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8)$/.exec(s);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a };
  }
  const fn = /^rgba?\(([^)]+)\)$/.exec(s);
  if (fn) {
    const parts = fn[1].split(/[,\s/]+/).filter(Boolean);
    if (parts.length >= 3) {
      const pct = (x: string) => (x.endsWith("%") ? parseFloat(x) / 100 * 255 : parseFloat(x));
      return {
        r: pct(parts[0]),
        g: pct(parts[1]),
        b: pct(parts[2]),
        a: parts[3] === undefined ? 1 : parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]),
      };
    }
  }
  const named: Record<string, [number, number, number]> = {
    black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], green: [0, 128, 0],
    blue: [0, 0, 255], yellow: [255, 255, 0], gray: [128, 128, 128], grey: [128, 128, 128],
    silver: [192, 192, 192], maroon: [128, 0, 0], navy: [0, 0, 128], teal: [0, 128, 128],
    orange: [255, 165, 0], purple: [128, 0, 128], pink: [255, 192, 203], lime: [0, 255, 0],
    cyan: [0, 255, 255], aqua: [0, 255, 255], magenta: [255, 0, 255], fuchsia: [255, 0, 255],
    dodgerblue: [30, 144, 255], skyblue: [135, 206, 235], steelblue: [70, 130, 180],
  };
  if (named[s]) {
    const [r, g, b] = named[s];
    return { r, g, b, a: 1 };
  }
  if (typeof document !== "undefined") {
    try {
      const ctx = document.createElement("canvas").getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#000000";
        ctx.fillStyle = s;
        const out = String(ctx.fillStyle);
        if (out !== s) return parseColor(out);
      }
    } catch {
      /* ignore */
    }
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

function mixColor(a: { r: number; g: number; b: number; a: number }, b: { r: number; g: number; b: number; a: number }, t: number) {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
    a: a.a + (b.a - a.a) * t,
  };
}

function sampleStops(stops: GradStop[], t: number): { r: number; g: number; b: number; alpha: number } {
  const x = Math.max(0, Math.min(1, t));
  const list = stops;
  if (!list.length) return { r: 0, g: 0, b: 0, alpha: 1 };
  if (x <= list[0].offset) {
    const c = parseColor(list[0].color);
    return { r: c.r, g: c.g, b: c.b, alpha: c.a * stopAlpha(list[0]) };
  }
  for (let i = 1; i < list.length; i++) {
    if (x <= list[i].offset) {
      const a = list[i - 1];
      const b = list[i];
      const span = b.offset - a.offset;
      const k = span > 1e-9 ? (x - a.offset) / span : 1;
      const ca = parseColor(a.color);
      const cb = parseColor(b.color);
      const mixed = mixColor(ca, cb, k);
      return { r: mixed.r, g: mixed.g, b: mixed.b, alpha: mixed.a * (stopAlpha(a) + (stopAlpha(b) - stopAlpha(a)) * k) };
    }
  }
  const c = parseColor(list[list.length - 1].color);
  return { r: c.r, g: c.g, b: c.b, alpha: c.a * stopAlpha(list[list.length - 1]) };
}

const BLEND: Record<string, string> = {
  normal: "Normal", multiply: "Multiply", screen: "Screen", overlay: "Overlay",
  darken: "Darken", lighten: "Lighten", "color-dodge": "ColorDodge", "color-burn": "ColorBurn",
  "hard-light": "HardLight", "soft-light": "SoftLight", difference: "Difference", exclusion: "Exclusion",
  hue: "Hue", saturation: "Saturation", color: "Color", luminosity: "Luminosity",
};

class PdfWriter {
  private objects: Array<string | Uint8Array | null> = [null];

  reserve(): number {
    this.objects.push(null);
    return this.objects.length - 1;
  }

  set(id: number, body: string | Uint8Array): void {
    this.objects[id] = body;
  }

  add(body: string | Uint8Array): number {
    const id = this.reserve();
    this.set(id, body);
    return id;
  }

  stream(dict: string, data: Uint8Array, compress = true): number {
    const payload = compress ? zlibSync(data) : data;
    const head = `<<${dict}${compress ? " /Filter /FlateDecode" : ""} /Length ${payload.length}>>\nstream\n`;
    const body = new Uint8Array(head.length + payload.length + 11);
    body.set(enc.encode(head), 0);
    body.set(payload, head.length);
    body.set(enc.encode("\nendstream"), head.length + payload.length);
    return this.add(body);
  }

  toBytes(root: number, info?: number): Uint8Array {
    const header = enc.encode("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n");
    const parts: Uint8Array[] = [header];
    const offsets: number[] = new Array(this.objects.length).fill(0);
    let pos = header.length;
    for (let id = 1; id < this.objects.length; id++) {
      const body = this.objects[id] ?? "";
      offsets[id] = pos;
      const prefix = enc.encode(`${id} 0 obj\n`);
      const bytes = typeof body === "string" ? enc.encode(body) : body;
      const suffix = enc.encode("\nendobj\n");
      parts.push(prefix, bytes, suffix);
      pos += prefix.length + bytes.length + suffix.length;
    }
    const xrefPos = pos;
    let xref = `xref\n0 ${this.objects.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < this.objects.length; id++) {
      xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
    }
    let trailer = `trailer\n<< /Size ${this.objects.length} /Root ${root} 0 R`;
    if (info) trailer += ` /Info ${info} 0 R`;
    trailer += ` >>\nstartxref\n${xrefPos}\n%%EOF\n`;
    parts.push(enc.encode(xref), enc.encode(trailer));
    const total = parts.reduce((a, p) => a + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }
}

class PdfBuilder {
  private gs = new Map<string, { id: number; name: string }>();
  private softGs = new Map<string, { id: number; name: string }>();
  private shadings = new Map<string, { id: number; name: string; mask: number | null }>();
  private images = new Map<string, { id: number; name: string }>();
  private imageCache = new Map<string, number | null>();
  private fontCache = new Map<string, { font: Font; bold: boolean; italic: boolean }>();
  private patterns = new Map<string, { id: number; name: string }>();
  private currentBoard: Artboard | null = null;
  warnings: string[] = [];

  constructor(
    private writer: PdfWriter,
    private doc: VexaDoc,
    private opts: PdfExportOptions,
  ) {}

  gsName(alpha: number, blend: string): string {
    const a = Math.max(0, Math.min(1, alpha));
    const key = `${Math.round(a * 1000)}|${blend}`;
    const hit = this.gs.get(key);
    if (hit) return hit.name;
    const name = `GS${this.gs.size}`;
    const bm = BLEND[blend] ?? "Normal";
    const id = this.writer.add(`<< /Type /ExtGState /ca ${n(a)} /CA ${n(a)} /BM /${bm} >>`);
    this.gs.set(key, { id, name });
    return name;
  }

  private softGsName(alpha: number, blend: string, mask: number): string {
    const a = Math.max(0, Math.min(1, alpha));
    const key = `${Math.round(a * 1000)}|${blend}|${mask}`;
    const hit = this.softGs.get(key);
    if (hit) return hit.name;
    const name = `SM${this.softGs.size}`;
    const bm = BLEND[blend] ?? "Normal";
    const id = this.writer.add(
      `<< /Type /ExtGState /ca ${n(a)} /CA ${n(a)} /BM /${bm} /SMask << /S /Luminosity /G ${mask} 0 R >> >>`,
    );
    this.softGs.set(key, { id, name });
    return name;
  }

  private sampledFunction(samples: Uint8Array, comps: 1 | 3): number {
    const count = Math.max(2, Math.round(samples.length / comps));
    const range = comps === 1 ? "[0 1]" : "[0 1 0 1 0 1]";
    return this.writer.stream(
      `/FunctionType 0 /Domain [0 1] /Range ${range} /Size [${count}] /BitsPerSample 8 /Order 1 /Encode [0 ${count - 1}]`,
      samples,
      true,
    );
  }

  private shadingFor(paint: Paint, box: Box): { name: string; mask: number | null } {
    const stops = renderGradStops(paint);
    const key = `${paint.kind}|${n(box.x)},${n(box.y)},${n(box.w)},${n(box.h)}|${paint.grad?.angle ?? 0}|${stops
      .map((s) => `${n(s.offset)}:${s.color}:${n(stopAlpha(s))}`)
      .join(";")}`;
    const hit = this.shadings.get(key);
    if (hit) return hit;

    const N = 256;
    const rgb = new Uint8Array(N * 3);
    const alpha = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const s = sampleStops(stops, i / (N - 1));
      rgb[i * 3] = Math.max(0, Math.min(255, Math.round(s.r)));
      rgb[i * 3 + 1] = Math.max(0, Math.min(255, Math.round(s.g)));
      rgb[i * 3 + 2] = Math.max(0, Math.min(255, Math.round(s.b)));
      alpha[i] = Math.max(0, Math.min(255, Math.round(s.alpha * 255)));
    }
    const colorFn = this.sampledFunction(rgb, 3);
    const alphaFn = this.sampledFunction(alpha, 1);

    let coords: string;
    let type: 2 | 3;
    if (paint.kind === "linear" && paint.grad) {
      const axis = gradLine(paint.grad.angle, box);
      coords = `${n(axis.x1)} ${n(axis.y1)} ${n(axis.x2)} ${n(axis.y2)}`;
      type = 2;
    } else {
      const geo = radialGeom(box);
      coords = `${n(geo.cx)} ${n(geo.cy)} 0 ${n(geo.cx)} ${n(geo.cy)} ${n(geo.r)}`;
      type = 3;
    }
    const colorId = this.writer.add(
      `<< /ShadingType ${type} /ColorSpace /DeviceRGB /Coords [${coords}] /Function ${colorFn} 0 R /Extend [true true] >>`,
    );
    const alphaId = this.writer.add(
      `<< /ShadingType ${type} /ColorSpace /DeviceGray /Coords [${coords}] /Function ${alphaFn} 0 R /Extend [true true] >>`,
    );
    const pad = Math.max(32, Math.max(box.w, box.h) * 0.15);
    const bbox = `${n(box.x - pad)} ${n(box.y - pad)} ${n(box.x + box.w + pad)} ${n(box.y + box.h + pad)}`;
    const mask = this.writer.stream(
      `/Type /XObject /Subtype /Form /FormType 1 /BBox [${bbox}] /Group << /Type /Group /S /Transparency /CS /DeviceGray >> /Resources << /Shading << /ShA ${alphaId} 0 R >> >>`,
      enc.encode("/ShA sh"),
      true,
    );
    const name = `Sh${this.shadings.size}`;
    this.shadings.set(key, { id: colorId, name, mask });
    return { name, mask };
  }

  private imageName(src: string): string | null {
    const hit = this.images.get(src);
    return hit ? hit.name : null;
  }

  private async decodeImage(src: string): Promise<number | null> {
    if (this.opts.images === false) return null;
    if (typeof document === "undefined") return null;
    let w = 0;
    let h = 0;
    const cv = document.createElement("canvas");
    const ctx = cv.getContext("2d");
    if (!ctx) return null;
    try {
      // data: 图不能走 fetch：Tauri 的 CSP 会拦截；直接解 base64 再交给 createImageBitmap。
      let blob: Blob;
      if (src.startsWith("data:")) {
        const comma = src.indexOf(",");
        const meta = src.slice(5, Math.max(5, comma));
        const mime = meta.split(";")[0] || "application/octet-stream";
        const isB64 = /;base64/i.test(meta);
        const raw = isB64
          ? base64Bytes(src.slice(comma + 1))
          : enc.encode(decodeURIComponent(src.slice(comma + 1)));
        blob = new Blob([raw as unknown as BlobPart], { type: mime });
      } else {
        const res = await fetch(src);
        if (!res.ok) throw new Error(`图片读取失败：${res.status}`);
        blob = await res.blob();
      }
      // 用 createImageBitmap 解码：Image.decode() 在后台 WebView 中可能一直不返回。
      const bmp = await createImageBitmap(blob);
      w = bmp.width;
      h = bmp.height;
      if (!w || !h) return null;
      cv.width = w;
      cv.height = h;
      ctx.drawImage(bmp, 0, 0, w, h);
      bmp.close();
    } catch {
      return null;
    }
    let rgba: ImageData;
    try {
      rgba = ctx.getImageData(0, 0, w, h);
    } catch {
      return null;
    }
    let hasAlpha = false;
    for (let i = 3; i < rgba.data.length; i += 4) {
      if (rgba.data[i] < 255) { hasAlpha = true; break; }
    }
    if (!hasAlpha) {
      const jpeg = cv.toDataURL("image/jpeg", 0.92).split(",")[1];
      if (!jpeg) return null;
      const bytes = base64Bytes(jpeg);
      return this.writer.stream(
        `/Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`,
        bytes,
        false,
      );
    }
    const rgb = new Uint8Array(w * h * 3);
    const alpha = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < rgba.data.length; i += 4, p++) {
      rgb[p * 3] = rgba.data[i];
      rgb[p * 3 + 1] = rgba.data[i + 1];
      rgb[p * 3 + 2] = rgba.data[i + 2];
      alpha[p] = rgba.data[i + 3];
    }
    const smask = this.writer.stream(
      `/Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceGray /BitsPerComponent 8 /Decode [0 1]`,
      alpha,
    );
    return this.writer.stream(
      `/Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /SMask ${smask} 0 R`,
      rgb,
    );
  }

  async prepareImages(boards: Artboard[]): Promise<void> {
    const srcs = new Set<string>();
    const visit = (node: Node, nodes: Record<string, Node>): void => {
      if (!node) return;
      if (node.kind === "image") srcs.add(node.src);
      else if (node.kind === "group") for (const c of node.children) {
        const child = nodes[c];
        if (child) visit(child, nodes);
      } else if (node.kind === "symbol") {
        const def = this.doc.symbols?.find((s) => s.id === node.symbolId);
        if (def) for (const id of def.root) {
          const child = def.nodes[id];
          if (child) visit(child, def.nodes);
        }
      }
    };
    for (const b of boards) for (const id of this.doc.root) {
      const node = this.doc.nodes[id];
      if (!node) continue;
      const box = node.kind === "group" ? groupBox(this.doc, node) : nodeBox(node);
      if (box.w <= 0 && box.h <= 0) continue;
      if (box.x > b.x + b.w || box.y > b.y + b.h || box.x + box.w < b.x || box.y + box.h < b.y) continue;
      visit(node, this.doc.nodes);
    }
    // 图案砖里的位图也要嵌入，否则 PDF 中图案会少图。
    for (const def of this.doc.patterns ?? []) {
      for (const id of def.root) {
        const node = def.nodes[id];
        if (node) visit(node, def.nodes);
      }
    }
    for (const src of srcs) {
      if (this.images.has(src)) continue;
      const id = await this.decodeImage(src);
      if (id) {
        const name = `Im${this.images.size}`;
        this.images.set(src, { id, name });
      } else {
        this.imageCache.set(src, null);
        this.warnings.push("有一张位图无法解码，PDF 中已跳过");
      }
    }
  }

  async preloadFonts(): Promise<void> {
    if (!this.opts.fontLoader) return;
    const faces: Array<{ key: string; family: string; bold: boolean; italic: boolean }> = [];
    const seen = new Set<string>();
    const visit = (n: Node, nodes: Record<string, Node>): void => {
      if (n.kind === "text") {
        const key = `${n.font}|${!!n.bold}|${!!n.italic}`;
        if (!seen.has(key)) {
          seen.add(key);
          faces.push({ key, family: n.font, bold: !!n.bold, italic: !!n.italic });
        }
      } else if (n.kind === "group") for (const id of n.children) {
        const c = nodes[id];
        if (c) visit(c, nodes);
      } else if (n.kind === "symbol") {
        const def = this.doc.symbols?.find((s) => s.id === n.symbolId);
        if (def) for (const id of def.root) {
          const c = def.nodes[id];
          if (c) visit(c, def.nodes);
        }
      }
    };
    for (const id of this.doc.root) {
      const n = this.doc.nodes[id];
      if (n) visit(n, this.doc.nodes);
    }
    for (const def of this.doc.patterns ?? []) {
      for (const id of def.root) {
        const node = def.nodes[id];
        if (node) visit(node, def.nodes);
      }
    }
    for (const f of faces) {
      try {
        const bytes = await this.opts.fontLoader(f.family, f.bold, f.italic);
        this.fontCache.set(f.key, parseFace(bytes, f.bold, f.italic));
      } catch {
        this.warnings.push(`字体 ${f.family} 读取失败，PDF 中文字可能缺失`);
      }
    }
  }

  private resourceParts(withPatterns: boolean): string {
    const gs = [...this.gs.values(), ...this.softGs.values()].map((g) => `/${g.name} ${g.id} 0 R`).join(" ");
    const sh = [...this.shadings.values()].map((g) => `/${g.name} ${g.id} 0 R`).join(" ");
    const im = [...this.images.values()].map((g) => `/${g.name} ${g.id} 0 R`).join(" ");
    const pt = withPatterns
      ? [...this.patterns.values()].map((g) => `/${g.name} ${g.id} 0 R`).join(" ")
      : "";
    return `<< /ProcSet [/PDF /Text /ImageB /ImageC] /ExtGState << ${gs} >> /Shading << ${sh} >> /XObject << ${im} >>${pt ? ` /Pattern << ${pt} >>` : ""} >>`;
  }

  resourcesDict(): string {
    return this.resourceParts(true);
  }

  private patternFor(paint: Paint): { name: string } | null {
    const def = (this.doc.patterns ?? []).find((p) => p.id === paint.patternId);
    const board = this.currentBoard;
    if (!def || !board) return null;
    const scale = Math.min(20, Math.max(0.05, paint.patternScale ?? 1));
    const key = `${def.id}|${def.rev ?? 1}|${scale}|${def.tile}|${def.w}|${def.h}|${board.id}`;
    const hit = this.patterns.get(key);
    if (hit) return { name: hit.name };
    const tileW = def.tile === "brick" ? def.w * 2 : def.w;
    const tileH = def.tile === "brick" ? def.h * 2 : def.h;
    const c = new Content(this);
    const oldDoc = this.doc;
    this.doc = { ...this.doc, nodes: def.nodes, root: def.root };
    const drawCopy = (x: number, y: number): void => {
      c.op(`1 0 0 1 ${n(x)} ${n(y)} cm`);
      for (const id of def.root) {
        const node = def.nodes[id];
        if (node) this.drawNode(c, node, 1, "normal");
      }
    };
    if (def.tile === "brick") {
      drawCopy(0, 0);
      drawCopy(def.w, 0);
      drawCopy(def.w / 2, def.h);
      drawCopy(def.w * 1.5, def.h);
    } else {
      drawCopy(0, 0);
    }
    this.doc = oldDoc;
    const resources = this.resourceParts(false);
    const matrix = `[${n(scale)} 0 0 ${n(-scale)} ${n(-board.x)} ${n(board.y + board.h)}]`;
    const id = this.writer.stream(
      `/Type /Pattern /PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 ${n(tileW)} ${n(tileH)}] /XStep ${n(tileW)} /YStep ${n(tileH)} /Matrix ${matrix} /Resources ${resources}`,
      c.bytes(),
      true,
    );
    const name = `P${this.patterns.size}`;
    this.patterns.set(key, { id, name });
    return { name };
  }

  private patternFillOps(c: Content, ops: string[], paint: Paint, alpha: number, blend: string): boolean {
    const pat = this.patternFor(paint);
    if (!pat) return false;
    c.q();
    c.gs(alpha, blend);
    c.path(ops);
    c.op(`/${pat.name} scn`);
    c.op("f");
    c.Q();
    return true;
  }

  drawBoard(c: Content, board: Artboard): void {
    this.currentBoard = board;
    const bg = parseColor(board.bg);
    c.q();
    c.cm(1, 0, 0, -1, -board.x, board.y + board.h);
    c.fillRect(board.x, board.y, board.w, board.h, bg.r, bg.g, bg.b);
    for (const id of this.doc.root) {
      const node = this.doc.nodes[id];
      if (node) this.drawNode(c, node, 1, "normal");
    }
    c.Q();
  }

  private drawNode(c: Content, node: Node, inheritedAlpha: number, inheritedBlend: string, noBrush = false): void {
    if (!node.visible) return;
    const alpha = inheritedAlpha * (node.opacity ?? 1);
    const blend = node.blend ?? inheritedBlend;
    if (node.kind === "path") {
      this.drawPath(c, node, alpha, blend, noBrush);
      return;
    }
    if (node.kind === "text") {
      this.drawText(c, node, alpha, blend);
      return;
    }
    if (node.kind === "image") {
      const name = this.imageName(node.src);
      if (!name) return;
      c.q();
      c.gs(alpha, blend);
      c.op(`${n(node.w)} 0 0 ${n(-node.h)} ${n(node.x)} ${n(node.y + node.h)} cm`);
      c.op(`/${name} Do`);
      c.Q();
      return;
    }
    if (node.kind === "symbol") {
      const def = this.doc.symbols?.find((s) => s.id === node.symbolId);
      if (!def) return;
      c.q();
      c.op(`${n(node.w / Math.max(1, def.w))} 0 0 ${n(node.h / Math.max(1, def.h))} ${n(node.x)} ${n(node.y)} cm`);
      const saved = this.doc;
      this.doc = { ...saved, nodes: def.nodes, root: def.root };
      for (const id of def.root) {
        const child = def.nodes[id];
        if (child) this.drawNode(c, child, alpha, blend, noBrush);
      }
      this.doc = saved;
      c.Q();
      return;
    }
    const clipNode = node.clip ? this.doc.nodes[node.clip] : undefined;
    if (clipNode && clipNode.kind === "path") {
      const ops = pathOps(clipNode);
      if (ops.length) {
        c.q();
        c.path(ops);
        c.op("W n");
      }
    }
    for (const id of node.children) {
      if (id === node.clip) continue;
      const child = this.doc.nodes[id];
      if (child) this.drawNode(c, child, alpha, blend, noBrush);
    }
    if (clipNode && clipNode.kind === "path") {
      const ops = pathOps(clipNode);
      if (ops.length) c.Q();
    }
  }

  /** 叠加外观：底层画完后按栈顺序逐项绘制，复用同一套填充/描边路径语义。 */
  private drawAppearance(c: Content, node: PathNode, alpha: number, blend: string): void {
    for (const item of node.appearance ?? []) {
      if (!item.visible || item.opacity <= 0) continue;
      const itemAlpha = alpha * item.opacity;
      if (item.kind === "fill" && item.fill && item.fill.kind !== "none") {
        this.drawPath(
          c,
          { ...node, fill: item.fill, stroke: { ...node.stroke, kind: "none", brushId: undefined }, appearance: undefined },
          itemAlpha,
          blend,
        );
      } else if (item.kind === "stroke" && item.stroke && item.stroke.kind !== "none" && item.stroke.width > 0) {
        this.drawPath(
          c,
          {
            ...node,
            fill: { kind: "none", color: "#000000", opacity: 1 },
            stroke: { ...item.stroke, brushId: undefined },
            appearance: undefined,
          },
          itemAlpha,
          blend,
        );
      }
    }
  }

  private drawPath(c: Content, node: PathNode, alpha: number, blend: string, noBrush = false): void {
    const box = nodeBox(node);
    const fill = node.fill;
    if (fill && fill.kind !== "none") {
      const fillAlpha = alpha * (fill.opacity ?? 1);
      if (fill.kind === "linear" || fill.kind === "radial") {
        this.gradientFill(c, node, box, fillAlpha, blend);
      } else if (fill.kind === "pattern") {
        const ops = pathOps(node);
        if (!this.patternFillOps(c, ops, fill, fillAlpha, blend)) {
          const col = parseColor(fill.color);
          c.q();
          c.gs(fillAlpha, blend);
          c.path(ops);
          c.fillColor(col.r, col.g, col.b);
          c.op("f");
          c.Q();
        }
      } else {
        const col = parseColor(fill.color);
        const ops = pathOps(node);
        if (ops.length) {
          c.q();
          c.gs(fillAlpha, blend);
          c.path(ops);
          c.fillColor(col.r, col.g, col.b);
          c.op("f");
          c.Q();
        }
      }
    }
    const stroke = node.stroke;
    const brush = !noBrush && stroke.brushId ? brushById(this.doc, stroke.brushId) : undefined;
    const brushTile = brushPattern(this.doc, brush);
    if (brush && brush.kind === "calligraphic") {
      const strokeAlpha = alpha * (stroke.opacity ?? 1);
      const col = parseColor(stroke.color);
      for (const st of calligraphyStamps(node, brush)) {
        const cs = Math.cos(-st.angle);
        const sn = Math.sin(-st.angle);
        c.q();
        c.gs(strokeAlpha, blend);
        c.cm(cs, sn, -sn, cs, st.x, st.y);
        c.path(ellipseOps(st.rx, st.ry));
        c.fillColor(col.r, col.g, col.b);
        c.op("f");
        c.Q();
      }
      this.drawAppearance(c, node, alpha, blend);
      return;
    }
    if (brush && brushTile) {
      const strokeAlpha = alpha * (stroke.opacity ?? 1);
      const saved = this.doc;
      this.doc = { ...saved, nodes: brushTile.nodes, root: brushTile.root };
      for (const st of brushStamps(saved, node, brush)) {
        const cs = Math.cos(-st.angle);
        const sn = Math.sin(-st.angle);
        c.q();
        c.cm(cs, sn, -sn, cs, st.x, st.y);
        c.cm(st.sx, 0, 0, st.sy, -brushTile.w / 2, -brushTile.h / 2);
        if (st.slice) c.clipRect(st.slice.x, 0, st.slice.w, brushTile.h);
        for (const id of brushTile.root) {
          const child = brushTile.nodes[id];
          if (child) this.drawNode(c, child, strokeAlpha, blend, true);
        }
        c.Q();
      }
      this.doc = saved;
      this.drawAppearance(c, node, alpha, blend);
      return;
    }
    if (stroke && stroke.kind !== "none" && stroke.width > 0) {
      const strokeAlpha = alpha * (stroke.opacity ?? 1);
      const outline = widthOutline(node);
      if (outline) {
        const rings = outline.map((loop) => loop.map((p) => [p.x, p.y] as [number, number]));
        const ops = ringOps(rings);
        if (ops.length) {
          c.q();
          c.gs(strokeAlpha, blend);
          c.path(ops);
          c.fillColor(parseColor(stroke.color).r, parseColor(stroke.color).g, parseColor(stroke.color).b);
          c.op("f");
          c.Q();
        }
      } else {
        const ops = pathOps(node);
        if (ops.length) {
          c.q();
          c.gs(strokeAlpha, blend);
          c.strokeSettings(stroke.width, stroke.cap ?? "butt", stroke.join ?? "miter", stroke.dash);
          c.path(ops);
          c.strokeColor(parseColor(stroke.color).r, parseColor(stroke.color).g, parseColor(stroke.color).b);
          c.op("S");
          c.Q();
        }
      }
      if (stroke.arrow && stroke.arrow !== "none") this.drawArrow(c, node, strokeAlpha, blend);
    }
    this.drawAppearance(c, node, alpha, blend);
  }

  private gradientFill(c: Content, node: PathNode, box: Box, alpha: number, blend: string): void {
    const paint = node.fill;
    const ops = pathOps(node);
    if (!ops.length) return;
    this.gradientFillOps(c, ops, paint, box, alpha, blend);
  }

  private gradientFillOps(c: Content, ops: string[], paint: Paint, box: Box, alpha: number, blend: string): void {
    const sh = this.shadingFor(paint, box);
    c.q();
    c.path(ops);
    c.op("W n");
    if (sh.mask !== null) c.op(`/${this.softGsName(alpha, blend, sh.mask)} gs`);
    else c.gs(alpha, blend);
    c.op(`/${sh.name} sh`);
    c.Q();
  }

  private drawText(c: Content, node: TextNode, alpha: number, blend: string): void {
    const font = this.fontFor(node);
    if (!font) {
      this.warnings.push(`字体 ${node.font} 不可用，文字「${node.text.slice(0, 8)}」未写入 PDF`);
      return;
    }
    const glyphs = node.textMode === "path"
      ? layoutPathText(node, font.font, font.bold, font.italic)
      : node.textDirection === "vertical"
        ? layoutVerticalText(node, font.font, font.bold, font.italic)
        : layoutText(node, font.font, font.bold, font.italic);
    if (!glyphs.ops.length) return;
    const box = textBox(node);
    const area = (node.textMode ?? "point") === "area";
    if (area) {
      c.q();
      c.clipRect(box.x, box.y, box.w, box.h);
    }
    if (node.fill.kind !== "none") this.textFillPass(c, glyphs.ops, node.fill, box, alpha, blend);
    if (node.stroke) this.textStrokePass(c, glyphs.ops, node.stroke, alpha, blend);
    for (const item of node.appearance ?? []) {
      if (!item.visible || item.opacity <= 0) continue;
      const a = alpha * item.opacity;
      if (item.kind === "fill" && item.fill) this.textFillPass(c, glyphs.ops, item.fill, box, a, blend);
      else if (item.kind === "stroke" && item.stroke) this.textStrokePass(c, glyphs.ops, item.stroke, a, blend);
    }
    const decor = textDecorationLines(node);
    if (decor.length && node.fill.kind !== "none") {
      const col = parseColor(node.fill.color);
      c.q();
      c.gs(alpha * (node.fill.opacity ?? 1), blend);
      for (const line of decor) {
        const dx = line.x2 - line.x1;
        const dy = line.y2 - line.y1;
        if (Math.abs(dx) >= Math.abs(dy)) {
          c.fillRect(Math.min(line.x1, line.x2), line.y1 - line.thickness / 2, Math.abs(dx), line.thickness, col.r, col.g, col.b);
        } else {
          c.fillRect(line.x1 - line.thickness / 2, Math.min(line.y1, line.y2), line.thickness, Math.abs(dy), col.r, col.g, col.b);
        }
      }
      c.Q();
    }
    if (area) c.Q();
  }

  private textFillPass(c: Content, ops: string[], paint: Paint, box: Box, alpha: number, blend: string): void {
    if (paint.kind === "none" || alpha <= 0) return;
    const fillAlpha = alpha * (paint.opacity ?? 1);
    if (paint.kind === "linear" || paint.kind === "radial") {
      this.gradientFillOps(c, ops, paint, box, fillAlpha, blend);
    } else if (paint.kind === "pattern" && this.patternFillOps(c, ops, paint, fillAlpha, blend)) {
      // 图案直接以字形轮廓为填充路径。
    } else {
      const col = parseColor(paint.color);
      c.q();
      c.gs(fillAlpha, blend);
      c.path(ops);
      c.fillColor(col.r, col.g, col.b);
      c.op("f");
      c.Q();
    }
  }

  private textStrokePass(c: Content, ops: string[], stroke: Stroke, alpha: number, blend: string): void {
    if (stroke.kind === "none" || stroke.width <= 0 || alpha <= 0) return;
    const col = parseColor(stroke.color);
    c.q();
    c.gs(alpha * (stroke.opacity ?? 1), blend);
    c.path(ops);
    c.strokeSettings(stroke.width, stroke.cap ?? "butt", stroke.join ?? "miter", stroke.dash ?? []);
    c.strokeColor(col.r, col.g, col.b);
    c.op("S");
    c.Q();
  }

  private fontFor(node: TextNode): { font: Font; bold: boolean; italic: boolean } | null {
    const key = `${node.font}|${!!node.bold}|${!!node.italic}`;
    return this.fontCache.get(key) ?? null;
  }

  private drawArrow(c: Content, node: PathNode, alpha: number, blend: string): void {
    const kind = node.stroke.arrow;
    if (!kind || kind === "none") return;
    const size = Math.max(6, node.stroke.width * 2.8);
    const col = parseColor(node.stroke.color);
    for (const sub of node.subpaths) {
      if (sub.closed || sub.anchors.length < 2) continue;
      const last = sub.anchors[sub.anchors.length - 1];
      const prev = sub.anchors[sub.anchors.length - 2];
      const c2 = last.hIn ?? last;
      const near = Math.hypot(c2.x - last.x, c2.y - last.y) > 0.01 ? c2 : prev;
      const ux0 = last.x - near.x;
      const uy0 = last.y - near.y;
      const len = Math.hypot(ux0, uy0) || 1;
      const ux = ux0 / len;
      const uy = uy0 / len;
      const nx = -uy;
      const ny = ux;
      const baseX = last.x - ux * size;
      const baseY = last.y - uy * size;
      if (kind === "open") {
        c.q();
        c.gs(alpha, blend);
        c.strokeSettings(node.stroke.width, "butt", "miter", []);
        c.strokeColor(col.r, col.g, col.b);
        c.polyline([
          [baseX + nx * size * 0.5, baseY + ny * size * 0.5],
          [last.x, last.y],
          [baseX - nx * size * 0.5, baseY - ny * size * 0.5],
        ]);
        c.op("S");
        c.Q();
      } else {
        const tri: Array<[number, number]> =
          kind === "diamond"
            ? (() => {
                const midX = last.x - ux * size * 0.5;
                const midY = last.y - uy * size * 0.5;
                return [
                  [last.x, last.y],
                  [midX + nx * size * 0.4, midY + ny * size * 0.4],
                  [baseX, baseY],
                  [midX - nx * size * 0.4, midY - ny * size * 0.4],
                ];
              })()
            : [
                [last.x, last.y],
                [baseX + nx * size * 0.45, baseY + ny * size * 0.45],
                [baseX - nx * size * 0.45, baseY - ny * size * 0.45],
              ];
        c.q();
        c.gs(alpha, blend);
        c.polygon(tri);
        c.fillColor(col.r, col.g, col.b);
        c.op("f");
        c.Q();
      }
    }
  }
}

class Content {
  private lines: string[] = [];
  constructor(private b: PdfBuilder) {}

  bytes(): Uint8Array { return enc.encode(this.lines.join("\n")); }
  op(s: string): void { this.lines.push(s); }
  q(): void { this.lines.push("q"); }
  Q(): void { this.lines.push("Q"); }
  cm(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.lines.push(`${n(a)} ${n(b)} ${n(c)} ${n(d)} ${n(e)} ${n(f)} cm`);
  }
  gs(alpha: number, blend: string): void {
    if (alpha >= 0.999 && blend === "normal") return;
    this.lines.push(`/${this.b.gsName(alpha, blend)} gs`);
  }
  path(ops: string[]): void { for (const o of ops) this.lines.push(o); }
  fillColor(r: number, g: number, b: number): void {
    this.lines.push(`${n(r / 255)} ${n(g / 255)} ${n(b / 255)} rg`);
  }
  strokeColor(r: number, g: number, b: number): void {
    this.lines.push(`${n(r / 255)} ${n(g / 255)} ${n(b / 255)} RG`);
  }
  fillRect(x: number, y: number, w: number, h: number, r: number, g: number, b: number): void {
    this.lines.push(`${n(x)} ${n(y)} m ${n(x + w)} ${n(y)} l ${n(x + w)} ${n(y + h)} l ${n(x)} ${n(y + h)} l h`);
    this.fillColor(r, g, b);
    this.lines.push("f");
  }
  clipRect(x: number, y: number, w: number, h: number): void {
    this.lines.push(`${n(x)} ${n(y)} m ${n(x + w)} ${n(y)} l ${n(x + w)} ${n(y + h)} l ${n(x)} ${n(y + h)} l h W n`);
  }
  polygon(pts: Array<[number, number]>, close = true): void {
    if (!pts.length) return;
    const first = pts[0];
    this.lines.push(`${n(first[0])} ${n(first[1])} m`);
    for (let i = 1; i < pts.length; i++) this.lines.push(`${n(pts[i][0])} ${n(pts[i][1])} l`);
    if (close) this.lines.push("h");
  }
  polyline(pts: Array<[number, number]>): void { this.polygon(pts, false); }
  strokeSettings(width: number, cap: string, join: string, dash: number[]): void {
    this.lines.push(`${n(width)} w`);
    this.lines.push(`${cap === "round" ? 1 : cap === "square" ? 2 : 0} J`);
    this.lines.push(`${join === "round" ? 1 : join === "bevel" ? 2 : 0} j`);
    const d = (dash ?? []).filter((x) => Number.isFinite(x) && x > 0);
    this.lines.push(d.length ? `[${d.map(n).join(" ")}] 0 d` : `[] 0 d`);
  }
}

function pathOps(node: PathNode): string[] {
  const out: string[] = [];
  for (const sub of node.subpaths) {
    const a = sub.anchors;
    if (!a.length) continue;
    out.push(`${n(a[0].x)} ${n(a[0].y)} m`);
    const count = sub.closed ? a.length : a.length - 1;
    for (let i = 0; i < count; i++) {
      const p = a[i];
      const q = a[(i + 1) % a.length];
      if (!p.hOut && !q.hIn) {
        out.push(`${n(q.x)} ${n(q.y)} l`);
      } else {
        const c1 = p.hOut ?? p;
        const c2 = q.hIn ?? q;
        out.push(`${n(c1.x)} ${n(c1.y)} ${n(c2.x)} ${n(c2.y)} ${n(q.x)} ${n(q.y)} c`);
      }
    }
    if (sub.closed) out.push("h");
  }
  return out;
}

function ringOps(rings: Array<Array<[number, number]>>): string[] {
  const out: string[] = [];
  for (const ring of rings) {
    if (ring.length < 3) continue;
    out.push(`${n(ring[0][0])} ${n(ring[0][1])} m`);
    for (let i = 1; i < ring.length; i++) out.push(`${n(ring[i][0])} ${n(ring[i][1])} l`);
    out.push("h");
  }
  return out;
}

function layoutPathText(node: TextNode, font: Font, gotBold: boolean, gotItalic: boolean): { ops: string[] } {
  const size = node.size;
  const scale = size / font.unitsPerEm;
  const layout = pathTextLayout(node);
  const hs = (node.hScale ?? 100) / 100;
  const vs = (node.vScale ?? 100) / 100;
  const synthBold = !!node.bold && !gotBold ? Math.max(0.25, size * 0.018) : 0;
  const synthItalic = !!node.italic && !gotItalic ? 0.22 : 0;
  const ops: string[] = [];
  for (const c of layout.chars) {
    if (!c.ch.trim()) continue;
    let g: Glyph;
    try {
      g = font.glyphForCodePoint(c.ch.codePointAt(0) ?? 0);
    } catch {
      g = font.glyphForCodePoint(0);
    }
    const cos = Math.cos(c.angle);
    const sin = Math.sin(c.angle);
    const emit = (shift: number) => {
      let px = 0;
      let py = 0;
      let started = false;
      const tx = (x: number, y: number, off = 0): [number, number] => {
        const lx = (x * scale + y * scale * synthItalic + off) * hs + shift;
        const gy = y * scale * vs;
        return [
          c.x + lx * cos + gy * sin,
          c.y + lx * sin - gy * cos,
        ];
      };
      for (const cmd of g.path.commands) {
        const args = cmd.args;
        if (cmd.command === "moveTo") {
          const [x, y] = tx(args[0], args[1]);
          ops.push(`${n(x)} ${n(y)} m`);
          px = args[0]; py = args[1]; started = true;
        } else if (cmd.command === "lineTo") {
          if (!started) { const [x, y] = tx(px, py); ops.push(`${n(x)} ${n(y)} m`); started = true; }
          const [x, y] = tx(args[0], args[1]);
          ops.push(`${n(x)} ${n(y)} l`);
          px = args[0]; py = args[1];
        } else if (cmd.command === "quadraticCurveTo") {
          if (!started) { const [x, y] = tx(px, py); ops.push(`${n(x)} ${n(y)} m`); started = true; }
          const cx = args[0], cy = args[1], ex = args[2], ey = args[3];
          const c1x = px + (2 / 3) * (cx - px);
          const c1y = py + (2 / 3) * (cy - py);
          const c2x = ex + (2 / 3) * (cx - ex);
          const c2y = ey + (2 / 3) * (cy - ey);
          const [ax, ay] = tx(c1x, c1y);
          const [bx, by] = tx(c2x, c2y);
          const [dx, dy] = tx(ex, ey);
          ops.push(`${n(ax)} ${n(ay)} ${n(bx)} ${n(by)} ${n(dx)} ${n(dy)} c`);
          px = ex; py = ey;
        } else if (cmd.command === "bezierCurveTo") {
          if (!started) { const [x, y] = tx(px, py); ops.push(`${n(x)} ${n(y)} m`); started = true; }
          const [a1x, a1y] = tx(args[0], args[1]);
          const [a2x, a2y] = tx(args[2], args[3]);
          const [a3x, a3y] = tx(args[4], args[5]);
          ops.push(`${n(a1x)} ${n(a1y)} ${n(a2x)} ${n(a2y)} ${n(a3x)} ${n(a3y)} c`);
          px = args[4]; py = args[5];
        } else if (cmd.command === "closePath") {
          ops.push("h");
        }
      }
    };
    emit(0);
    if (synthBold > 0) emit(synthBold);
  }
  return { ops };
}

function layoutVerticalText(node: TextNode, font: Font, gotBold: boolean, gotItalic: boolean): { ops: string[] } {
  const size = node.size;
  const scale = size / font.unitsPerEm;
  const layout = verticalTextLayout(node);
  const hs = (node.hScale ?? 100) / 100;
  const vs = (node.vScale ?? 100) / 100;
  const synthBold = !!node.bold && !gotBold ? Math.max(0.25, size * 0.018) : 0;
  const synthItalic = !!node.italic && !gotItalic ? 0.22 : 0;
  const ops: string[] = [];
  for (const c of layout.chars) {
    if (!c.ch.trim()) continue;
    let g: Glyph;
    try {
      g = font.glyphForCodePoint(c.ch.codePointAt(0) ?? 0);
    } catch {
      g = font.glyphForCodePoint(0);
    }
    const cx = c.x + (c.dx ?? 0);
    const cy = c.y + c.advance / 2 + (c.dy ?? 0);
    const emit = (offShift: number) => {
      let px = 0;
      let py = 0;
      let started = false;
      const tx = (x: number, y: number, off = 0): [number, number] => {
        const gx = (x * scale + y * scale * synthItalic) * hs + off + offShift;
        const gy = y * scale * vs;
        if (c.rotate) {
          const dx = -c.advance / 2 + gx;
          const dy = size * 0.35 - gy;
          return [cx - dy, cy + dx];
        }
        return [cx - c.advance / 2 + gx, cy + size * 0.35 - gy];
      };
      for (const cmd of g.path.commands) {
        const args = cmd.args;
        if (cmd.command === "moveTo") {
          const [x, y] = tx(args[0], args[1]);
          ops.push(`${n(x)} ${n(y)} m`);
          px = args[0]; py = args[1]; started = true;
        } else if (cmd.command === "lineTo") {
          if (!started) { const [x, y] = tx(px, py); ops.push(`${n(x)} ${n(y)} m`); started = true; }
          const [x, y] = tx(args[0], args[1]);
          ops.push(`${n(x)} ${n(y)} l`);
          px = args[0]; py = args[1];
        } else if (cmd.command === "quadraticCurveTo") {
          if (!started) { const [x, y] = tx(px, py); ops.push(`${n(x)} ${n(y)} m`); started = true; }
          const qx = args[0], qy = args[1], ex = args[2], ey = args[3];
          const c1x = px + (2 / 3) * (qx - px);
          const c1y = py + (2 / 3) * (qy - py);
          const c2x = ex + (2 / 3) * (qx - ex);
          const c2y = ey + (2 / 3) * (qy - ey);
          const [ax, ay] = tx(c1x, c1y);
          const [bx, by] = tx(c2x, c2y);
          const [dx, dy] = tx(ex, ey);
          ops.push(`${n(ax)} ${n(ay)} ${n(bx)} ${n(by)} ${n(dx)} ${n(dy)} c`);
          px = ex; py = ey;
        } else if (cmd.command === "bezierCurveTo") {
          if (!started) { const [x, y] = tx(px, py); ops.push(`${n(x)} ${n(y)} m`); started = true; }
          const [a1x, a1y] = tx(args[0], args[1]);
          const [a2x, a2y] = tx(args[2], args[3]);
          const [a3x, a3y] = tx(args[4], args[5]);
          ops.push(`${n(a1x)} ${n(a1y)} ${n(a2x)} ${n(a2y)} ${n(a3x)} ${n(a3y)} c`);
          px = args[4]; py = args[5];
        } else if (cmd.command === "closePath") {
          ops.push("h");
        }
      }
    };
    emit(0);
    if (synthBold > 0) emit(synthBold);
  }
  return { ops };
}

function layoutText(node: TextNode, font: Font, gotBold: boolean, gotItalic: boolean): { ops: string[] } {
  const size = node.size;
  const scale = size / font.unitsPerEm;
  const layout = textLayout(node);
  const tracking = node.tracking ?? 0;
  const align = node.align ?? "left";
  const hs = (node.hScale ?? 100) / 100;
  const vs = (node.vScale ?? 100) / 100;
  const area = layout.mode === "area";
  const innerW = Math.max(1, layout.box.w - AREA_INSET * 2);
  const synthBold = !!node.bold && !gotBold ? Math.max(0.25, size * 0.018) : 0;
  const synthItalic = !!node.italic && !gotItalic ? 0.22 : 0;
  const ops: string[] = [];
  const lines = layout.lines.map((l) => l.text);
  for (let li = 0; li < lines.length; li++) {
    const chars = Array.from(lines[li]);
    const glyphs: Glyph[] = chars.map((ch) => {
      try { return font.glyphForCodePoint(ch.codePointAt(0) ?? 0); } catch { return font.glyphForCodePoint(0); }
    });
    const widths = glyphs.map((g) => (g.advanceWidth || 0) * scale);
    const total = widths.reduce((a, b) => a + b, 0) + Math.max(0, chars.length - 1) * tracking;
    const startX = area
      ? layout.box.x + AREA_INSET +
        (align === "center" ? Math.max(0, innerW - total * hs) / 2 : align === "right" ? Math.max(0, innerW - total * hs) : 0)
      : node.x + (align === "center" ? -total * hs / 2 : align === "right" ? -total * hs : 0);
    let pen = 0;
    const baseY = layout.lines[li]?.baseline ?? layout.box.y + AREA_INSET + size * 1.2;
    for (let gi = 0; gi < glyphs.length; gi++) {
      const g = glyphs[gi];
      const startOps = ops.length;
      let px = 0;
      let py = 0;
      let started = false;
      const tx = (x: number, y: number, off = 0): [number, number] => {
        const docX = startX + (pen + x * scale + y * scale * synthItalic + off) * hs;
        const docY = baseY - y * scale * vs;
        return [docX, docY];
      };
      for (const cmd of g.path.commands) {
        const args = cmd.args;
        if (cmd.command === "moveTo") {
          const [x, y] = tx(args[0], args[1]);
          ops.push(`${n(x)} ${n(y)} m`);
          px = args[0]; py = args[1]; started = true;
        } else if (cmd.command === "lineTo") {
          if (!started) { const [x, y] = tx(px, py); ops.push(`${n(x)} ${n(y)} m`); started = true; }
          const [x, y] = tx(args[0], args[1]);
          ops.push(`${n(x)} ${n(y)} l`);
          px = args[0]; py = args[1];
        } else if (cmd.command === "quadraticCurveTo") {
          if (!started) { const [x, y] = tx(px, py); ops.push(`${n(x)} ${n(y)} m`); started = true; }
          const cx = args[0], cy = args[1], ex = args[2], ey = args[3];
          const c1x = px + (2 / 3) * (cx - px);
          const c1y = py + (2 / 3) * (cy - py);
          const c2x = ex + (2 / 3) * (cx - ex);
          const c2y = ey + (2 / 3) * (cy - ey);
          const [ax, ay] = tx(c1x, c1y);
          const [bx, by] = tx(c2x, c2y);
          const [dx, dy] = tx(ex, ey);
          ops.push(`${n(ax)} ${n(ay)} ${n(bx)} ${n(by)} ${n(dx)} ${n(dy)} c`);
          px = ex; py = ey;
        } else if (cmd.command === "bezierCurveTo") {
          if (!started) { const [x, y] = tx(px, py); ops.push(`${n(x)} ${n(y)} m`); started = true; }
          const [a1x, a1y] = tx(args[0], args[1]);
          const [a2x, a2y] = tx(args[2], args[3]);
          const [a3x, a3y] = tx(args[4], args[5]);
          ops.push(`${n(a1x)} ${n(a1y)} ${n(a2x)} ${n(a2y)} ${n(a3x)} ${n(a3y)} c`);
          px = args[4]; py = args[5];
        } else if (cmd.command === "closePath") {
          ops.push("h");
        }
      }
      if (synthBold > 0) {
        // 合成粗体：把同一字形再向右偏移一点画一遍，观感接近加粗，不依赖字体文件。
        for (const op of ops.slice(startOps)) {
          const parts = op.split(" ");
          if (parts.length !== 3 && parts.length !== 7) continue;
          for (let k = 0; k < parts.length - 1; k += 2) parts[k] = n(parseFloat(parts[k]) + synthBold);
          ops.push(parts.join(" "));
        }
      }
      pen += (g.advanceWidth || 0) * scale + tracking;
    }
  }
  return { ops };
}

function groupBox(doc: VexaDoc, node: Node): Box {
  let box: Box | null = null;
  const visit = (n: Node) => {
    if (n.kind === "group") for (const id of n.children) {
      const c = doc.nodes[id];
      if (c) visit(c);
    }
    else {
      const b = nodeBox(n);
      if (b.w > 0 || b.h > 0) box = box ? union(box, b) : b;
    }
  };
  visit(node);
  return box ?? { x: 0, y: 0, w: 0, h: 0 };
}

function union(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const r = Math.max(a.x + a.w, b.x + b.w);
  const bt = Math.max(a.y + a.h, b.y + b.h);
  return { x, y, w: r - x, h: bt - y };
}

function base64Bytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function exportPDF(doc: VexaDoc, opts: PdfExportOptions = {}): Promise<PdfExportResult> {
  const boards = opts.boardId ? doc.artboards.filter((b) => b.id === opts.boardId) : doc.artboards;
  if (!boards.length) throw new Error("没有可导出的画板");
  const writer = new PdfWriter();
  const catalog = writer.reserve();
  const pages = writer.reserve();
  const resources = writer.reserve();
  const builder = new PdfBuilder(writer, doc, opts);
  await builder.prepareImages(boards);
  await builder.preloadFonts();
  const pageIds: number[] = [];
  for (const board of boards) {
    const c = new Content(builder);
    builder.drawBoard(c, board);
    const contentId = writer.stream("", c.bytes(), true);
    const pageId = writer.add(
      `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${n(board.w)} ${n(board.h)}] /Resources ${resources} 0 R /Contents ${contentId} 0 R >>`,
    );
    pageIds.push(pageId);
  }
  writer.set(resources, builder.resourcesDict());
  writer.set(pages, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  writer.set(catalog, `<< /Type /Catalog /Pages ${pages} 0 R >>`);
  const info = writer.add(`<< /Producer (Vexa PDF) /Creator (Vexa) /Title (${escPdfText(doc.name || "Vexa")}) >>`);
  return { bytes: writer.toBytes(catalog, info), warnings: builder.warnings };
}

function parseFace(bytes: Uint8Array, bold: boolean, italic: boolean): { font: Font; bold: boolean; italic: boolean } {
  const parsed = createFont(bytes as unknown as Buffer) as Font | FontCollection;
  let font: Font;
  if ("fonts" in parsed) {
    const faces = parsed.fonts;
    font =
      faces.find((f) => (bold === /bold/i.test(f.subfamilyName)) && (italic === /italic|oblique/i.test(f.subfamilyName))) ??
      faces.find((f) => (bold === /bold/i.test(f.subfamilyName))) ??
      faces[0];
  } else font = parsed;
  return {
    font,
    bold: /bold/i.test(font.subfamilyName),
    italic: /italic|oblique/i.test(font.subfamilyName) || Math.abs(font.italicAngle) > 3,
  };
}
