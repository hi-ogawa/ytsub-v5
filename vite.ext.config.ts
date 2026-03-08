import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    minify: false,
    lib: {
      entry: "./src/extension/content.tsx",
      formats: ["iife"],
      name: "zamak",
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
      },
    },
  ],
});
