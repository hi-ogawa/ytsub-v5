import { execSync } from "node:child_process";
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const git = (cmd: string) => execSync(cmd).toString().trim();
const rev = git("git rev-parse --short HEAD");
const branch = git("git branch --show-current");
const dirty = git("git status --porcelain") ? "-dirty" : "";
const buildTime = new Date();

// Fixed key for dev and CI artifact builds, so each new unpacked build
// replaces the previous one instead of getting a new ID from its folder path.
// It is separate from the Chrome Web Store key, so these builds don't collide
// with an installed store copy.
// Generated with `pnpm generate-extension-key`.
// Extension ID: ehpiiciihgfigiocljcmapfenghjhhel
// Changing this key changes the ID and drops the existing extension storage.
const DEV_EXTENSION_PUBLIC_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuIqAa4j0aNbmWe7RTwTqZShUGaxxvL5P1lJ29oOfeEutuhJYHfDyOYncJWJV/TeEQSuJPv2125JoUDFqoT5n+/AAgKOUQ6FHjDO8QO/m79rPShhq47b6UPwnP4wky3lT4pZ3siJpIoWfq61qWXB6LI/jPlhjRn8l3RVNHimIQuM2tDTXw3KwyFE4+/wQUIud6I3Eb3yQ4ZdDS+AlRTDkqczztRk+JYDiwFz0wmwQFmRZcCutfmp7RDHGnlZb/0TkWA0kFkHPMKTbecalUAUA180KSLWi320U5fvKtDhkVJunUGKvYK6Xfhg63b06Y0hvPf08f+YFcypNNZTMadQ2LQIDAQAB";

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
            entryFileNames: "[name].js",
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
    background: {
      consumer: "client",
      build: {
        outDir: "./dist/extension",
        minify: false,
        emptyOutDir: false,
        copyPublicDir: false,
        rolldownOptions: {
          input: {
            background: "./src/extension/background.ts",
          },
          output: {
            format: "iife",
            entryFileNames: "[name].js",
          },
        },
      },
    },
    relay: {
      consumer: "client",
      build: {
        outDir: "./dist/extension",
        minify: false,
        emptyOutDir: false,
        copyPublicDir: false,
        rolldownOptions: {
          input: {
            relay: "./src/extension/relay.ts",
          },
          output: {
            format: "iife",
            entryFileNames: "[name].js",
          },
        },
      },
    },
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    __BUILD_TIME__: JSON.stringify(buildTime.toISOString()),
    __GIT_REV__: JSON.stringify(rev + dirty),
    __DEV_EXT__: JSON.stringify(!!process.env.DEV_EXT),
    __SERVER_URL__: JSON.stringify(
      process.env.DEV_EXT
        ? "http://localhost:5173"
        : "https://zamak.hiro18181.workers.dev",
    ),
  },
  plugins: [react(), tailwindcss()],
  builder: {
    async buildApp(builder) {
      await builder.build(builder.environments.client);
      await builder.build(builder.environments.bookmarks);
      await builder.build(builder.environments.background);
      await builder.build(builder.environments.relay);
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
        manifest.key = DEV_EXTENSION_PUBLIC_KEY;
      } else if (process.env.PATCH_MANIFEST === "true") {
        const prMatch = process.env.GITHUB_REF?.match(/refs\/pull\/(\d+)\//);
        if (prMatch) {
          manifest.name = `Zamak [PR#${prMatch[1]} ${rev}]`;
        } else {
          manifest.name = `Zamak [${rev}]`;
        }
        manifest.key = DEV_EXTENSION_PUBLIC_KEY;
      }
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    },
  },
});
