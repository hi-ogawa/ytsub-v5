import { readFileSync } from "fs";
import { join } from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const ICON_SIZES = [16, 48, 128];

export default defineConfig({
  build: {
    minify: false,
    lib: {
      entry: "./src/extension/content.tsx",
      formats: ["iife"],
      name: "ytsub",
      fileName: () => "content.js",
      cssFileName: "content",
    },
    outDir: "./dist/extension",
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "copy-manifest-and-icons",
      async buildEnd() {
        const raw = await this.fs.readFile("./src/extension/manifest.json", {
          encoding: "utf8",
        });
        const manifest = JSON.parse(raw);
        if (!process.env.CI) {
          manifest.name = "ytsub-dev";
        }
        this.emitFile({
          type: "asset",
          fileName: "manifest.json",
          source: JSON.stringify(manifest, null, 2),
        });
        for (const size of ICON_SIZES) {
          const name = `icon-${size}.png`;
          const buf = readFileSync(join("src", "extension", "icons", name));
          this.emitFile({
            type: "asset",
            fileName: `icons/${name}`,
            source: buf,
          });
        }
      },
    },
  ],
});
