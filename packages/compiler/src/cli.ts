import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { compile, COMPILER_VERSION, formatDiagnostic } from "./index.js";

export interface Logger {
  log: (line: string) => void;
  error: (line: string) => void;
}

const consoleLogger: Logger = {
  log: (line) => process.stdout.write(`${line}\n`),
  error: (line) => process.stderr.write(`${line}\n`),
};

const USAGE =
  "usage: toac <build|check> <paths...> [--outDir <dir>] | toac init <name>";

// Starter files for `toac init <name>`: a minimal tool-using agent plus the
// co-located tools module the generated import expects.
const initAgent = (name: string) => `agent: ${name}
model: claude-opus-4-7
description: Describe what ${name} does in one line.
inputs[1]{name,type}:
  topic,string
tools[1]: search
prompt: |
  You are ${name}. Work on: {inputs.topic}
  Use the search tool when you need information.
outputs[1]{name,type}:
  summary,string
`;

const initTools = (name: string) => `// Tool implementations for ${name}.agent.
// \`toac build ${name}.agent\` generates ${name}.ts, which imports from here.
import { defineTool } from "toad-runtime";
import { z } from "zod";

export const search = defineTool({
  description: "Search for information about a query",
  input: z.object({ query: z.string() }),
  run: async ({ query }) => {
    // TODO: implement (call an API, query a database, ...)
    return \`results for \${query}\`;
  },
});
`;

/**
 * Run the `toac` CLI. Returns the process exit code (0 = success). Globbing is
 * the shell's job: paths may be `.agent` files or directories (scanned
 * recursively). See `_bmad-output/architecture.md` §3 / epics E5.
 */
export async function run(
  argv: string[],
  logger: Logger = consoleLogger,
): Promise<number> {
  const [command, ...rest] = argv;

  if (command === "--version" || command === "-v") {
    logger.log(`toac ${COMPILER_VERSION}`);
    return 0;
  }
  if (command === "init") {
    return init(rest, logger);
  }
  if (command !== "build" && command !== "check") {
    logger.error(USAGE);
    return 1;
  }

  let outDir: string | undefined;
  const paths: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (arg === "--outDir") {
      outDir = rest[++i];
    } else {
      paths.push(arg);
    }
  }

  const files = await collectAgentFiles(paths);
  if (files.length === 0) {
    logger.error("toac: no .agent files found");
    return 1;
  }

  let hadError = false;
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const { code, diagnostics } = compile(source, file);

    for (const d of diagnostics) {
      (d.severity === "error" ? logger.error : logger.log)(formatDiagnostic(d));
    }
    if (code === undefined) {
      hadError = true;
      continue;
    }
    if (command === "build") {
      const outPath = outputPathFor(file, outDir);
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, code, "utf8");
      logger.log(`compiled ${file} -> ${outPath}`);
    }
  }
  return hadError ? 1 : 0;
}

/**
 * `toac init <name>`: scaffold `<name>.agent` + `<name>.tools.ts` in the
 * current directory (or under a given path, e.g. `toac init agents/researcher`).
 * Refuses to overwrite existing files.
 */
async function init(args: string[], logger: Logger): Promise<number> {
  const target = args[0];
  if (target === undefined || target.startsWith("-")) {
    logger.error("usage: toac init <name>");
    return 1;
  }
  const name = basename(target).replace(/\.agent$/, "");
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    logger.error(
      `toac: "${name}" is not a valid agent name (letters/digits/_, starts with a letter or _)`,
    );
    return 1;
  }
  const dir = dirname(target);
  const agentPath = join(dir, `${name}.agent`);
  const toolsPath = join(dir, `${name}.tools.ts`);
  for (const p of [agentPath, toolsPath]) {
    if (await stat(p).catch(() => undefined)) {
      logger.error(`toac: ${p} already exists`);
      return 1;
    }
  }
  await mkdir(dir, { recursive: true });
  await writeFile(agentPath, initAgent(name), "utf8");
  await writeFile(toolsPath, initTools(name), "utf8");
  logger.log(`created ${agentPath}`);
  logger.log(`created ${toolsPath}`);
  logger.log(`next: toac build ${agentPath}`);
  return 0;
}

async function collectAgentFiles(paths: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const p of paths) {
    const info = await stat(p).catch(() => undefined);
    if (info === undefined) {
      continue;
    }
    if (info.isDirectory()) {
      out.push(...(await walk(p)));
    } else if (extname(p) === ".agent") {
      out.push(p);
    }
  }
  return [...new Set(out)].sort();
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(full)));
    } else if (extname(entry.name) === ".agent") {
      out.push(full);
    }
  }
  return out;
}

function outputPathFor(file: string, outDir: string | undefined): string {
  const ts = file.replace(/\.agent$/, ".ts");
  return outDir === undefined ? ts : join(outDir, basename(ts));
}
