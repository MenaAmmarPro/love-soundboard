"use strict";

/*
 * love-soundboard — dependency-free icon generator.
 *
 * Writes assets/apple-touch-icon.png, assets/icons/icon-192.png,
 * assets/icons/icon-512.png and assets/og-image.png using a tiny PNG encoder
 * (zlib + raw RGBA). Run once from the repo root:
 *
 *   node tools/make-icons.js
 */

const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const ty = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([ty, data])), 0);
  return Buffer.concat([len, ty, data, crc]);
}

function png(w, h, fn) {
  const raw = Buffer.alloc(h * (w * 4 + 1));
  let o = 0;
  for (let y = 0; y < h; y += 1) {
    raw[o++] = 0;
    for (let x = 0; x < w; x += 1) {
      const p = fn(x, y, w, h);
      raw[o++] = p[0];
      raw[o++] = p[1];
      raw[o++] = p[2];
      raw[o++] = p[3];
    }
  }
  const ih = Buffer.alloc(13);
  ih.writeUInt32BE(w, 0);
  ih.writeUInt32BE(h, 4);
  ih[8] = 8;
  ih[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ih),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t)
  ];
}

const BG_IN = [34, 28, 66];
const BG_OUT = [9, 11, 32];

// Five waveform bars, heights as a fraction of the icon height.
const BAR_H = [0.34, 0.62, 0.44, 0.72, 0.3];
const BAR_C = [
  [255, 159, 207],
  [187, 166, 255],
  [127, 224, 255],
  [255, 210, 127],
  [255, 159, 207]
];

function inBars(cx, cy) {
  // cx in 0..1 across, cy in 0..1 from top
  const n = BAR_H.length;
  for (let i = 0; i < n; i += 1) {
    const slotW = 1 / n;
    const innerL = slotW * i + slotW * 0.22;
    const innerR = slotW * (i + 1) - slotW * 0.22;
    if (cx >= innerL && cx <= innerR) {
      const half = BAR_H[i] / 2;
      if (Math.abs(cy - 0.5) <= half) return i;
    }
  }
  return -1;
}

function icon(x, y, w, h) {
  const cx = (x + 0.5) / w;
  const cy = (y + 0.5) / h;
  const d = Math.min(1, Math.sqrt((cx - 0.5) ** 2 + (cy - 0.5) ** 2) * 1.7);
  const bar = inBars(cx, cy);
  if (bar !== -1) return [BAR_C[bar][0], BAR_C[bar][1], BAR_C[bar][2], 255];
  const bg = mix(BG_IN, BG_OUT, d);
  return [bg[0], bg[1], bg[2], 255];
}

function ogImage(x, y, w, h) {
  const cx = (x + 0.5) / w;
  const cy = (y + 0.5) / h;
  const d = Math.min(1, Math.sqrt((cx - 0.5) ** 2 + (cy - 0.5) ** 2) * 1.5);
  // centre the bars in a band so the wide image still reads
  const n = BAR_H.length;
  const bandW = 0.5;
  const local = (cx - (1 - bandW) / 2) / bandW;
  if (local >= 0 && local <= 1) {
    const i = Math.min(n - 1, Math.floor(local * n));
    const slotW = 1 / n;
    const innerL = slotW * i + slotW * 0.24;
    const innerR = slotW * (i + 1) - slotW * 0.24;
    if (local >= innerL && local <= innerR) {
      const half = BAR_H[i] / 2;
      if (Math.abs(cy - 0.5) <= half) return [BAR_C[i][0], BAR_C[i][1], BAR_C[i][2], 255];
    }
  }
  const bg = mix([40, 32, 78], BG_OUT, d);
  return [bg[0], bg[1], bg[2], 255];
}

const root = path.join(__dirname, "..");
const assets = path.join(root, "assets");
fs.mkdirSync(path.join(assets, "icons"), { recursive: true });

fs.writeFileSync(path.join(assets, "apple-touch-icon.png"), png(180, 180, icon));
fs.writeFileSync(path.join(assets, "icons", "icon-192.png"), png(192, 192, icon));
fs.writeFileSync(path.join(assets, "icons", "icon-512.png"), png(512, 512, icon));
fs.writeFileSync(path.join(assets, "og-image.png"), png(1200, 630, ogImage));

console.log("love-soundboard icons written");
