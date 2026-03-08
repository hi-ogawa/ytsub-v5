// Generate extension icons using sharp.
// Usage: npx tsx scripts/generate-icons.ts

import { mkdirSync } from "fs";
import { join } from "path";
import sharp from "sharp";

const OUT_DIR = join(import.meta.dirname!, "..", "src", "extension", "icons");
mkdirSync(OUT_DIR, { recursive: true });

const sizes = [16, 48, 128];

function makeSvg(size: number): string {
  const pad = Math.round(size * 0.08);
  const r = Math.round(size * 0.18);
  const fontSize = Math.round(size * 0.42);
  const subFontSize = Math.round(size * 0.18);

  // Two-line subtitle icon: "YT" on top, "SUB" on bottom, on a rounded blue rect
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect x="${pad}" y="${pad}" width="${size - pad * 2}" height="${size - pad * 2}" rx="${r}" ry="${r}" fill="#2563eb"/>
  <text x="${size / 2}" y="${size * 0.46}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="bold" font-size="${fontSize}" fill="white">YT</text>
  <text x="${size / 2}" y="${size * 0.74}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="bold" font-size="${subFontSize}" fill="#93c5fd">SUB</text>
</svg>`;
}

for (const size of sizes) {
  const svg = makeSvg(size);
  await sharp(Buffer.from(svg))
    .png()
    .toFile(join(OUT_DIR, `icon-${size}.png`));
  console.log(`Generated icon-${size}.png`);
}
