// TOAD Agent extension: live diagnostics, hovers, and completions for .agent
// files, straight from the real toac compiler (bundled in at build time by
// `pnpm build:vscode`).
import * as vscode from "vscode";
import { analyze, compile } from "../../../packages/compiler/dist/index.js";

const DEBOUNCE_MS = 200;

/** One-line docs per top-level key, shown on hover and in completions. */
const KEY_DOCS = {
  agent:
    "**agent** (required) — the agent's name: an identifier, also the emitted export and filename.",
  model: "**model** (required) — a Claude model id, e.g. `claude-opus-4-7`.",
  description:
    "**description** — one line on what the agent does; doubles as the default system prompt and the default tool description for `asTool()`.",
  inputs:
    "**inputs[N]{name,type}:** — N typed call parameters, one `name,type` row each. A trailing `?` (`detail?,string`) makes a field optional.",
  tools:
    "**tools[N]: a,b** — N tool names, implemented in the co-located `<agent>.tools.ts`.",
  prompt:
    "**prompt: |** (required) — the instruction prompt as an indented block. Supports `{inputs.x}`, `{env.X}`, `{#each}`, `{#if}`.",
  outputs:
    "**outputs[N]{name,type}:** — N typed result fields; the agent returns a validated object instead of free text.",
  system:
    "**system: |** — system prompt block; defaults to the description when absent.",
  uses: "**uses[N]: a,b** — sub-agents wired in as tools via `asTool()`.",
  maxTurns: "**maxTurns** — tool-use turn cap (default 8).",
  retries: "**retries** — retry the model call this many times on error.",
  temperature:
    "**temperature** — sampling temperature, a number from 0 to 1; omit for the API default.",
};

const TEMPLATE_DOCS = {
  "#each":
    "`{#each inputs.xs as x}` … `{/each}` — iterate an array input. Index: `as x, i`; empty fallback: `{:else}`; destructure: `as {a, b}`.",
  "#if":
    "`{#if inputs.flag}` … `{:else if …}` … `{:else}` … `{/if}` — condition on a boolean input; a leading `!` negates.",
  ":else": "`{:else}` — the empty-list / false branch of `{#each}` or `{#if}`.",
  "/each": "`{/each}` — closes an `{#each}` block.",
  "/if": "`{/if}` — closes an `{#if}` block.",
  "inputs.": "`{inputs.<name>}` — interpolate a declared input.",
  "env.":
    "`{env.<NAME>}` — interpolate an environment variable (empty string when unset).",
};

/** Declared input names for a document — from the AST when it parses, else a scan. */
function inputNames(doc) {
  const text = doc.getText();
  try {
    const { ast } = analyze(text, doc.uri.fsPath);
    if (ast) return ast.inputs.map((f) => f.name);
  } catch {
    // fall through to the regex scan
  }
  const names = [];
  const m = text.match(/^inputs\[\d+\][^\n]*\n((?:[ ]{2}[^\n]*\n?)*)/m);
  if (m) {
    for (const row of m[1].split("\n")) {
      const r = /^ {2}([A-Za-z_][A-Za-z0-9_]*)\??,/.exec(row);
      if (r) names.push(r[1]);
    }
  }
  return names;
}

