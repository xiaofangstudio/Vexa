#!/usr/bin/env node
/**
 * Vexa MCP · 本地工程桥
 *
 * 三条设计原则（与界面共享同一份工程格式，不另立一套）：
 *   1. 单一事实来源：文档结构、形状几何、颜色与描边语义全部按 src/core 里的 .vex 约定来；
 *   2. 零业务逻辑：工具只做“读工程 → 改 doc → 写回”，不缓存、不猜状态；
 *   3. 路径安全：绝对路径 + .vex 结尾 + 必须落在 VEXA_MCP_ROOT 之内。
 *
 * 用法：
 *   node mcp/vexa-mcp.mjs                  # stdio server
 *   node mcp/vexa-mcp.mjs --selftest       # 自检后退出，不碰磁盘
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** 允许访问的根目录：默认是仓库根（mcp 的上一级）。 */
const ROOT = path.resolve(process.env.VEXA_MCP_ROOT || path.join(__dirname, ".."));
const KAPPA = 0.5522847498;

/* ================= 基础工具 ================= */

class ToolError extends Error {}

function ok(payload) {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

function fail(message, extra = {}) {
  return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: message, ...extra }, null, 2) }] };
}

function guard(fn) {
  return async (args) => {
    try {
      return await fn(args ?? {});
    } catch (e) {
      if (e instanceof ToolError) return fail(e.message);
      return fail(e instanceof Error ? e.message : String(e));
    }
  };
}

const HEX = /^#[0-9a-fA-F]{6}$/;

function color(v, fallback = "#0f76d6") {
  return typeof v === "string" && HEX.test(v) ? v : fallback;
}

function num(v, fallback) {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function resolveProjectPath(p, { mustExist = false, mustNotExist = false } = {}) {
  if (typeof p !== "string" || !p.trim()) throw new ToolError("path 必填");
  if (!path.isAbsolute(p)) throw new ToolError("path 必须是绝对路径");
  const full = path.resolve(p);
  if (!full.toLowerCase().endsWith(".vex")) throw new ToolError("只接受 .vex 工程文件");
  const rel = path.relative(ROOT, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new ToolError(`路径越界：必须落在 ${ROOT} 之内`);
  }
  if (mustExist && !fs.existsSync(full)) throw new ToolError(`文件不存在：${full}`);
  if (mustNotExist && fs.existsSync(full)) throw new ToolError(`文件已存在，换一个名字：${full}`);
  return full;
}

/* ================= 文档模型 ================= */

function newDoc(name, w, h, bg) {
  return {
    format: "vexa",
    version: 1,
    name,
    unit: "px",
    artboards: [{ id: "a1", name, x: 0, y: 0, w, h, bg }],
    nodes: {},
    root: [],
    seq: 1,
  };
}

function nextId(doc, prefix) {
  let id = `${prefix}${doc.seq}`;
  while (doc.nodes[id]) {
    doc.seq += 1;
    id = `${prefix}${doc.seq}`;
  }
  doc.seq += 1;
  return id;
}

async function readDoc(p) {
  const full = resolveProjectPath(p, { mustExist: true });
  let parsed;
  try {
    parsed = JSON.parse(await fsp.readFile(full, "utf8"));
  } catch {
    throw new ToolError("不是合法 JSON，读不出工程");
  }
  if (!parsed || parsed.format !== "vexa" || !parsed.doc) throw new ToolError("不是 Vexa 工程文件（format 应为 vexa）");
  const doc = parsed.doc;
  if (!Array.isArray(doc.root) || typeof doc.nodes !== "object") throw new ToolError("工程缺少 root / nodes");
  doc.seq = num(doc.seq, 1);
  return { full, file: parsed, doc };
}

async function writeDoc(p, doc) {
  const full = resolveProjectPath(p);
  const payload = {
    format: "vexa",
    version: 1,
    generator: "Vexa MCP 0.1.0 · 小方工作室",
    savedAt: new Date().toISOString(),
    doc,
  };
  await fsp.mkdir(path.dirname(full), { recursive: true });
  const tmp = `${full}.tmp-${process.pid}`;
  await fsp.writeFile(tmp, JSON.stringify(payload, null, 1), "utf8");
  await fsp.rename(tmp, full);
  return full;
}

/* ================= 几何 ================= */

const anchor = (x, y, hIn = null, hOut = null, smooth = false) => ({ x, y, hIn, hOut, smooth });

function rectSub(x, y, w, h) {
  const a = [anchor(x, y), anchor(x + w, y), anchor(x + w, y + h), anchor(x, y + h)];
  return { anchors: a, closed: true };
}

function ellipseSub(cx, cy, rx, ry) {
  const ox = rx * KAPPA;
  const oy = ry * KAPPA;
  const a = [
    anchor(cx, cy - ry, anchor(cx - ox, cy - ry), anchor(cx + ox, cy - ry), true),
    anchor(cx + rx, cy, anchor(cx + rx, cy - oy), anchor(cx + rx, cy + oy), true),
    anchor(cx, cy + ry, anchor(cx + ox, cy + ry), anchor(cx - ox, cy + ry), true),
    anchor(cx - rx, cy, anchor(cx - rx, cy + oy), anchor(cx - rx, cy - oy), true),
  ];
  return { anchors: a, closed: true };
}

function polygonSub(cx, cy, rx, ry, sides) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const t = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
    pts.push(anchor(cx + rx * Math.cos(t), cy + ry * Math.sin(t)));
  }
  return { anchors: pts, closed: true };
}

