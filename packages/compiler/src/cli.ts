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

const USAGE = "usage: toac <build|check> <paths...> [--outDir <dir>]";

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
