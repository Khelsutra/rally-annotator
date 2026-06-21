import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/messages.ts"], // type-only
      thresholds: {
        // Enforced floors — the build fails below these (currently ~98% stmts/lines/funcs,
        // ~86% branches; floors sit just under, as a stable guard). Pure logic
        // (csv/annotator/store) is ~100%; the few uncovered branches are defensive
        // fallbacks, and the real browser behavior is proven by the Playwright E2E.
        statements: 95,
        branches: 82,
        functions: 95,
        lines: 95,
      },
    },
  },
});
