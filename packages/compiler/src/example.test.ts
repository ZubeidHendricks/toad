import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compile } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const exampleDir = join(here, "..", "..", "..", "examples", "researcher");

describe("examples/researcher", () => {
  it("the committed researcher.ts matches toac output for researcher.agent", async () => {
    const [source, committed] = await Promise.all([
      readFile(join(exampleDir, "researcher.agent"), "utf8"),
      readFile(join(exampleDir, "researcher.ts"), "utf8"),
    ]);
    const { code, diagnostics } = compile(source, "researcher.agent");
    expect(diagnostics).toEqual([]);
    expect(code).toBe(committed);
  });
});
