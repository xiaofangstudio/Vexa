/**
 * 生成 Vexa 图标：品牌蓝圆角方块 + 白色 V 笔迹。
 * 只依赖 Node 内置 zlib，不引第三方包；输出 PNG 32/128/256 与 icon.ico。
 */
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("src-tauri/icons");
fs.mkdirSync(OUT, { recursive: true });

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------- 形状绘制（以 256 为设计栅格，4×4 超采样） ---------- */

const SS = 4;
const D = 256;

function inRoundRect(x, y, inset, radius) {
  const x0 = inset;
  const y0 = inset;
  const x1 = D - inset;
  const y1 = D - inset;
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + radius), x1 - radius);
  const cy = Math.min(Math.max(y, y0 + radius), y1 - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2 || (x >= x0 + radius && x <= x1 - radius) || (y >= y0 + radius && y <= y1 - radius);
}

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const V = [
  [76, 96, 128, 174],
  [128, 174, 180, 96],
];

function sample(x, y) {
  // 返回 [r,g,b,a]
  if (!inRoundRect(x, y, 10, 56)) return [0, 0, 0, 0];
  // 竖向渐变：#1a87e6 → #0958a8
  const t = Math.min(1, Math.max(0, (y - 10) / (D - 20)));
  const r = Math.round(26 * (1 - t) + 9 * t);
  const g = Math.round(135 * (1 - t) + 88 * t);
  const b = Math.round(230 * (1 - t) + 168 * t);
  const onV =
    V.some(([ax, ay, bx, by]) => segDist(x, y, ax, ay, bx, by) <= 11) ||
    segDist(x, y, 102, 139, 154, 139) <= 4.2;
  if (onV) {
    const cross = segDist(x, y, 102, 139, 154, 139) <= 4.2;
    const alpha = cross ? 0.78 : 1;
    return [
      Math.round(r * (1 - alpha) + 255 * alpha),
      Math.round(g * (1 - alpha) + 255 * alpha),
      Math.round(b * (1 - alpha) + 255 * alpha),
      255,
    ];
  }
  return [r, g, b, 255];
}

function render(size) {
  const buf = Buffer.alloc(size * size * 4);
  const scale = size / D;
  const sub = 1 / SS;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) * sub) / scale;
          const y = (py + (sy + 0.5) * sub) / scale;
          const c = sample(x, y);
          r += c[0] * c[3];
          g += c[1] * c[3];
          b += c[2] * c[3];
          a += c[3];
        }
      }
      const n = SS * SS;
      const alpha = a / n;
      const idx = (py * size + px) * 4;
      if (alpha > 0) {
        buf[idx] = Math.round(r / Math.max(a, 1) * 255 / 255);
        buf[idx + 1] = Math.round(g / Math.max(a, 1));
        buf[idx + 2] = Math.round(b / Math.max(a, 1));
      }
      buf[idx + 3] = Math.round(alpha);
    }
  }
  return encodePNG(size, size, buf);
}

const png256 = render(256);
fs.writeFileSync(path.join(OUT, "icon.png"), png256);
fs.writeFileSync(path.join(OUT, "128x128@2x.png"), png256);
fs.writeFileSync(path.join(OUT, "128x128.png"), render(128));
fs.writeFileSync(path.join(OUT, "32x32.png"), render(32));

// ICO：单条 256×256 PNG 压缩条目
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(1, 4);
const entry = Buffer.alloc(16);
entry[0] = 0;
entry[1] = 0;
entry[2] = 0;
entry[3] = 0;
entry.writeUInt16LE(1, 4);
entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(png256.length, 8);
entry.writeUInt32LE(22, 12);
fs.writeFileSync(path.join(OUT, "icon.ico"), Buffer.concat([icoHeader, entry, png256]));

console.log("icons written to", OUT);
