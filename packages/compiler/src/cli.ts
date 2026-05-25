#!/usr/bin/env node
/**
 * `toac` CLI — scaffold for story E0. The real `build` and `check` commands
 * land in epic E5 — see `_bmad-output/epics.md`.
 */
import { COMPILER_VERSION } from "./index.js";

function main(argv: readonly string[]): number {
  const [cmd] = argv;
  if (cmd === "--version" || cmd === "-v") {
    process.stdout.write(`toac ${COMPILER_VERSION}\n`);
    return 0;
  }
  process.stderr.write(
    "toac: not implemented yet (epic E5). Commands `build` and `check` are coming.\n",
  );
  return 1;
}

process.exit(main(process.argv.slice(2)));
