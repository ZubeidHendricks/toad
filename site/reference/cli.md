# CLI Reference (`toac`)

The `toac` CLI ships with the [`toad-compiler`](https://www.npmjs.com/package/toad-compiler) package.

```bash
npm i -g toad-compiler
```

## Usage

```bash
toac <build|check> <paths...> [--outDir <dir>]
```

Paths may be `.agent` files or directories — directories are scanned recursively for `.agent` files. Globbing is the shell's job.

## Commands

### `toac build`

Compile `.agent` files to typed TypeScript. Each `your.agent` becomes a sibling `your.ts` (or lands in `--outDir` when given).

```bash
toac build researcher.agent
# compiled researcher.agent -> researcher.ts

toac build agents/ --outDir src/generated
```

### `toac check`

Validate without emitting — same diagnostics, no files written. Useful in CI:

```bash
toac check agents/
```

## Flags

| Flag             | Meaning                                            |
| ---------------- | -------------------------------------------------- |
| `--outDir <dir>` | Write compiled `.ts` files into `<dir>` instead of next to the source |
| `--version`, `-v` | Print the compiler version                         |

## Diagnostics & exit codes

Errors are located, structured diagnostics:

```
researcher.agent:5:3 error TOAD012: prompt references undeclared input "topics" (did you mean "topic"?)
```

`toac` exits `0` when everything compiled, `1` if any file had errors (or no `.agent` files were found). Files with errors don't emit output; the rest still do.

## Programmatic API

The same pipeline is exported from `toad-compiler` — it's what powers the in-browser [playground](/playground):

```ts
import { compile, formatDiagnostic } from "toad-compiler";

const { code, diagnostics } = compile(source, "researcher.agent");
if (code === undefined) {
  for (const d of diagnostics) console.error(formatDiagnostic(d));
}
```
