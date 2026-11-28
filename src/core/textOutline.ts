/** 文字转路径：用本机字体文件的真实字形轮廓生成可编辑贝塞尔路径。 */
import { dist, textLayout, verticalTextLayout } from "./geom";
import { groupNodes, containerOf } from "./vectorOps";
import { anchorAt, noStroke, type Anchor, type PathNode, type SubPath, type TextNode, type VexaDoc } from "./types";
import type { Font, FontCollection } from "fontkit";

export interface OutlineFace {
  font: Font;
  bold: boolean;
  italic: boolean;
}

/** 解析字体文件；TTC 按粗/斜选择最接近的字面。 */
export async function loadOutlineFace(bytes: Uint8Array, bold: boolean, italic: boolean): Promise<OutlineFace> {
  const { create } = await import("fontkit");
  const parsed = create(bytes as unknown as Buffer) as Font | FontCollection;
  let font: Font;
  if ("fonts" in parsed) {
    const faces = parsed.fonts;
    font =
      faces.find((f) => (bold === /bold/i.test(f.subfamilyName)) && (italic === /italic|oblique/i.test(f.subfamilyName))) ??
      faces.find((f) => bold === /bold/i.test(f.subfamilyName)) ??
      faces[0];
  } else font = parsed;
  return {
    font,
    bold: /bold/i.test(font.subfamilyName),
    italic: /italic|oblique/i.test(font.subfamilyName) || Math.abs(font.italicAngle) > 3,
  };
}

interface GlyphPoint {
  x: number;
  y: number;
}

/** 把 fontkit 的字形轮廓命令转成 Vexa 锚点路径，同时应用文字缩放与基线。 */
function glyphSubpaths(
  commands: Array<{ command: string; args: number[] }>,
  tx: (x: number, y: number) => GlyphPoint,
  shiftX = 0,
): SubPath[] {
  const subs: SubPath[] = [];
  let cur: SubPath | null = null;
  let px = 0;
  let py = 0;

  const finish = (closed: boolean) => {
    if (!cur) return;
    if (cur.anchors.length) {
      if (closed && cur.anchors.length > 1) {
        const first = cur.anchors[0];
        const last = cur.anchors[cur.anchors.length - 1];
        if (dist(first, last) < 0.01) {
          first.hIn = last.hIn;
          cur.anchors.pop();
        }
      }
      if (cur.anchors.length >= 2) {
        cur.closed = closed;
        subs.push(cur);
      }
    }
    cur = null;
  };

  const ensure = () => {
    if (!cur) {
      const p = tx(px, py);
      cur = { anchors: [anchorAt(p.x + shiftX, p.y)], closed: false };
    }
    return cur;
  };

  for (const cmd of commands) {
    const args = cmd.args ?? [];
    if (cmd.command === "moveTo") {
      finish(false);
      px = args[0];
      py = args[1];
      const p = tx(px, py);
      cur = { anchors: [anchorAt(p.x + shiftX, p.y)], closed: false };
    } else if (cmd.command === "lineTo") {
      const c = ensure();
      px = args[0];
      py = args[1];
      const p = tx(px, py);
      c.anchors.push(anchorAt(p.x + shiftX, p.y));
    } else if (cmd.command === "quadraticCurveTo") {
      const c = ensure();
      const [cx, cy, ex, ey] = args;
      const prev = c.anchors[c.anchors.length - 1];
      const c1x = px + (2 / 3) * (cx - px);
      const c1y = py + (2 / 3) * (cy - py);
      const c2x = ex + (2 / 3) * (cx - ex);
      const c2y = ey + (2 / 3) * (cy - ey);
      const q1 = tx(c1x, c1y);
      const q2 = tx(c2x, c2y);
      const ep = tx(ex, ey);
      prev.hOut = { x: q1.x + shiftX, y: q1.y };
      const next: Anchor = { x: ep.x + shiftX, y: ep.y, hIn: { x: q2.x + shiftX, y: q2.y }, hOut: null, smooth: false };
      c.anchors.push(next);
      px = ex;
      py = ey;
    } else if (cmd.command === "bezierCurveTo") {
      const c = ensure();
      const [c1x, c1y, c2x, c2y, ex, ey] = args;
      const prev = c.anchors[c.anchors.length - 1];
      const q1 = tx(c1x, c1y);
      const q2 = tx(c2x, c2y);
      const ep = tx(ex, ey);
      prev.hOut = { x: q1.x + shiftX, y: q1.y };
      c.anchors.push({ x: ep.x + shiftX, y: ep.y, hIn: { x: q2.x + shiftX, y: q2.y }, hOut: null, smooth: false });
      px = ex;
      py = ey;
    } else if (cmd.command === "closePath") {
      finish(true);
    }
  }
  finish(false);
  return subs;
}

