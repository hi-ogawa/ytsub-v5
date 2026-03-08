import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "./src/extension/content.ts",
      formats: ["iife"],
      name: "ytsub",
      fileName: () => "content.js",
    },
    outDir: "./dist/extension",
  },
  plugins: [
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
