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

describe("toac init", () => {
  it("scaffolds <name>.agent and <name>.tools.ts that compile", async () => {
    const target = join(dir, "scout");
    expect(await run(["init", target], silent)).toBe(0);
    const agent = await readFile(join(dir, "scout.agent"), "utf8");
    expect(agent).toContain("agent: scout");
    const tools = await readFile(join(dir, "scout.tools.ts"), "utf8");
    expect(tools).toContain("defineTool");
    // The starter must be a valid agent document.
    expect(await run(["check", join(dir, "scout.agent")], silent)).toBe(0);
  });

  it("creates intermediate directories", async () => {
    const target = join(dir, "agents", "scout");
    expect(await run(["init", target], silent)).toBe(0);
    await expect(
      readFile(join(dir, "agents", "scout.agent"), "utf8"),
    ).resolves.toContain("agent: scout");
  });

  it("refuses to overwrite existing files", async () => {
    const target = join(dir, "scout");
    expect(await run(["init", target], silent)).toBe(0);
    const errors: string[] = [];
    const code = await run(["init", target], {
      log: () => {},
      error: (line) => errors.push(line),
    });
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("already exists");
  });

  it("rejects an invalid agent name", async () => {
    expect(await run(["init", join(dir, "2bad")], silent)).toBe(1);
  });

  it("requires a name", async () => {
    expect(await run(["init"], silent)).toBe(1);
  });
});

describe("toac fmt", () => {
  const UGLY = "model:   m\nagent: a\nprompt: hi\n";
  const CANON = "agent: a\nmodel: m\nprompt: hi\n";

  it("rewrites a file in canonical form and exits 0", async () => {
    const file = join(dir, "a.agent");
    await writeFile(file, UGLY);
    expect(await run(["fmt", file], silent)).toBe(0);
    expect(await readFile(file, "utf8")).toBe(CANON);
  });

  it("leaves an already-formatted file byte-for-byte", async () => {
    const file = join(dir, "a.agent");
    await writeFile(file, CANON);
    expect(await run(["fmt", file], silent)).toBe(0);
    expect(await readFile(file, "utf8")).toBe(CANON);
  });

  it("--check exits 1 and writes nothing when a file needs formatting", async () => {
    const file = join(dir, "a.agent");
    await writeFile(file, UGLY);
    const errors: string[] = [];
    const code = await run(["fmt", "--check", file], {
      log: () => {},
      error: (line) => errors.push(line),
    });
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("would reformat");
    // Unchanged on disk.
    expect(await readFile(file, "utf8")).toBe(UGLY);
  });

  it("--check exits 0 for an already-formatted file", async () => {
    const file = join(dir, "a.agent");
    await writeFile(file, CANON);
    expect(await run(["fmt", "--check", file], silent)).toBe(0);
  });

  it("reports diagnostics and exits 1 for an invalid file", async () => {
    const file = join(dir, "bad.agent");
    await writeFile(file, "model: m\n");
    const errors: string[] = [];
    const code = await run(["fmt", file], {
      log: () => {},
      error: (line) => errors.push(line),
    });
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("TOA203");
  });
});
