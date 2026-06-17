/**
 * Delegation chains for multi-agent composition. The chain travels with a
 * request so authorization can be decided against *who is asking, on whose
 * behalf, through which agents* — rather than against a call path that an agent
 * loop decides at runtime and can't be known ahead of time. This is the
 * framework-level defense against the confused-deputy problem; see
 * `docs/proposals/delegation-and-tool-authz.md`.
 *
 * Pure types plus one helper, no dependencies.
 */

/** One hop of authority: a workload identity, optionally what it may reach. */
export interface Principal {
  /** Stable id of the actor — an agent name, a workload id, a SPIFFE ID. */
  id: string;
  /** Optional: scopes/roles this principal is permitted. */
  scopes?: string[];
  /** Optional free-form claims (tenant, namespace, service account, …). */
  claims?: Record<string, unknown>;
}

/** The ordered delegation chain that travels with a request. */
export interface DelegationContext {
  /** The end user / originator the whole chain acts on behalf of. */
  subject?: Principal;
  /** Actors, oldest caller first; the last entry is the current agent. */
  chain: Principal[];
}

/** A tool call presented to {@link AgentHooks.authorizeToolCall} for a decision. */
export interface ToolCallRequest {
  /** The tool the model asked to call. */
  tool: string;
  /** The validated tool input. */
  input: unknown;
  /** The delegation chain in effect for this call, if any. */
  delegation?: DelegationContext;
  /** The agent whose loop owns this tool call. */
  agent: string;
}

/**
 * Append one actor to a delegation chain, returning a new context (never
 * mutates). The chain only ever grows — prior actors can't be dropped or
 * reordered — so chain-wide policies can't be bypassed by composition depth.
 */
export function extendChain(
  ctx: DelegationContext,
  principal: Principal,
): DelegationContext {
  const next: DelegationContext = { chain: [...ctx.chain, principal] };
  if (ctx.subject !== undefined) next.subject = ctx.subject;
  return next;
}

/** The header name for carrying a delegation chain across a transport boundary. */
export const DELEGATION_HEADER = "Toad-Delegation";

/**
 * Serialize a chain to the `Toad-Delegation` wire form, for crossing a process
 * boundary (an HTTP gateway, an MCP `_meta` field): `subject=<id>;
 * chain=<id>,<id>,…`. Ids are percent-encoded, so any character is safe. This
 * carries identities only; scopes/claims need the structured object form (e.g.
 * a JSON `_meta` value) for full fidelity.
 */
export function encodeDelegationHeader(ctx: DelegationContext): string {
  const enc = (id: string): string => encodeURIComponent(id);
  const parts: string[] = [];
  if (ctx.subject !== undefined) parts.push(`subject=${enc(ctx.subject.id)}`);
  parts.push(`chain=${ctx.chain.map((p) => enc(p.id)).join(",")}`);
  return parts.join("; ");
}

/**
 * Parse a `Toad-Delegation` header back into a chain. Returns `undefined` when
 * nothing parseable is present (so an empty/garbage header is simply ignored).
 * Tolerant of extra whitespace and unknown segments.
 */
export function parseDelegationHeader(
  value: string,
): DelegationContext | undefined {
  const dec = (id: string): string => {
    try {
      return decodeURIComponent(id);
    } catch {
      return id;
    }
  };
  let subject: Principal | undefined;
  let chain: Principal[] = [];
  for (const segment of value.split(";")) {
    const eq = segment.indexOf("=");
    if (eq === -1) continue;
    const key = segment.slice(0, eq).trim();
    const val = segment.slice(eq + 1).trim();
    if (key === "subject") {
      if (val !== "") subject = { id: dec(val) };
    } else if (key === "chain") {
      chain = val
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id !== "")
        .map((id) => ({ id: dec(id) }));
    }
  }
  if (subject === undefined && chain.length === 0) return undefined;
  const ctx: DelegationContext = { chain };
  if (subject !== undefined) ctx.subject = subject;
  return ctx;
}
