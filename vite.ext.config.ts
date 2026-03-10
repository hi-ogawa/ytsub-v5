import { execSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { build, defineConfig } from "vite";

const git = (cmd: string) => execSync(cmd).toString().trim();
const rev = git("git rev-parse --short HEAD");
const branch = git("git branch --show-current");
const dirty = git("git status --porcelain") ? "-dirty" : "";
const buildTime = new Date();

const EXT_OUT = "./dist/extension";

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
    outDir: EXT_OUT,
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
      buildApp: {
        async handler(builder) {
          // 1. Build content script (main entry)
          await builder.build(builder.environments.client);

          // 2. Build bookmarks popup page (second IIFE entry)
          await build({
            configFile: false,
            build: {
              lib: {
                entry: "./src/extension/bookmarks-entry.tsx",
                formats: ["iife"],
                name: "zamakBookmarks",
                fileName: () => "bookmarks-page.js",
                cssFileName: "bookmarks-page",
              },
              outDir: EXT_OUT,
              emptyOutDir: false,
              minify: false,
            },
            plugins: [react(), tailwindcss()],
            define: {
              "process.env.NODE_ENV": JSON.stringify("production"),
            },
          });

          // 3. Write manifest
          const outDir = builder.environments.client.config.build.outDir;
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

          // 4. Copy plain JS + HTML files for the extension
          for (const file of ["relay.js", "background.js", "bookmarks.html"]) {
            cpSync(`./src/extension/${file}`, resolve(outDir, file));
          }

          // 5. Copy to main repo's dist/extension-dev for single Chrome load point
          if (process.env.DEV_EXT) {
            const cwd = process.cwd();
            const dirName = basename(cwd);
            const match = dirName.match(/^(.+)-wt\d+$/);
            const mainRepo = match ? resolve(cwd, "..", match[1]) : cwd;
            const dest = resolve(mainRepo, "dist", "extension-dev");
            mkdirSync(dest, { recursive: true });
            cpSync(outDir, dest, { recursive: true });
            console.log(`[dev-ext] Copied extension → ${dest}`);
          }
        },
      },
    },
  ],
});