function starSub(cx, cy, rx, ry, points, inner) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const t = -Math.PI / 2 + (i * Math.PI) / points;
    const s = i % 2 === 0 ? 1 : inner;
    pts.push(anchor(cx + rx * s * Math.cos(t), cy + ry * s * Math.sin(t)));
  }
  return { anchors: pts, closed: true };
}

function roundRectSub(x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  const ox = rr * KAPPA;
  const a = [
    anchor(x + rr, y, null, anchor(x + rr - ox, y)),
    anchor(x + w - rr, y, anchor(x + w - rr + ox, y)),
    anchor(x + w, y + rr, anchor(x + w, y + rr - ox)),
    anchor(x + w, y + h - rr, anchor(x + w, y + h - rr + ox)),
    anchor(x + w - rr, y + h, anchor(x + w - rr + ox, y + h)),
    anchor(x + rr, y + h, anchor(x + rr - ox, y + h)),
    anchor(x, y + h - rr, anchor(x, y + h - rr + ox)),
    anchor(x, y + rr, anchor(x, y + rr - ox)),
  ];
  return { anchors: a, closed: true };
}

function boundsOfDocNode(node) {
  if (node.kind === "path") {
    const pts = node.subpaths.flatMap((s) => s.anchors);
    if (!pts.length) return { x: 0, y: 0, w: 0, h: 0 };
    const minX = Math.min(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxX = Math.max(...pts.map((p) => p.x));
    const maxY = Math.max(...pts.map((p) => p.y));
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  if (node.kind === "text") {
    const lines = node.text.split("\n").length;
    const longest = Math.max(1, ...node.text.split("\n").map((l) => l.length));
    return { x: node.x, y: node.y - node.size, w: longest * node.size * 0.62, h: lines * node.size * 1.25 };
  }
  if (node.kind === "image") return { x: node.x, y: node.y, w: node.w, h: node.h };
  return { x: 0, y: 0, w: 0, h: 0 };
}

function translateNode(node, dx, dy) {
  if (node.kind === "path") {
    for (const s of node.subpaths) {
      for (const a of s.anchors) {
        a.x += dx;
        a.y += dy;
        if (a.hIn) {
          a.hIn.x += dx;
          a.hIn.y += dy;
        }
        if (a.hOut) {
          a.hOut.x += dx;
          a.hOut.y += dy;
        }
      }
    }
  } else if (node.kind === "text" || node.kind === "image") {
    node.x += dx;
    node.y += dy;
  }
}

function scaleNode(node, sx, sy, ox, oy) {
  const f = (p) => {
    p.x = ox + (p.x - ox) * sx;
    p.y = oy + (p.y - oy) * sy;
  };
  if (node.kind === "path") {
    for (const s of node.subpaths) {
      for (const a of s.anchors) {
        f(a);
        if (a.hIn) f(a.hIn);
        if (a.hOut) f(a.hOut);
      }
    }
  } else if (node.kind === "image") {
    node.x = ox + (node.x - ox) * sx;
    node.y = oy + (node.y - oy) * sy;
    node.w *= sx;
    node.h *= sy;
  } else if (node.kind === "text") {
    node.x = ox + (node.x - ox) * sx;
    node.y = oy + (node.y - oy) * sy;
    node.size *= Math.max(Math.abs(sx), Math.abs(sy)) || 1;
  }
}

function rotateNode(node, deg, cx, cy) {
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const f = (p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    p.x = cx + dx * c - dy * s;
    p.y = cy + dx * s + dy * c;
  };
  if (node.kind === "path") {
    for (const sp of node.subpaths) {
      for (const a of sp.anchors) {
        f(a);
        if (a.hIn) f(a.hIn);
        if (a.hOut) f(a.hOut);
      }
    }
  } else if (node.kind === "image" || node.kind === "text") {
    // 只转位置（图像/文字的旋转不在本工具范围内，保持正交）
    const p = { x: node.x, y: node.y };
    f(p);
    node.x = p.x;
    node.y = p.y;
  }
}

/* ================= 工程操作 ================= */

function paintArgOf(fill, fallback = "#0f76d6") {
  const f = fill ?? {};
  const from = color(f.color, fallback);
  const listed = Array.isArray(f.stops)
    ? f.stops
        .filter((s) => s && Number.isFinite(s.offset))
        .map((s) => ({ offset: Math.min(1, Math.max(0, s.offset)), color: color(s.color, from) }))
        .sort((a, b) => a.offset - b.offset)
    : [];
  const stops = listed.length >= 2
    ? listed
    : f.to
      ? [
          { offset: 0, color: from },
          { offset: 1, color: color(f.to, "#ffffff") },
        ]
      : null;
  if (stops) {
    const kind = f.kind === "radial" ? "radial" : "linear";
    return { kind, color: from, opacity: num(f.opacity, 1), grad: { angle: num(f.angle, 90), stops } };
  }
  return { kind: "solid", color: from, opacity: num(f.opacity, 1) };
}

function strokeOf(stroke) {
  if (!stroke) return { kind: "none", color: "#17171c", opacity: 1, width: 1, dash: [], cap: "butt", join: "miter", arrow: "none" };
  const dash = Array.isArray(stroke.dash) ? stroke.dash.filter((n) => Number.isFinite(n) && n >= 0) : [];
  const width = num(stroke.width, 1);
  const cap = ["butt", "round", "square"].includes(stroke.cap) ? stroke.cap : "butt";
  const join = ["miter", "round", "bevel"].includes(stroke.join) ? stroke.join : "miter";
  const arrow = ["none", "triangle", "open", "diamond"].includes(stroke.arrow) ? stroke.arrow : "none";
  return { kind: width > 0 ? "solid" : "none", color: color(stroke.color, "#17171c"), opacity: num(stroke.opacity, 1), width, dash, cap, join, arrow };
}

function addShapeNode(doc, spec) {
  const b = {
    x: num(spec.x, 0),
    y: num(spec.y, 0),
    w: Math.max(0.01, num(spec.w, 100)),
    h: Math.max(0.01, num(spec.h, 100)),
  };
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const rx = b.w / 2;
  const ry = b.h / 2;
  let subpaths;
  switch (spec.shape) {
    case "rect":
      subpaths = [rectSub(b.x, b.y, b.w, b.h)];
      break;
    case "roundrect":
      subpaths = [roundRectSub(b.x, b.y, b.w, b.h, num(spec.radius, 12))];
      break;
    case "ellipse":
      subpaths = [ellipseSub(cx, cy, rx, ry)];
      break;
    case "polygon":
      subpaths = [polygonSub(cx, cy, rx, ry, Math.round(num(spec.sides, 5)) || 5)];
      break;
    case "star":
      subpaths = [
        starSub(cx, cy, rx, ry, Math.round(num(spec.points, 5)) || 5, Math.min(0.95, Math.max(0.05, num(spec.inner, 0.5)))),
      ];
      break;
    default:
      throw new ToolError("shape 只支持 rect / roundrect / ellipse / polygon / star");
  }
  const id = nextId(doc, "mcp");
  const node = {
    kind: "path",
    id,
    name: spec.name || `MCP ${spec.shape}`,
    subpaths,
    fill: paintArgOf(spec.fill),
    stroke: strokeOf(spec.stroke),
    opacity: 1,
    visible: true,
    locked: false,
  };
  doc.nodes[id] = node;
  doc.root.push(id);
  return node;
}

function pickNode(doc, id) {
  if (id) {
    const n = doc.nodes[id];
    if (!n) throw new ToolError(`找不到节点：${id}`);
    return n;
  }
  const last = doc.root[doc.root.length - 1];
  if (!last || !doc.nodes[last]) throw new ToolError("工程里还没有对象，先 add_shape / add_text");
  return doc.nodes[last];
}

function containerListOf(doc, id) {
  if (doc.root.includes(id)) return doc.root;
  for (const n of Object.values(doc.nodes)) {
    if (n.kind === "group" && n.children.includes(id)) return n.children;
  }
  return doc.root;
}

function removeFromParent(doc, id) {
  const list = containerListOf(doc, id);
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1);
}

function summarize(doc, { geometry = false } = {}) {
  const board = doc.artboards[0] ?? {};
  const walk = (id, depth) => {
    const n = doc.nodes[id];
    if (!n) return null;
    const base = {
      id: n.id,
      kind: n.kind,
      name: n.name,
      visible: n.visible !== false,
      locked: !!n.locked,
      opacity: n.opacity ?? 1,
      box: boundsOfDocNode(n),
    };
    if (n.kind === "path") {
      base.subpaths = n.subpaths.length;
      base.anchors = n.subpaths.reduce((s, sp) => s + sp.anchors.length, 0);
      base.fill = n.fill?.kind ?? "none";
      base.strokeWidth = n.stroke?.width ?? 0;
      if (geometry) base.geometry = n.subpaths;
    }
    if (n.kind === "text") {
      base.text = n.text;
      base.size = n.size;
      if (geometry) base.geometry = { x: n.x, y: n.y };
    }
    if (n.kind === "image") {
      base.w = n.w;
      base.h = n.h;
      base.embedded = typeof n.src === "string" && n.src.length;
    }
    if (n.kind === "group") {
      base.children = n.children.map((c) => walk(c, depth + 1)).filter(Boolean);
    }
    return base;
  };
  return {
    path: null,
    name: doc.name,
    version: doc.version,
    unit: doc.unit,
    seq: doc.seq,
    artboard: { id: board.id, name: board.name, x: board.x, y: board.y, w: board.w, h: board.h, bg: board.bg },
    artboards: doc.artboards.length,
    count: doc.root.length,
    tree: doc.root.map((id) => walk(id, 0)).filter(Boolean),
  };
}

/* ================= SVG 导出（与界面同一套语义） ================= */

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const round = (n) => Math.round(n * 1000) / 1000;

function pathD(node) {
  const parts = [];
  for (const sp of node.subpaths) {
    const a = sp.anchors;
    if (!a.length) continue;
    parts.push(`M${round(a[0].x)} ${round(a[0].y)}`);
    const count = sp.closed ? a.length : a.length - 1;
    for (let i = 0; i < count; i++) {
      const p = a[i];
      const q = a[(i + 1) % a.length];
      if (!p.hOut && !q.hIn) parts.push(`L${round(q.x)} ${round(q.y)}`);
      else {
        const c1 = p.hOut ?? p;
        const c2 = q.hIn ?? q;
        parts.push(`C${round(c1.x)} ${round(c1.y)} ${round(c2.x)} ${round(c2.y)} ${round(q.x)} ${round(q.y)}`);
      }
    }
    if (sp.closed) parts.push("Z");
  }
  return parts.join(" ");
}

function fillAttrs(fill, box, defs, id) {
  if (!fill || fill.kind === "none") return ` fill="none"`;
  const stops = fill.grad?.stops
    ?.map((s) => `      <stop offset="${round(s.offset)}" stop-color="${s.color}"/>`)
    .join("\n") ?? "";
  if ((fill.kind === "linear" || fill.kind === "radial") && fill.grad) {
    if (fill.kind === "radial") {
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      const r = Math.hypot(box.w, box.h) / 2;
      defs.push(`    <radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${round(cx)}" cy="${round(cy)}" r="${round(r)}">\n${stops}\n    </radialGradient>`);
    } else {
      const rad = (fill.grad.angle * Math.PI) / 180;
      const dx = Math.cos(rad);
      const dy = Math.sin(rad);
      const len = Math.abs(box.w * dx) + Math.abs(box.h * dy);
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      defs.push(
        `    <linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${round(cx - (dx * len) / 2)}" y1="${round(cy - (dy * len) / 2)}" x2="${round(cx + (dx * len) / 2)}" y2="${round(cy + (dy * len) / 2)}">\n${stops}\n    </linearGradient>`,
      );
    }
    return ` fill="url(#${id})" fill-opacity="${round(fill.opacity ?? 1)}"`;
  }
  return ` fill="${fill.color}" fill-opacity="${round(fill.opacity ?? 1)}"`;
}

function arrowAttrs(stroke, defs, id) {
  const kind = stroke?.arrow && stroke.arrow !== "none" ? stroke.arrow : "";
  if (!kind) return "";
  const body =
    kind === "triangle"
      ? `<path d="M1 1 L9 5 L1 9 Z" fill="${stroke.color}"/>`
      : kind === "diamond"
        ? `<path d="M1 5 L5 1 L9 5 L5 9 Z" fill="${stroke.color}"/>`
        : `<path d="M1.5 1.5 L8.5 5 L1.5 8.5" fill="none" stroke="${stroke.color}" stroke-width="1.6"/>`;
  defs.push(
    `    <marker id="${id}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="2.2" markerHeight="2.2" orient="auto" markerUnits="strokeWidth">\n      ${body}\n    </marker>`,
  );
  return ` marker-end="url(#${id})"`;
}

function docToSVG(doc) {
  const defs = [];
  let seq = 0;
  const nodeSVG = (n, indent) => {
    if (n.visible === false) return "";
    const op = (n.opacity ?? 1) < 1 ? ` opacity="${round(n.opacity)}"` : "";
    if (n.kind === "path") {
      const box = boundsOfDocNode(n);
      const fill = fillAttrs(n.fill, box, defs, `g${seq++}`);
      let stroke = ` stroke="none"`;
      if (n.stroke && n.stroke.kind !== "none" && n.stroke.width > 0) {
        stroke = ` stroke="${n.stroke.color}" stroke-opacity="${round(n.stroke.opacity ?? 1)}" stroke-width="${round(n.stroke.width)}"`;
        stroke += ` stroke-linecap="${n.stroke.cap ?? "butt"}" stroke-linejoin="${n.stroke.join ?? "miter"}"`;
        if (n.stroke.dash?.length) stroke += ` stroke-dasharray="${n.stroke.dash.map(round).join(" ")}"`;
        const hasOpen = (n.subpaths ?? []).some((s) => !s.closed && s.anchors.length > 1);
        if (hasOpen) stroke += arrowAttrs(n.stroke, defs, `a${seq}`);
      }
      return `${indent}<path d="${pathD(n)}"${fill}${stroke}${op}/>\n`;
    }
    if (n.kind === "text") {
      const fill = fillAttrs(n.fill, boundsOfDocNode(n), defs, `g${seq++}`);
      const lines = n.text.split("\n");
      const body = lines
        .map((l, i) => `${indent}  <tspan x="${round(n.x)}" dy="${i === 0 ? 0 : round(n.size * 1.25)}">${esc(l)}</tspan>`)
        .join("\n");
      return `${indent}<text x="${round(n.x)}" y="${round(n.y)}" font-family="${esc(n.font || "sans-serif")}" font-size="${round(n.size)}"${fill}${op}>\n${body}\n${indent}</text>\n`;
    }
    if (n.kind === "image") {
      return `${indent}<image x="${round(n.x)}" y="${round(n.y)}" width="${round(n.w)}" height="${round(n.h)}" href="${esc(n.src)}"${op}/>\n`;
    }
    const kids = n.children
      .map((id) => doc.nodes[id])
      .filter(Boolean)
      .map((c) => nodeSVG(c, indent + "  "))
      .join("");
    return `${indent}<g${op}>\n${kids}${indent}</g>\n`;
  };
  const board = doc.artboards[0] ?? { x: 0, y: 0, w: 1000, h: 1000, bg: "#ffffff", name: "画板 1" };
  const body = doc.root
    .map((id) => doc.nodes[id])
    .filter(Boolean)
    .map((n) => nodeSVG(n, "      "))
    .join("");
  const defsBlock = defs.length ? `  <defs>\n${defs.join("\n")}\n  </defs>\n` : "";
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"`,
    `     width="${round(board.w)}" height="${round(board.h)}" viewBox="0 0 ${round(board.w)} ${round(board.h)}"`,
    `     version="1.1" data-generator="Vexa MCP">`,
    `  <!-- ${esc(doc.name)} · 小方工作室 Vexa -->`,
    defsBlock + `    <g id="board-0" data-name="${esc(board.name)}">`,
    `      <rect x="${round(board.x)}" y="${round(board.y)}" width="${round(board.w)}" height="${round(board.h)}" fill="${board.bg}"/>`,
    body.trimEnd(),
    `    </g>`,
    `</svg>`,
    ``,
  ].join("\n");
}