export function activate(context) {
  const collection = vscode.languages.createDiagnosticCollection("toad");
  const timers = new Map();

  const refresh = (doc) => {
    if (doc.languageId !== "agent") return;
    const { diagnostics } = compile(doc.getText(), doc.uri.fsPath);
    collection.set(
      doc.uri,
      diagnostics.map((d) => {
        // Compiler locations are 1-based; missing ones pin to the first line.
        const line = Math.min(
          Math.max((d.line ?? 1) - 1, 0),
          doc.lineCount - 1,
        );
        const col = Math.max((d.col ?? 1) - 1, 0);
        const lineEnd = doc.lineAt(line).text.length;
        const range = new vscode.Range(
          line,
          Math.min(col, lineEnd),
          line,
          Math.max(lineEnd, col + 1),
        );
        const diag = new vscode.Diagnostic(
          range,
          d.message,
          d.severity === "warning"
            ? vscode.DiagnosticSeverity.Warning
            : vscode.DiagnosticSeverity.Error,
        );
        diag.source = "toac";
        diag.code = d.code;
        return diag;
      }),
    );
  };

  const refreshSoon = (doc) => {
    if (doc.languageId !== "agent") return;
    const key = doc.uri.toString();
    clearTimeout(timers.get(key));
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        refresh(doc);
      }, DEBOUNCE_MS),
    );
  };

  const hover = vscode.languages.registerHoverProvider("agent", {
    provideHover(doc, position) {
      const line = doc.lineAt(position.line).text;
      // Top-level keys: `key:` or `key[N]…:` at column 0.
      const m = /^([A-Za-z_][A-Za-z0-9_]*)(?=[:\[])/.exec(line);
      if (m && KEY_DOCS[m[1]] && position.character <= m[1].length) {
        return new vscode.Hover(new vscode.MarkdownString(KEY_DOCS[m[1]]));
      }
      return undefined;
    },
  });

  const completions = vscode.languages.registerCompletionItemProvider(
    "agent",
    {
      provideCompletionItems(doc, position) {
        const before = doc
          .lineAt(position.line)
          .text.slice(0, position.character);

        // `{inputs.` -> declared input names.
        if (/\{inputs\.[A-Za-z0-9_]*$/.test(before)) {
          return inputNames(doc).map((name) => {
            const item = new vscode.CompletionItem(
              name,
              vscode.CompletionItemKind.Variable,
            );
            item.detail = "declared input";
            return item;
          });
        }

        // `{` -> template constructs.
        if (/\{[#:/A-Za-z]*$/.test(before) && before.includes("{")) {
          return Object.entries(TEMPLATE_DOCS).map(([label, doc_]) => {
            const item = new vscode.CompletionItem(
              label,
              vscode.CompletionItemKind.Keyword,
            );
            item.documentation = new vscode.MarkdownString(doc_);
            if (label === "#each") {
              item.insertText = new vscode.SnippetString(
                "#each inputs.${1:items} as ${2:item}}\n$0\n{/each}",
              );
            } else if (label === "#if") {
              item.insertText = new vscode.SnippetString(
                "#if inputs.${1:flag}}\n$0\n{/if}",
              );
            }
            return item;
          });
        }

        // Column 0 -> top-level keys.
        if (/^[A-Za-z]*$/.test(before)) {
          return Object.entries(KEY_DOCS).map(([key, doc_]) => {
            const item = new vscode.CompletionItem(
              key,
              vscode.CompletionItemKind.Property,
            );
            item.documentation = new vscode.MarkdownString(doc_);
            if (key === "inputs" || key === "outputs") {
              item.insertText = new vscode.SnippetString(
                `${key}[\${1:1}]{name,type}:\n  \${2:name},\${3:string}`,
              );
            } else if (key === "prompt" || key === "system") {
              item.insertText = new vscode.SnippetString(`${key}: |\n  $0`);
            } else if (key === "tools" || key === "uses") {
              item.insertText = new vscode.SnippetString(
                `${key}[\${1:1}]: \${2:name}`,
              );
            } else {
              item.insertText = new vscode.SnippetString(`${key}: $0`);
            }
            return item;
          });
        }
        return undefined;
      },
    },
    "{",
    ".",
  );

  vscode.workspace.textDocuments.forEach(refresh);
  context.subscriptions.push(
    collection,
    hover,
    completions,
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument((e) => refreshSoon(e.document)),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      clearTimeout(timers.get(doc.uri.toString()));
      timers.delete(doc.uri.toString());
      collection.delete(doc.uri);
    }),
  );
}

export function deactivate() {}
