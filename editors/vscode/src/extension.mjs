// TOAD Agent extension: live diagnostics, hovers, completions, and formatting
// for .agent files, straight from the real toac compiler (bundled in at build
// time by `pnpm build:vscode`). Hover, completion, and their docs tables come
// from the compiler's editor-services module — the same source of truth the
// standalone `toac lsp` server uses — so VS Code and every other editor agree.
import * as vscode from "vscode";
import {
  compile,
  completionsAt,
  formatAgent,
  hoverAt,
} from "../../../packages/compiler/dist/index.js";

const DEBOUNCE_MS = 200;

/** Map an editor-services completion kind to a VS Code kind. */
const COMPLETION_KIND = {
  property: vscode.CompletionItemKind.Property,
  keyword: vscode.CompletionItemKind.Keyword,
  variable: vscode.CompletionItemKind.Variable,
};

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
      const result = hoverAt(doc.getText(), position.line, position.character);
      return result
        ? new vscode.Hover(new vscode.MarkdownString(result.contents))
        : undefined;
    },
  });

  const completions = vscode.languages.registerCompletionItemProvider(
    "agent",
    {
      provideCompletionItems(doc, position) {
        const items = completionsAt(
          doc.getText(),
          position.line,
          position.character,
          doc.uri.fsPath,
        );
        return items.map((it) => {
          const item = new vscode.CompletionItem(
            it.label,
            COMPLETION_KIND[it.kind] ?? vscode.CompletionItemKind.Text,
          );
          if (it.detail) item.detail = it.detail;
          if (it.documentation)
            item.documentation = new vscode.MarkdownString(it.documentation);
          if (it.insertText !== undefined) {
            item.insertText = it.snippet
              ? new vscode.SnippetString(it.insertText)
              : it.insertText;
          }
          return item;
        });
      },
    },
    "{",
    ".",
  );

  // Canonical formatting, straight from `toac fmt`. Drives Format Document and
  // editor.formatOnSave. A whole-document replace is fine: the formatter is
  // idempotent and refuses to change meaning, so the edit is safe and stable.
  const formatter = vscode.languages.registerDocumentFormattingEditProvider(
    "agent",
    {
      provideDocumentFormattingEdits(doc) {
        const { code, changed } = formatAgent(doc.getText(), doc.uri.fsPath);
        if (code === undefined || !changed) return [];
        const fullRange = new vscode.Range(
          doc.positionAt(0),
          doc.positionAt(doc.getText().length),
        );
        return [vscode.TextEdit.replace(fullRange, code)];
      },
    },
  );

  vscode.workspace.textDocuments.forEach(refresh);
  context.subscriptions.push(
    collection,
    hover,
    completions,
    formatter,
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