/* ================= 工具定义 ================= */

const pathArg = z.string().describe("工程绝对路径，必须以 .vex 结尾且落在 VEXA_MCP_ROOT 内");
const fillArg = z
  .object({
    color: z.string().optional().describe("#rrggbb 起点色/实色"),
    to: z.string().optional().describe("两色渐变的终点色"),
    stops: z
      .array(z.object({ offset: z.number().min(0).max(1), color: z.string() }))
      .min(2)
      .optional()
      .describe("多色渐变；优先于 to，offset 0..1"),
    kind: z.enum(["linear", "radial"]).optional().describe("渐变类型，默认 linear"),
    angle: z.number().optional().describe("线性渐变角度，0 向右、90 向下"),
    opacity: z.number().min(0).max(1).optional(),
  })
  .optional();
const strokeArg = z
  .object({
    color: z.string().optional(),
    width: z.number().min(0).optional(),
    dash: z.array(z.number().min(0)).optional().describe("虚线节奏，如 [6,4]"),
    cap: z.enum(["butt", "round", "square"]).optional().describe("开放路径端帽"),
    join: z.enum(["miter", "round", "bevel"]).optional().describe("拐角连接"),
    arrow: z.enum(["none", "triangle", "open", "diamond"]).optional().describe("开放路径末端箭头"),
    opacity: z.number().min(0).max(1).optional(),
  })
  .optional();

