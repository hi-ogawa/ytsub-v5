import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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
      name: "copy-manifest",
      async buildEnd() {
        this.emitFile({
          type: "asset",
          fileName: "manifest.json",
          source: await this.fs.readFile("./src/extension/manifest.json"),
        });
      },
    },
  ],
});
