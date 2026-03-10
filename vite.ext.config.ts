import { execSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const git = (cmd: string) => execSync(cmd).toString().trim();
const rev = git("git rev-parse --short HEAD");
const branch = git("git branch --show-current");
const dirty = git("git status --porcelain") ? "-dirty" : "";
const buildTime = new Date();

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
    __BUILD_TIME__: JSON.stringify(buildTime.toISOString()),
    __GIT_REV__: JSON.stringify(rev + dirty),
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "extension-manifest-and-copy",
      writeBundle(_, bundle) {
        const outDir = resolve("dist", "extension");

        // Write manifest (not emitted via emitFile since we're in writeBundle)
        const manifest = JSON.parse(
          readFileSync("./src/extension/manifest.json", "utf8"),
        );
        if (process.env.DEV_EXT) {
          const time = buildTime.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          });
          manifest.name = `Zamak-dev [${branch} ${rev} ${time}]`;
        }
        writeFileSync(
          resolve(outDir, "manifest.json"),
          JSON.stringify(manifest, null, 2),
        );

        // Copy to main repo's dist/extension-dev for single Chrome load point
        if (process.env.DEV_EXT) {
          const cwd = process.cwd();
          const dirName = basename(cwd);
          const mainRepo = dirName.match(/^ytsub-v5-wt/)
            ? resolve(cwd, "..", "ytsub-v5")
            : cwd;
          const dest = resolve(mainRepo, "dist", "extension-dev");
          mkdirSync(dest, { recursive: true });
          cpSync(outDir, dest, { recursive: true });
          console.log(`Copied extension → ${dest}`);
        }
      },
    },
  ],
});
