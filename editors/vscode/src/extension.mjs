// TOAD Agent extension: live diagnostics for .agent files, straight from the
// real toac compiler (bundled in at build time by `pnpm build:vscode`).
import * as vscode from "vscode";
import { compile } from "../../../packages/compiler/dist/index.js";

const DEBOUNCE_MS = 200;

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

  vscode.workspace.textDocuments.forEach(refresh);
  context.subscriptions.push(
    collection,
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
