import { defineConfig } from "vite-plus";

export default defineConfig({
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
    options: {
      typeAware: true,
    },
    categories: {
      correctness: "off",
    },
    rules: {
      curly: "error",
    },
    overrides: [
      {
        // Playwright drops the spec line from a boxed step's failure when a
        // helper returns `test.step(...)` without awaiting it.
        files: ["e2e/**"],
        rules: {
          "typescript/return-await": ["error", "always"],
        },
      },
    ],
  },
  staged: {
    "*": "vp check --fix",
  },
});