const server = new McpServer({ name: "vexa-mcp", version: "0.1.0" });

server.registerTool(
  "vexa_capabilities",
  {
    title: "Vexa 能力清单",
    description:
      "返回 Vexa 的工程格式、支持的形状 / 填充 / 描边 / 工具清单与安全边界。" + "调用其它 vexa_* 之前先读一次，避免凭记忆编造参数。",
    inputSchema: {},
  },
  guard(async () => {
    return ok({
      product: "Vexa 0.1.0 · 小方工作室",
      format: {
        ext: ".vex",
        shape: "{ format:'vexa', version:1, generator, savedAt, doc }",
        doc: {
          name: "string",
          unit: "px",
          artboards: [{ id, name, x, y, w, h, bg }],
          nodes: "Record<id, PathNode|TextNode|ImageNode|GroupNode>",
          root: "string[]（末尾在最上）",
          seq: "number（下一个可用序号）",
        },
        pathNode: { subpaths: [{ anchors: [{ x, y, hIn, hOut, smooth }], closed }], fill, stroke, blend, clip },
        paint: "none | solid{color,opacity} | linear{grad:{angle,stops[]},opacity} | radial{grad:{stops[]},opacity}",
        stroke: "none | solid{color,width,dash[],cap,join,arrow}",
        extra: { blend: "16 档，同 CSS mix-blend-mode", clip: "组字段：裁切轮廓子节点 id" },
      },
      shapes: ["rect", "roundrect", "ellipse", "polygon", "star"],
      tools: [
        "vexa_capabilities",
        "vexa_read_project",
        "vexa_create_project",
        "vexa_add_shape",
        "vexa_add_text",
        "vexa_set_paint",
        "vexa_transform",
        "vexa_arrange",
        "vexa_delete",
        "vexa_export_svg",
        "vexa_validate",
      ],
      safety: { root: ROOT, absolutePath: true, ext: ".vex", network: "none", ai: "none" },
      app: {
        editor: "Rust + Tauri v2 + React 19",
        export: ["SVG", "PNG", "PDF（走打印）"],
        offline: true,
      },
    });
  }),
);