/** 每个字形一组子路径；返回顺序与文字排版顺序一致。 */
export function outlineText(node: TextNode, face: OutlineFace): SubPath[][] {
  const { font } = face;
  const scale = node.size / font.unitsPerEm;
  const layout = textLayout(node);
  const tracking = node.tracking ?? 0;
  const hs = (node.hScale ?? 100) / 100;
  const vs = (node.vScale ?? 100) / 100;
  const synthItalic = !!node.italic && !face.italic ? 0.22 : 0;
  const synthBold = !!node.bold && !face.bold ? Math.max(0.25, node.size * 0.018) : 0;
  const out: SubPath[][] = [];

  if (layout.mode === "path") {
    for (const c of layout.path?.chars ?? []) {
      if (!c.ch.trim()) continue;
      let glyph;
      try {
        glyph = font.glyphForCodePoint(c.ch.codePointAt(0) ?? 0);
      } catch {
        glyph = font.glyphForCodePoint(0);
      }
      const cos = Math.cos(c.angle);
      const sin = Math.sin(c.angle);
      const tx = (x: number, y: number): GlyphPoint => {
        const gx = (x * scale + y * scale * synthItalic) * hs;
        const gy = y * scale * vs;
        return { x: c.x + gx * cos + gy * sin, y: c.y + gx * sin - gy * cos };
      };
      const commands = (glyph.path?.commands ?? []) as Array<{ command: string; args: number[] }>;
      const subs = glyphSubpaths(commands, tx);
      if (synthBold > 0) subs.push(...glyphSubpaths(commands, tx, Math.abs(synthBold)));
      if (subs.length) out.push(subs);
    }
    return out;
  }

  if (node.textDirection === "vertical") {
    const vertical = verticalTextLayout(node);
    for (const c of vertical.chars) {
      if (!c.ch.trim()) continue;
      let glyph;
      try {
        glyph = font.glyphForCodePoint(c.ch.codePointAt(0) ?? 0);
      } catch {
        glyph = font.glyphForCodePoint(0);
      }
      const cx = c.x;
      const cy = c.y + c.advance / 2;
      const tx = (x: number, y: number, shift = 0): GlyphPoint => {
        const gx = (x * scale + y * scale * synthItalic) * hs + shift;
        const gy = y * scale * vs;
        if (c.rotate) {
          const dx = -c.advance / 2 + gx;
          const dy = node.size * 0.35 - gy;
          return { x: cx - dy, y: cy + dx };
        }
        return { x: cx - c.advance / 2 + gx, y: cy + node.size * 0.35 - gy };
      };
      const commands = (glyph.path?.commands ?? []) as Array<{ command: string; args: number[] }>;
      const subs = glyphSubpaths(commands, tx);
      if (synthBold > 0) subs.push(...glyphSubpaths(commands, (x, y) => tx(x, y, Math.abs(synthBold))));
      if (subs.length) out.push(subs);
    }
    return out;
  }

  for (const line of layout.lines) {
    let pen = 0;
    for (const ch of Array.from(line.text)) {
      let glyph;
      try {
        glyph = font.glyphForCodePoint(ch.codePointAt(0) ?? 0);
      } catch {
        glyph = font.glyphForCodePoint(0);
      }
      const tx = (x: number, y: number): GlyphPoint => ({
        x: line.x + (pen + x * scale + y * scale * synthItalic) * hs,
        y: line.baseline - y * scale * vs,
      });
      const commands = (glyph.path?.commands ?? []) as Array<{ command: string; args: number[] }>;
      const subs = glyphSubpaths(commands, tx);
      if (synthBold > 0) {
        const shifted = glyphSubpaths(commands, tx, Math.abs(synthBold));
        subs.push(...shifted);
      }
      if (subs.length) out.push(subs);
      pen += (glyph.advanceWidth || 0) * scale + tracking;
    }
  }
  return out;
}

/** 用轮廓替换文字节点；每个字形一个路径，多个字形自动编组。 */
export function replaceTextWithOutlines(doc: VexaDoc, textId: string, glyphs: SubPath[][]): string[] {
  const text = doc.nodes[textId];
  if (!text || text.kind !== "text") return [];
  if (!glyphs.length) return [];
  const host = containerOf(doc, textId);
  if (!host) return [];
  const at = host.list.indexOf(textId);
  const ids: string[] = [];
  const gradient = text.fill.kind === "linear" || text.fill.kind === "radial";
  const parts = gradient ? [glyphs.flat()] : glyphs;
  for (const subpaths of parts) {
    if (!subpaths.length) continue;
    let id = `p${doc.seq++}`;
    while (doc.nodes[id]) id = `p${doc.seq++}`;
    const path: PathNode = {
      kind: "path",
      id,
      name: `${text.name || "文字"} 字形`,
      subpaths,
      fill: { ...text.fill },
      stroke: noStroke(),
      opacity: text.opacity,
      visible: text.visible,
      locked: text.locked,
      blend: text.blend,
      tag: text.tag,
    };
    doc.nodes[id] = path;
    ids.push(id);
  }
  host.list.splice(at, 1, ...ids);
  delete doc.nodes[textId];
  if (ids.length === 1) return ids;
  const gid = groupNodes(doc, ids);
  if (gid) {
    const group = doc.nodes[gid];
    if (group?.kind === "group") {
      group.name = `${text.name || "文字"} 轮廓`;
      group.tag = text.tag;
      group.visible = text.visible;
      group.locked = text.locked;
    }
    return [gid];
  }
  return ids;
}
