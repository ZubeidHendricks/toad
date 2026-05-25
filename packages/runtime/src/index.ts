/**
 * `@toa/runtime` — runtime for agents compiled by `toac`.
 *
 * Scaffold for story E0. The real API (`defineTool`, `createAgent`, the agent
 * tool loop, structured output) lands in epic E3 — see `_bmad-output/epics.md`.
 */

export const RUNTIME_VERSION = "0.0.0";

/** Placeholder for runtime features not yet built (epic E3). */
export function notImplemented(feature: string): never {
  throw new Error(`@toa/runtime: ${feature} is not implemented yet (epic E3)`);
}
