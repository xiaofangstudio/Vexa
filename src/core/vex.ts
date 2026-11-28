/** .vex 工程文件：版本化 JSON，原子写入在 Rust 侧完成。 */
import type { Node, VexaDoc } from "./types";
import { BLEND_MODES, LAYER_TAGS } from "./types";
import { normalizeGradStops } from "./paint";
import { normalizeWidthPoints } from "./width";
import { normalizeSwatches } from "./swatches";
import { normalizeGraphicStyles } from "./graphicStyles";
import { normalizeSymbols } from "./symbols";
import { cleanPatternLinks, normalizePatterns } from "./patterns";
import { cleanBrushLinks, normalizeBrushes } from "./brushes";
import { normalizeAppearance } from "./appearance";

export interface VexFile {
  format: "vexa";
  version: 1;
  generator: string;
  savedAt: string;
  doc: VexaDoc;
}

export function serializeVex(doc: VexaDoc): string {
  const file: VexFile = {
    format: "vexa",
    version: 1,
    generator: "Vexa 0.1.0 · 小方工作室",
    savedAt: new Date().toISOString(),
    doc,
  };
  return JSON.stringify(file, null, 1);
}

export function parseVex(text: string): VexaDoc {
  const data = JSON.parse(text) as Partial<VexFile>;
  if (!data || data.format !== "vexa") throw new Error("不是 Vexa 工程文件");
  const doc = data.doc as VexaDoc | undefined;
  if (!doc || !Array.isArray(doc.root) || typeof doc.nodes !== "object") {
    throw new Error("工程文件结构不完整");
  }
  // 修补缺字段，老版本也能打开
  doc.artboards = (doc.artboards ?? []).filter((a) => a && a.w > 0 && a.h > 0);
  if (!doc.artboards.length) doc.artboards = [{ id: "a1", name: "画板 1", x: 0, y: 0, w: 1000, h: 1000, bg: "#ffffff" }];
  doc.seq = doc.seq ?? 1;
  doc.name = doc.name ?? "未命名";
  doc.unit = "px";
  doc.swatches = normalizeSwatches(doc.swatches);
  const swatchIds = new Set(doc.swatches.map((s) => s.id));
  doc.styles = normalizeGraphicStyles(doc.styles, swatchIds);
  const styleIds = new Set(doc.styles.map((s) => s.id));
  doc.symbols = normalizeSymbols(doc.symbols);
  const symbolIds = new Set(doc.symbols.map((s) => s.id));
  normalizePatterns(doc);
  normalizeBrushes(doc);
  const layerTagIds = new Set(LAYER_TAGS.map((t) => t.id));
  const danglingSymbols: string[] = [];
  for (const [id, n] of Object.entries(doc.nodes as Record<string, Node>)) {
    if (!n.id) n.id = id;
    if (n.visible === undefined) n.visible = true;
    if (n.locked === undefined) n.locked = false;
    if (n.opacity === undefined) n.opacity = 1;
    if (n.blend && !BLEND_MODES.includes(n.blend)) delete n.blend;
    if (n.tag !== undefined && !layerTagIds.has(n.tag)) delete n.tag;
    if ((n.kind === "path" || n.kind === "text") && n.graphicStyle && !styleIds.has(n.graphicStyle)) delete n.graphicStyle;
    if (n.kind === "symbol") {
      if (!symbolIds.has(n.symbolId)) danglingSymbols.push(n.id);
      if (!Number.isFinite(n.x)) n.x = 0;
      if (!Number.isFinite(n.y)) n.y = 0;
      if (!Number.isFinite(n.w) || n.w <= 0) n.w = 1;
      if (!Number.isFinite(n.h) || n.h <= 0) n.h = 1;
    }
    if (n.kind === "group" && n.clip && !doc.nodes[n.clip]) delete n.clip;
    if (n.kind === "path" || n.kind === "text") {
      if (!n.fill || typeof n.fill !== "object") n.fill = { kind: "none", color: "#000000", opacity: 1 };
      if ((n.fill.kind === "linear" || n.fill.kind === "radial") && (!n.fill.grad || !Array.isArray(n.fill.grad.stops) || n.fill.grad.stops.length < 2)) {
        n.fill = { kind: "solid", color: n.fill.color || "#000000", opacity: n.fill.opacity ?? 1 };
      } else if ((n.fill.kind === "linear" || n.fill.kind === "radial") && n.fill.grad) {
        n.fill.grad.stops = normalizeGradStops(n.fill.grad.stops, n.fill.color || "#000000");
        if (!Number.isFinite(n.fill.grad.angle)) n.fill.grad.angle = 90;
        n.fill.color = n.fill.grad.stops[0]?.color ?? n.fill.color;
      }
      if (typeof n.fill.opacity !== "number") n.fill.opacity = 1;
      if (n.fill.swatch && (n.fill.kind !== "solid" || !swatchIds.has(n.fill.swatch))) delete n.fill.swatch;
    }
    if (n.kind === "text") {
      if (typeof n.font !== "string" || !n.font) n.font = "Microsoft YaHei";
      if (typeof n.size !== "number" || !(n.size > 0)) n.size = 28;
      if (typeof n.text !== "string") n.text = "";
      if (typeof n.lineHeight !== "number" || !(n.lineHeight > 0.3)) delete n.lineHeight;
      if (typeof n.tracking !== "number" || !Number.isFinite(n.tracking)) delete n.tracking;
      if (n.align !== "left" && n.align !== "center" && n.align !== "right") delete n.align;
      if (typeof n.hScale !== "number" || !(n.hScale > 0)) delete n.hScale;
      if (typeof n.vScale !== "number" || !(n.vScale > 0)) delete n.vScale;
      if (typeof n.baseline !== "number" || !Number.isFinite(n.baseline)) delete n.baseline;
      if (n.textDirection !== "vertical") delete n.textDirection;
      if (n.underline !== true) delete n.underline;
      if (n.strike !== true) delete n.strike;
      if (n.kinsoku !== true) delete n.kinsoku;
      if (n.punctCompress !== true) delete n.punctCompress;
      if (n.textMode === "path" && Array.isArray(n.pathSubpaths) && n.pathSubpaths.length) {
        delete n.textDirection;
        if (typeof n.pathStart !== "number" || !Number.isFinite(n.pathStart) || n.pathStart < 0) delete n.pathStart;
        if (n.pathSide !== "left" && n.pathSide !== "right") delete n.pathSide;
        delete n.boxW;
        delete n.boxH;
        delete n.areaVAlign;
        delete n.firstIndent;
        delete n.hangingIndent;
        delete n.leftIndent;
        delete n.rightIndent;
        delete n.textInset;
        delete n.paraSpace;
        delete n.spaceBefore;
        delete n.spaceAfter;
        delete n.columns;
        delete n.columnGutter;
        delete n.kinsoku;
        delete n.punctCompress;
      } else if (n.textMode === "area") {
        delete n.pathSubpaths;
        delete n.pathStart;
        delete n.pathSide;
        if (typeof n.boxW !== "number" || !(n.boxW > 0)) n.boxW = 120;
        if (typeof n.boxH !== "number" || !(n.boxH > 0)) n.boxH = 60;
        if (n.areaVAlign !== "top" && n.areaVAlign !== "middle" && n.areaVAlign !== "bottom") delete n.areaVAlign;
        if (typeof n.firstIndent !== "number" || !Number.isFinite(n.firstIndent) || n.firstIndent < 0) delete n.firstIndent;
        if (typeof n.hangingIndent !== "number" || !Number.isFinite(n.hangingIndent) || n.hangingIndent < 0) delete n.hangingIndent;
        if (typeof n.leftIndent !== "number" || !Number.isFinite(n.leftIndent) || n.leftIndent < 0) delete n.leftIndent;
        if (typeof n.rightIndent !== "number" || !Number.isFinite(n.rightIndent) || n.rightIndent < 0) delete n.rightIndent;
        if (typeof n.textInset !== "number" || !Number.isFinite(n.textInset) || n.textInset < 0) delete n.textInset;
        else n.textInset = Math.min(n.textInset, 200);
        if (typeof n.paraSpace !== "number" || !Number.isFinite(n.paraSpace) || n.paraSpace < 0) delete n.paraSpace;
        if (typeof n.spaceBefore !== "number" || !Number.isFinite(n.spaceBefore) || n.spaceBefore < 0) delete n.spaceBefore;
        if (typeof n.spaceAfter !== "number" || !Number.isFinite(n.spaceAfter) || n.spaceAfter < 0) delete n.spaceAfter;
        if (typeof n.columns !== "number" || !Number.isFinite(n.columns) || n.columns < 2 || n.columns > 6) delete n.columns;
        else n.columns = Math.round(n.columns);
        if (typeof n.columnGutter !== "number" || !Number.isFinite(n.columnGutter) || n.columnGutter < 0) delete n.columnGutter;
      } else {
        delete n.textMode;
        delete n.boxW;
        delete n.boxH;
        delete n.areaVAlign;
        delete n.firstIndent;
        delete n.hangingIndent;
        delete n.leftIndent;
        delete n.rightIndent;
        delete n.textInset;
        delete n.paraSpace;
        delete n.spaceBefore;
        delete n.spaceAfter;
        delete n.columns;
        delete n.columnGutter;
        delete n.kinsoku;
        delete n.pathSubpaths;
        delete n.pathStart;
        delete n.pathSide;
      }
    }
    if ((n.kind === "path" || n.kind === "text") && n.stroke) {
      if (!Array.isArray(n.stroke.dash)) n.stroke.dash = [];
      if (typeof n.stroke.width !== "number") n.stroke.width = 1;
      if (!n.stroke.arrow) n.stroke.arrow = "none";
      if (n.stroke.kind === "linear" || n.stroke.kind === "radial") {
        n.stroke.grad = {
          angle: Number.isFinite(n.stroke.grad?.angle) ? (n.stroke.grad?.angle as number) : 0,
          stops: normalizeGradStops(n.stroke.grad?.stops, n.stroke.color || "#000000"),
        };
      } else if (n.stroke.grad) {
        n.stroke.grad = {
          angle: Number.isFinite(n.stroke.grad.angle) ? n.stroke.grad.angle : 0,
          stops: normalizeGradStops(n.stroke.grad.stops, n.stroke.color || "#000000"),
        };
      }
      if (n.stroke.cap !== "round" && n.stroke.cap !== "square") n.stroke.cap = "butt";
      if (n.stroke.join !== "round" && n.stroke.join !== "bevel") n.stroke.join = "miter";
      if (n.stroke.swatch && !swatchIds.has(n.stroke.swatch)) delete n.stroke.swatch;
      if (n.kind === "text") {
        delete n.stroke.brushId;
        delete n.stroke.widthPoints;
        n.stroke.arrow = "none";
      } else if (n.stroke.widthPoints !== undefined) {
        const points = normalizeWidthPoints(n.stroke.widthPoints);
        if (points.length >= 2) n.stroke.widthPoints = points;
        else delete n.stroke.widthPoints;
      }
    }
  }
  for (const id of danglingSymbols) {
    delete doc.nodes[id];
    doc.root = doc.root.filter((r) => r !== id);
    for (const n of Object.values(doc.nodes)) {
      if (n.kind === "group") n.children = n.children.filter((c) => c !== id);
    }
  }
  cleanPatternLinks(doc);
  cleanBrushLinks(doc);
  normalizeAppearance(doc);
  return doc;
}
