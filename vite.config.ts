import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    printWidth: 80,
    experimentalSortPackageJson: true,
    experimentalSortImports: {
      newlinesBetween: false,
      partitionByNewline: true,
      groups: [["builtin"], ["external"]],
    },
    ignorePatterns: ["worker-configuration.d.ts", "scripts/**/*.json"],
  },
  staged: {
    "*": "vp fmt",
  },
});
