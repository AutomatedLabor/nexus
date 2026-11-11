import { defineConfig } from "vitest/config";

// Vitest configuration for Project Nexus — covers the Aether language core
// (and any future stdlib/vm/tools tests). The playground test pipeline runs
// `vitest run` which picks up every `*.test.ts` under the matching globs.
export default defineConfig({
  test: {
    include: ["aether/**/*.test.ts", "tests/**/*.test.ts"],
    environment: "node",
    globals: false,
    reporters: ["default"],
  },
  resolve: {
    // Allow bare relative imports inside the aether package without TS path
    // aliases. Vitest handles TS natively so no extra plugins are required.
  },
});
