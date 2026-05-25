/** Errors surfaced by the agent runtime. See `_bmad-output/architecture.md` §6. */

/** A declared tool threw while running. The original error is the `cause`. */
export class ToolError extends Error {
  constructor(
    readonly tool: string,
    cause: unknown,
  ) {
    super(
      `tool "${tool}" failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
    this.name = "ToolError";
  }
}

/** The agent loop ran more than `maxTurns` iterations without finishing. */
export class MaxTurnsError extends Error {
  constructor(readonly turns: number) {
    super(`agent exceeded its max of ${turns} turns`);
    this.name = "MaxTurnsError";
  }
}

/** The model finished without valid structured output. */
export class OutputParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutputParseError";
  }
}
