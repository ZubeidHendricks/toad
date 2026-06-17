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