server.registerTool(
  "vexa_read_project",
  {
    title: "读取 .vex 工程",
    description: "返回工程摘要：画板、对象树、包围盒、填充与描边类型。includeGeometry=true 时附上锚点几何。",
    inputSchema: { path: pathArg, includeGeometry: z.boolean().optional() },
  },
  guard(async ({ path: p, includeGeometry }) => {
    const { full, doc } = await readDoc(p);
    const s = summarize(doc, { geometry: !!includeGeometry });
    s.path = full;
    return ok(s);
  }),
);

server.registerTool(
  "vexa_create_project",
  {
    title: "新建 .vex 工程",
    description: "在受管目录内新建一个空白工程（默认 1080×1080、白底）。目标文件已存在会拒绝，避免覆盖。",
    inputSchema: {
      path: pathArg,
      name: z.string().optional(),
      width: z.number().min(1).max(20000).optional(),
      height: z.number().min(1).max(20000).optional(),
      bg: z.string().optional(),
    },
  },
  guard(async ({ path: p, name, width, height, bg }) => {
    const full = resolveProjectPath(p, { mustNotExist: true });
    const w = Math.round(num(width, 1080));
    const h = Math.round(num(height, 1080));
    const doc = newDoc(name || path.basename(full, path.extname(full)), w, h, color(bg, "#ffffff"));
    await writeDoc(full, doc);
    return ok({ path: full, name: doc.name, width: w, height: h });
  }),
);

