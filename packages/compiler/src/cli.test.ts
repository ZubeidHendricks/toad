import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run } from "./cli.js";

const silent = { log: () => {}, error: () => {} };
const AGENT = "agent: ping\nmodel: m\nprompt: hi\n";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "toac-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("toac CLI", () => {
  it("build writes a .ts next to the .agent and exits 0", async () => {
    const file = join(dir, "ping.agent");
    await writeFile(file, AGENT);
    expect(await run(["build", file], silent)).toBe(0);
    const out = await readFile(join(dir, "ping.ts"), "utf8");
    expect(out).toContain("export default ping;");
  });

  it("respects --outDir", async () => {
    const file = join(dir, "ping.agent");
    await writeFile(file, AGENT);
    const outDir = join(dir, "out");
    expect(await run(["build", file, "--outDir", outDir], silent)).toBe(0);
    const out = await readFile(join(outDir, "ping.ts"), "utf8");
    expect(out).toContain("createAgent({");
  });

  it("check validates without writing and exits 0", async () => {
    const file = join(dir, "ping.agent");
    await writeFile(file, AGENT);
    expect(await run(["check", file], silent)).toBe(0);
    await expect(readFile(join(dir, "ping.ts"), "utf8")).rejects.toBeTruthy();
  });

  it("exits 1 and reports diagnostics for an invalid agent", async () => {
    const file = join(dir, "bad.agent");
    await writeFile(file, "model: m\n");
    const errors: string[] = [];
    const code = await run(["build", file], {
      log: () => {},
      error: (line) => errors.push(line),
    });
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("TOA203");
  });

  it("scans directories recursively for .agent files", async () => {
    await writeFile(join(dir, "ping.agent"), AGENT);
    expect(await run(["build", dir], silent)).toBe(0);
    expect(await readFile(join(dir, "ping.ts"), "utf8")).toContain(
      "createAgent",
    );
  });
});
