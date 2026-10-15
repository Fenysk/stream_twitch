import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "streamdeck/src/**/*.test.ts",
      "streamdeck/src/**/*.test.tsx",
    ],
    environment: "node",
  },
});
