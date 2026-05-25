import { defineConfig } from "vitest/config";

// Scope test discovery to source; never run compiled tests emitted into dist/.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