server.registerTool(
  "vexa_add_shape",
  {
    title: "添加形状",
    description: "在末尾加一个矢量形状（矩形 / 圆角矩形 / 椭圆 / 正多边形 / 星形），支持实色或线性渐变填充与虚线描边。",
    inputSchema: {
      path: pathArg,
      shape: z.enum(["rect", "roundrect", "ellipse", "polygon", "star"]),
      x: z.number().optional(),
      y: z.number().optional(),
      w: z.number().min(0.01).optional(),
      h: z.number().min(0.01).optional(),
      radius: z.number().min(0).optional().describe("圆角矩形的半径"),
      sides: z.number().min(3).max(64).optional(),
      points: z.number().min(3).max(64).optional(),
      inner: z.number().min(0.05).max(0.95).optional().describe("星形内径比"),
      fill: fillArg,
      stroke: strokeArg,
      name: z.string().optional(),
    },
  },
  guard(async (args) => {
    const { doc } = await readDoc(args.path);
    const node = addShapeNode(doc, args);
    await writeDoc(args.path, doc);
    return ok({ id: node.id, kind: node.kind, box: boundsOfDocNode(node), anchors: node.subpaths[0].anchors.length });
  }),
);

server.registerTool(
  "vexa_add_text",
  {
    title: "添加文字",
    description: "在末尾加一个文字对象。x/y 是基线左端起点，size 是像素字号。",
    inputSchema: {
      path: pathArg,
      text: z.string().min(1),
      x: z.number().optional(),
      y: z.number().optional(),
      size: z.number().min(1).max(2000).optional(),
      color: z.string().optional(),
      font: z.string().optional(),
    },
  },
  guard(async ({ path: p, text, x, y, size, color: c, font }) => {
    const { doc } = await readDoc(p);
    const id = nextId(doc, "tx");
    doc.nodes[id] = {
      kind: "text",
      id,
      name: text.slice(0, 24),
      x: num(x, 10),
      y: num(y, 10),
      text,
      size: num(size, 32),
      font: font || 'Segoe UI, Microsoft YaHei UI, sans-serif',
      fill: { kind: "solid", color: color(c, "#17171c"), opacity: 1 },
      opacity: 1,
      visible: true,
      locked: false,
    };
    doc.root.push(id);
    await writeDoc(p, doc);
    return ok({ id, kind: "text" });
  }),
);

