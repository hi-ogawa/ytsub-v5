import { execSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
  environments: {
    client: {
      build: {
        outDir: "./dist/extension",
        minify: false,
        copyPublicDir: false,
        rolldownOptions: {
          input: {
            content: "./src/extension/content.tsx",
          },
          output: {
            format: "iife",
            entryFileNames: "content.js",
          },
        },
      },
    },
    bookmarks: {
      consumer: "client",
      build: {
        outDir: "./dist/extension",
        minify: false,
        emptyOutDir: false,
        copyPublicDir: false,
        rolldownOptions: {
          input: {
            bookmarks: "./src/extension/bookmarks.html",
          },
        },
      },
    },
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    __BUILD_TIME__: JSON.stringify(buildTime.toISOString()),
    __GIT_REV__: JSON.stringify(rev + dirty),
    __SERVER_URL__: JSON.stringify(
      process.env.DEV_EXT
        ? "http://localhost:5173"
        : "https://ytsub-v5.hiroshi.workers.dev",
    ),
  },
  plugins: [react(), tailwindcss()],
  builder: {
    async buildApp(builder) {
      await builder.build(builder.environments.client);
      await builder.build(builder.environments.bookmarks);
      const outDir = builder.environments.client.config.build.outDir;

      // Move html
      cpSync(
        resolve(outDir, "src/extension/bookmarks.html"),
        resolve(outDir, "bookmarks.html"),
      );
      rmSync(resolve(outDir, "src"), { force: true, recursive: true });

      // Copy raw assets
      cpSync("./src/extension/public", outDir, { recursive: true });

      // Modify manifest.json
      const manifestPath = resolve(outDir, "manifest.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (process.env.DEV_EXT) {
        const time = buildTime.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        });
        manifest.name = `Zamak-dev [${branch} ${rev} ${time}]`;
      }
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

      // Copy to main repo's dist/extension-dev for single Chrome load point
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
});
