import { execSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { build, defineConfig } from "vite";

const git = (cmd: string) => execSync(cmd).toString().trim();
const rev = git("git rev-parse --short HEAD");
const branch = git("git branch --show-current");
const dirty = git("git status --porcelain") ? "-dirty" : "";
const buildTime = new Date();

const TMP_OUT = "./dist/extension-tmp";
const EXT_OUT = "./dist/extension";

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
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "extension-post-build",
      buildApp: {
        async handler(builder) {
          if (1) return;
          await builder.build(builder.environments.client);
          await builder.build(builder.environments.bookmarks);

          // 2. Re-bundle content.js ESM → IIFE (MAIN world needs self-contained script)
          await build({
            configFile: false,
            build: {
              lib: {
                entry: resolve(TMP_OUT, "assets/content.js"),
                formats: ["iife"],
                name: "zamak",
                fileName: () => "content.js",
              },
              outDir: EXT_OUT,
              minify: false,
            },
          });

          // 3. Relocate bookmarks HTML + assets from tmp
          // Fix asset paths — HTML is nested in tmp but flat in output
          const html = readFileSync(
            resolve(TMP_OUT, "src/extension/bookmarks.html"),
            "utf8",
          ).replaceAll("../../assets/", "assets/");
          writeFileSync(resolve(EXT_OUT, "bookmarks.html"), html);
          mkdirSync(resolve(EXT_OUT, "assets"), { recursive: true });
          // Copy all assets except content.js (already re-bundled to IIFE above)
          for (const file of readdirSync(resolve(TMP_OUT, "assets"))) {
            if (file === "content.js") continue;
            cpSync(
              resolve(TMP_OUT, "assets", file),
              resolve(EXT_OUT, "assets", file),
            );
          }

          // 4. Write manifest
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
            resolve(EXT_OUT, "manifest.json"),
            JSON.stringify(manifest, null, 2),
          );

          // 5. Copy plain JS files for the extension
          for (const file of ["relay.js", "background.js", "theme-init.js"]) {
            cpSync(`./src/extension/${file}`, resolve(EXT_OUT, file));
          }

          // 6. Copy to main repo's dist/extension-dev for single Chrome load point
          if (process.env.DEV_EXT) {
            const cwd = process.cwd();
            const dirName = basename(cwd);
            const match = dirName.match(/^(.+)-wt\d+$/);
            const mainRepo = match ? resolve(cwd, "..", match[1]) : cwd;
            const dest = resolve(mainRepo, "dist", "extension-dev");
            mkdirSync(dest, { recursive: true });
            cpSync(EXT_OUT, dest, { recursive: true });
            console.log(`[dev-ext] Copied extension → ${dest}`);
          }
        },
      },
    },
  ],
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

      // Copy manifest.json
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
        resolve(EXT_OUT, "manifest.json"),
        JSON.stringify(manifest, null, 2),
      );

      // Copy plain JS files for the extension
      for (const file of ["relay.js", "background.js", "theme-init.js"]) {
        cpSync(`./src/extension/${file}`, resolve(EXT_OUT, file));
      }

      // Copy to main repo's dist/extension-dev for single Chrome load point
      if (process.env.DEV_EXT) {
        const cwd = process.cwd();
        const dirName = basename(cwd);
        const match = dirName.match(/^(.+)-wt\d+$/);
        const mainRepo = match ? resolve(cwd, "..", match[1]) : cwd;
        const dest = resolve(mainRepo, "dist", "extension-dev");
        mkdirSync(dest, { recursive: true });
        cpSync(EXT_OUT, dest, { recursive: true });
        console.log(`[dev-ext] Copied extension → ${dest}`);
      }
    },
  },
});