server.registerTool(
  "vexa_set_paint",
  {
    title: "修改填充 / 描边",
    description: "改指定对象的填充与描边；id 省略时改最上层对象。fill 给 to 或 stops 即为渐变，stroke.width=0 等于去掉描边；cap/join 控制端帽与拐角。",
    inputSchema: {
      path: pathArg,
      id: z.string().optional(),
      fill: fillArg,
      stroke: strokeArg,
      opacity: z.number().min(0).max(1).optional(),
    },
  },
  guard(async ({ path: p, id, fill, stroke, opacity }) => {
    const { doc } = await readDoc(p);
    const node = pickNode(doc, id);
    if (!("fill" in node) && (fill || stroke)) throw new ToolError(`${node.kind} 不支持填充/描边`);
    if (fill && "fill" in node) node.fill = paintArgOf(fill, node.fill?.color ?? "#0f76d6");
    if (stroke && node.kind === "path") node.stroke = strokeOf(stroke);
    if (typeof opacity === "number") node.opacity = opacity;
    await writeDoc(p, doc);
    return ok({ id: node.id, fill: node.fill?.kind ?? null, stroke: node.stroke?.kind ?? null });
  }),
);

server.registerTool(
  "vexa_transform",
  {
    title: "变换对象",
    description: "平移 / 旋转（围绕包围盒中心）/ 缩放（围绕包围盒左上）/ 翻转。参数可叠加，按平移→旋转→缩放顺序执行。",
    inputSchema: {
      path: pathArg,
      id: z.string().optional(),
      dx: z.number().optional(),
      dy: z.number().optional(),
      rotate: z.number().optional().describe("角度，顺时针为正"),
      scaleX: z.number().optional(),
      scaleY: z.number().optional(),
      flipX: z.boolean().optional(),
      flipY: z.boolean().optional(),
    },
  },
  guard(async ({ path: p, id, dx, dy, rotate, scaleX, scaleY, flipX, flipY }) => {
    const { doc } = await readDoc(p);
    const node = pickNode(doc, id);
    const before = boundsOfDocNode(node);
    const cx = before.x + before.w / 2;
    const cy = before.y + before.h / 2;
    if (num(dx, 0) || num(dy, 0)) translateNode(node, num(dx, 0), num(dy, 0));
    if (num(rotate, 0)) rotateNode(node, num(rotate, 0), cx, cy);
    if (flipX) scaleNode(node, -1, 1, cx, cy);
    if (flipY) scaleNode(node, 1, -1, cx, cy);
    const sx = num(scaleX, 1);
    const sy = num(scaleY, 1);
    if (sx !== 1 || sy !== 1) scaleNode(node, sx, sy, before.x, before.y);
    await writeDoc(p, doc);
    return ok({ id: node.id, before, after: boundsOfDocNode(node) });
  }),
);

server.registerTool(
  "vexa_arrange",
  {
    title: "调整叠放顺序",
    description: "把对象放到顶层 / 底层，或上移、下移一层。组内对象就在组内挪。",
    inputSchema: {
      path: pathArg,
      id: z.string().optional(),
      mode: z.enum(["front", "back", "forward", "backward"]),
    },
  },
  guard(async ({ path: p, id, mode }) => {
    const { doc } = await readDoc(p);
    const node = pickNode(doc, id);
    const list = containerListOf(doc, node.id);
    const i = list.indexOf(node.id);
    if (i < 0) throw new ToolError("对象不在任何容器里");
    list.splice(i, 1);
    if (mode === "front") list.push(node.id);
    else if (mode === "back") list.unshift(node.id);
    else if (mode === "forward") list.splice(Math.min(list.length, i + 1), 0, node.id);
    else list.splice(Math.max(0, i - 1), 0, node.id);
    await writeDoc(p, doc);
    return ok({ id: node.id, index: list.indexOf(node.id), total: list.length });
  }),
);

server.registerTool(
  "vexa_delete",
  {
    title: "删除对象",
    description: "删除指定对象；组会连同子节点一起删除。id 省略时删最上层对象。",
    inputSchema: { path: pathArg, id: z.string().optional() },
  },
  guard(async ({ path: p, id }) => {
    const { doc } = await readDoc(p);
    const node = pickNode(doc, id);
    removeFromParent(doc, node.id);
    const drop = (nid) => {
      const n = doc.nodes[nid];
      if (!n) return;
      if (n.kind === "group") for (const c of n.children) drop(c);
      delete doc.nodes[nid];
    };
    drop(node.id);
    await writeDoc(p, doc);
    return ok({ deleted: node.id, kind: node.kind });
  }),
);

