import { describe, expect, it } from "vitest";
import { researcher } from "./researcher";

// A real end-to-end run against Claude. Skipped unless ANTHROPIC_API_KEY is set,
// so the default suite (and CI) stays offline and free.
const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);

describe("researcher (live)", () => {
  it.skipIf(!hasKey)(
    "compiles + runs end-to-end and returns typed output",
    async () => {
      const out = await researcher.run({ topic: "the TOON data format" });
      expect(typeof out.summary).toBe("string");
      expect(Array.isArray(out.sources)).toBe(true);
    },
    60_000,
  );
});
