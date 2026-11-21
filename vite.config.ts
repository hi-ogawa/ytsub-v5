import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    dir: "./src",
  },
  fmt: {
    printWidth: 80,
    sortImports: {
      newlinesBetween: false,
      partitionByNewline: true,
      groups: [["builtin"], ["external"]],
    },
    ignorePatterns: ["worker-configuration.d.ts", "scripts/**/*.json"],
  },
  lint: {
    categories: {
      correctness: "off",
    },
    rules: {
      curly: "error",
    },
  },
  staged: {
    "*": "vp check --fix",
  },
});
