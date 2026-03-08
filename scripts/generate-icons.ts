// Generate extension PNGs from public/favicon.svg using sharp.
// Usage: node scripts/generate-icons.ts

import { readFileSync, mkdirSync } from "fs";
import { join } from "path";
import sharp from "sharp";

const SVG_PATH = join(import.meta.dirname!, "..", "public", "favicon.svg");
const OUT_DIR = join(import.meta.dirname!, "..", "public", "icons");
mkdirSync(OUT_DIR, { recursive: true });

const svg = readFileSync(SVG_PATH);

for (const size of [16, 48, 128]) {
  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile(join(OUT_DIR, `icon-${size}.png`));
  console.log(`Generated icon-${size}.png`);
}
