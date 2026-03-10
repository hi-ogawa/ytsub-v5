import { spawn } from "node:child_process";
// wrapper script for `node --watch`.
// this works around some issues with `vite build --watch`.
import { cpSync, mkdirSync } from "node:fs";
import { basename, resolve } from "node:path";

const child = spawn("node", ["--run", "build-ext"], {
  stdio: "inherit",
  env: { ...process.env, DEV_EXT: "1" },
});

child.on("exit", (code) => {
  if (code !== 0) process.exit(code ?? 1);
  copyToMainRepo();
});

function copyToMainRepo() {
  const cwd = process.cwd();
  const dirName = basename(cwd);

  // Resolve main repo: if in a worktree (ytsub-v5-wt*), go to sibling ytsub-v5
  const mainRepo = dirName.match(/^ytsub-v5-wt/)
    ? resolve(cwd, "..", "ytsub-v5")
    : cwd;

  const src = resolve(cwd, "dist", "extension");
  const dest = resolve(mainRepo, "dist", "extension-dev");

  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
  console.log(`Copied extension → ${dest}`);
}