server.registerTool(
  "vexa_export_svg",
  {
    title: "导出 SVG",
    description: "把工程导出为 SVG（保留渐变与虚线）。out 省略时写到同目录同名 .svg。",
    inputSchema: { path: pathArg, out: z.string().optional() },
  },
  guard(async ({ path: p, out }) => {
    const { full, doc } = await readDoc(p);
    const svg = docToSVG(doc);
    const target = out
      ? resolveProjectPath(out.replace(/\.svg$/i, ".vex"), { mustNotExist: false }).replace(/\.vex$/i, ".svg")
      : full.replace(/\.vex$/i, ".svg");
    await fsp.writeFile(target, svg, "utf8");
    return ok({ svg: target, bytes: Buffer.byteLength(svg) });
  }),
);

server.registerTool(
  "vexa_validate",
  {
    title: "校验工程",
    description: "结构自检：格式、画板尺寸、悬垂引用、组子节点缺失、非法颜色与锚点坐标。返回问题列表。",
    inputSchema: { path: pathArg },
  },
  guard(async ({ path: p }) => {
    const { full, doc } = await readDoc(p);
    const issues = [];
    if (!doc.artboards.length) issues.push("没有任何画板");
    for (const b of doc.artboards) {
      if (!(b.w > 0 && b.h > 0)) issues.push(`画板 ${b.id} 尺寸非法`);
      if (!HEX.test(b.bg ?? "")) issues.push(`画板 ${b.id} 背景色不是 #rrggbb`);
    }
    const referenced = new Set();
    const walk = (id, where) => {
      const n = doc.nodes[id];
      if (!n) {
        issues.push(`${where} 引用了不存在的节点 ${id}`);
        return;
      }
      referenced.add(id);
      if (n.kind === "group") for (const c of n.children) walk(c, `组 ${id}`);
      if (n.kind === "path") {
        for (const sp of n.subpaths)
          for (const a of sp.anchors) {
            if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) issues.push(`节点 ${id} 有非法锚点`);
          }
        if (n.fill?.kind === "solid" && !HEX.test(n.fill.color)) issues.push(`节点 ${id} 填充色非法`);
      }
    };
    for (const id of doc.root) walk(id, "root");
    for (const id of Object.keys(doc.nodes)) if (!referenced.has(id)) issues.push(`孤儿节点 ${id} 未被任何容器引用`);
    const summary = summarize(doc);
    summary.path = full;
    return ok({ ok: issues.length === 0, issues, summary });
  }),
);

/* ================= 启动 ================= */

async function selftest() {
  const doc = newDoc("自检", 800, 600, "#ffffff");
  addShapeNode(doc, { shape: "star", x: 100, y: 100, w: 300, h: 300, points: 5, inner: 0.5, fill: { color: "#0f76d6", stops: [{ offset: 0, color: "#0f76d6" }, { offset: 0.45, color: "#ffffff" }, { offset: 1, color: "#e5484d" }] } });
  addShapeNode(doc, { shape: "roundrect", x: 20, y: 20, w: 200, h: 120, radius: 18, stroke: { color: "#17171c", width: 2, dash: [6, 4], cap: "round", join: "bevel" } });
  const node = pickNode(doc, undefined);
  translateNode(node, 5, 5);
  const svg = docToSVG(doc);
  const summary = summarize(doc);
  const checks = [
    ["文档结构", doc.format === "vexa" && doc.root.length === 2],
    ["星形锚点", doc.nodes[doc.root[0]].subpaths[0].anchors.length === 10],
    ["渐变写入", svg.includes("linearGradient")],
    ["多色标", (svg.match(/<stop /g) ?? []).length >= 3],
    ["虚线写入", svg.includes("stroke-dasharray")],
    ["端帽/连接", svg.includes('stroke-linecap="round"') && svg.includes('stroke-linejoin="bevel"')],
    ["摘要可序列化", JSON.stringify(summary).length > 100],
    ["路径守卫生效", (() => {
      try {
        resolveProjectPath("relative.vex");
        return false;
      } catch {
        return true;
      }
    })()],
  ];
  let bad = 0;
  for (const [name, pass] of checks) {
    if (!pass) bad++;
    console.log(`${pass ? "✓" : "✗"} ${name}`);
  }
  console.log(bad ? `自检失败 ${bad} 项` : "自检通过：11 个工具，纯本地，不碰磁盘");
  process.exit(bad ? 1 : 0);
}

if (process.argv.includes("--selftest")) {
  await selftest();
} else {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`vexa-mcp 已就绪 · root=${ROOT} · stdio`);
}
