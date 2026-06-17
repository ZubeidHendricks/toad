# Proposal: delegation chains & deny-capable tool authorization

**Status: Stages 1–2 implemented (`toad-runtime`, unreleased) · Stages 3–4
proposed · June 2026**

> Implemented so far: `DelegationContext`/`Principal` propagation through
> `RunOptions` → `asTool` → `ToolRunContext`, and the deny-capable
> `authorizeToolCall` hook with `AuthorizationError`. Still proposed: the
> `serveMcp` boundary header (stage 3) and optional JWS signing / declarative
> `.agent` `allow:` block (stage 4). The design below is the full picture; §9
> tracks what has landed.

A design for defending TOAD's multi-agent composition against the **confused
deputy**: an agent with legitimate authority tricked into using it for a request
that should not have it. The fix is to **secure the identity, not the path** —
make _who is asking, on whose behalf, through which agents_ travel with every
tool call, and let a policy decide against that full chain.

This is a framework-level feature. It is deliberately **complementary to
platforms like [Kagenti](https://github.com/kagenti/kagenti)** (SPIFFE/Istio/
Keycloak/MCP-gateway): TOAD's job is to _produce and propagate_ the delegation
chain and to give a _deny point_ at the tool boundary; a gateway or mesh remains
free to enforce, sign, and mTLS at the infrastructure tier. TOAD emits the
identity; the platform can enforce it.

## 1. The threat, in TOAD terms

TOAD composes agents with `uses:` / `asTool()` (SPEC §4.7; runtime
`agent.ts:657`). A parent agent A pulls in sub-agents B/C/D as tools, and the
model — not a static call graph — decides which to invoke next. Tools are plain
`defineTool` closures (`tool.ts`) that capture whatever credentials they need
(an env var, a bearer token, a DB handle).

Two properties combine into the vulnerability:

1. **Authority leaks down the chain.** A credential captured by a tool, or a
   token sitting in the conversation/context, is reachable by any sub-agent the
   loop happens to call — including one that should never touch that resource.
2. **The path is not knowable ahead of time.** The value of an agent is that it
   chooses the next step, so you cannot bake authorization into a topology the
   way you would segment microservices. RBAC-on-the-path does not apply.

Result: D verifies insurance, but — because the token rode along in context — it
_can_ read patient records, and the audit trail shows only "authorized
activity." That is the confused deputy.

### What TOAD does about it today: nothing

Checked against the current runtime:

- `asTool()` forwards the caller's `AbortSignal` and (optionally) rolls up usage
  (`agent.ts:666`) — but carries **no caller identity**.
- `AgentHooks.onToolCall(name, input)` is **observe-only**: it returns `void`
  (`agent.ts:66`, fired at `agent.ts:773`), so it cannot _deny_ a call.
- `ToolRunContext` exposes only `{ signal }` (`tool.ts:4`).

So confused-deputy defense is entirely on the developer's tool bodies. This
proposal closes that gap with a small, additive surface.

## 2. Goals / non-goals

**Goals**

- A **delegation chain** (caller → … → callee, plus the end user) that
  propagates automatically through `asTool()` composition.
- A **deny-capable authorization hook** at the tool-call boundary that sees the
  full chain and can block a call _before_ the tool runs.
- The chain is **observable** (traces/logs) and **exportable at boundaries**
  (e.g. as a header from `serveMcp`, for a gateway to enforce).
- **Zero-config safe default** and **100% backward compatible** — off unless you
  opt in.

**Non-goals**

- Re-implementing SPIFFE, Istio mTLS, or an OAuth2/Keycloak control plane. TOAD
  runs in-process on the Anthropic API; the network/identity-issuance tier is a
  platform's job. We _interoperate_ with it, we don't replace it.
- Cryptographic non-repudiation as a hard requirement. Signing is an **optional
  extension** (§7); the in-process chain is trustworthy to the degree the
  process is.

## 3. Design overview

Three pieces, each landing on a seam that already exists:

| Piece | What | Seam it uses |
| --- | --- | --- |
| **Principal & chain** | who is acting, and the ordered delegation chain | new `DelegationContext`, carried on `RunOptions` and `ToolRunContext` |
| **Propagation** | the chain extends by one hop at each `asTool` call | `asTool().run(value, ctx)` (`agent.ts:666`) |
| **Authorization** | a hook that can deny a tool call against the chain | upgrade the `onToolCall` seam (`agent.ts:773`) to an awaitable, deny-capable `authorize` hook |

### 3.1 Data model

```ts
/** One hop of authority: a workload identity, optionally what it may do. */
export interface Principal {
  /** Stable id of the actor — an agent name, a workload id, a SPIFFE ID. */
  id: string;
  /** Optional: what this principal is permitted to reach (scopes/roles). */
  scopes?: string[];
  /** Optional free-form claims (tenant, namespace, service account, …). */
  claims?: Record<string, unknown>;
}

/** The delegation chain that travels with a request. */
export interface DelegationContext {
  /** The end user / originator the whole chain acts on behalf of. */
  subject?: Principal;
  /** Ordered actors, oldest caller first; the last entry is the current agent. */
  chain: Principal[];
}
```

The chain is the analog of Kagenti's AuthBridge header (`D called by A on behalf
of user U`) — but produced natively by composition rather than injected by a
sidecar.

### 3.2 Entry: establishing the root

The caller passes the initial context once, at the top of the run:

```ts
await billing.run(inputs, {
  delegation: {
    subject: { id: "user:patient-1234", claims: { tenant: "hospital-a" } },
    chain: [{ id: "agent:billing-orchestrator", scopes: ["billing:read"] }],
  },
});
```

`RunOptions` gains an optional `delegation?: DelegationContext` (it already
carries `signal` and `hooks`, `agent.ts:137`).

### 3.3 Propagation: the chain extends at each hop

When agent A calls sub-agent D via `asTool`, the runtime appends D's principal
to the chain it received, and threads it into D's run. The seam is already
there — `asTool().run` receives `ctx` and forwards `ctx.signal`
(`agent.ts:666`); it now also forwards and **extends** `ctx.delegation`:

```ts
run: (value, ctx) => {
  const runOptions: RunOptions = {};
  if (ctx?.signal) runOptions.signal = ctx.signal;
  if (ctx?.delegation) {
    runOptions.delegation = {
      subject: ctx.delegation.subject,
      chain: [...ctx.delegation.chain, { id: `agent:${config.name}` }],
    };
  }
  if (options?.onUsage) runOptions.hooks = { onUsage: options.onUsage };
  return agent.run(value, runOptions);
},
```

`ToolRunContext` gains `delegation?: DelegationContext` so the loop can pass the
current chain into _every_ tool (not just sub-agents): the runtime sets it on the
`ctx` handed to `runTool` (`agent.ts:776`). A leaf tool that talks to an external
API can therefore forward the chain outward (a header), or make its own check.

### 3.4 Authorization: a deny point at the tool boundary

The decisive seam is `agent.ts:773`, where `onToolCall` fires immediately before
`runTool`. We add a sibling hook that is **awaitable and deny-capable** —
`onToolCall` stays as the pure-observability hook (unchanged, backward
compatible):

```ts
export interface AgentHooks {
  onToolCall?: (name: string, input: unknown) => void; // unchanged, observe-only
  /**
   * Authorize a tool call against the delegation chain *before* it runs.
   * Return (or resolve) `false`, or throw an `AuthorizationError`, to deny.
   * Every actor in the chain must be permitted for the call to proceed.
   */
  authorizeToolCall?: (req: ToolCallRequest) => boolean | Promise<boolean>;
}

export interface ToolCallRequest {
  tool: string;
  input: unknown;
  delegation?: DelegationContext;
  /** The agent that owns this tool loop. */
  agent: string;
}
```

At the seam:

```ts
hooks?.onToolCall?.(tu.name, input.data);
const allowed = await runAuthorize(hooks, {
  tool: tu.name, input: input.data, delegation, agent: config.name,
});
if (!allowed) {
  // structured tool_result with is_error: true — the model sees a clean denial,
  // the run continues, and the denial is on the trace. (Mirrors invalid-input
  // handling at agent.ts:760.)
  return deniedResult(tu.id, tu.name, delegation);
}
output = await runTool(def, input.data, tu.name, …);
```

Denial returns an error `tool_result` rather than throwing the whole run, so a
confused sub-agent simply cannot use the tool and the model can react — matching
how invalid tool input is already handled (`agent.ts:760`).

This is "authorize against the full delegation chain, not the path." Because the
chain travels with the request, the policy can say *"`agent:insurance-verifier`
may never reach `patient_records`, no matter who called it or what token it
holds"* — exactly what RBAC-on-topology cannot express for agents.

## 4. Worked example — the hospital billing chain

```ts
import { createAgent, AuthorizationError } from "toad-runtime";
import { patientRecords, insuranceCheck } from "./tools";

// Policy: which principals may reach which tools. Identity-based, path-free.
const MAY_REACH: Record<string, (p: string) => boolean> = {
  patient_records: (id) => id === "agent:billing-orchestrator",
  insurance_check: () => true,
};

const billing = createAgent({
  name: "billing-orchestrator",
  model: "claude-opus-4-7",
  tools: { patient_records: patientRecords, insurance_check: insuranceCheck },
  uses: { verifier },                      // a sub-agent, wired via asTool()
  hooks: {
    authorizeToolCall: ({ tool, delegation }) => {
      const policy = MAY_REACH[tool];
      // EVERY actor in the chain must be allowed — the confused-deputy guard.
      return !!policy && (delegation?.chain ?? []).every((p) => policy(p.id));
    },
  },
  // …prompt…
});

await billing.run({ patientId: "1234" }, {
  delegation: {
    subject: { id: "user:patient-1234" },
    chain: [{ id: "agent:billing-orchestrator", scopes: ["billing:read"] }],
  },
});
```

When the loop delegates insurance verification, the chain becomes
`[billing-orchestrator, verifier]`. If `verifier` (or the model on its behalf)
tries `patient_records`, `every(...)` fails on `agent:verifier` → the call is
denied, the model is told, the run continues, and the trace records the blocked
attempt. The token riding in context is irrelevant: authority is the chain, not
the bearer.

## 5. Boundary I/O — composing with gateways

The chain is only as useful as its reach across process boundaries. Two
boundaries matter, both of which TOAD already owns:

- **`serveMcp` (inbound + outbound).** When TOAD exposes agents as MCP tools
  (`mcp.ts`), it should (a) **accept** an incoming delegation header and seed the
  root context from it, and (b) **emit** the chain on outbound tool calls. A
  proposed wire form, deliberately close to AuthBridge's intent:

  ```
  Toad-Delegation: subject=user:1234; chain=agent:A,agent:D; tenant=hospital-a
  ```

  A gateway (Kagenti's MCP gateway, an Istio policy, an Envoy filter) can then
  enforce on the header without trusting TOAD's in-process check — defense in
  depth.

- **Leaf tools calling external services.** A tool reads `ctx.delegation` and
  forwards it (or maps it to an OAuth2 token-exchange / RFC 8693 call). This is
  where TOAD hands off to the real credential tier.

TOAD's contribution is that the chain is **built correctly by construction** at
every `asTool` hop, so whatever enforces it downstream gets an honest record.

## 6. API surface (all additive, all opt-in)

- `RunOptions.delegation?: DelegationContext` — seed the root (`agent.ts:137`).
- `ToolRunContext.delegation?: DelegationContext` — read the chain in a tool
  (`tool.ts:4`).
- `AgentHooks.authorizeToolCall?` + `ToolCallRequest` — the deny point
  (`agent.ts:65`).
- `asTool()` extends the chain automatically (`agent.ts:666`).
- New exports: `DelegationContext`, `Principal`, `ToolCallRequest`,
  `AuthorizationError`.
- **Optional, future, declarative:** an `.agent`-level `allow:` block listing the
  scopes/sub-agents an agent may reach, compiled by `toac` into a default
  `authorizeToolCall`. This stays identity-based (what an agent may reach), never
  path-based, so it doesn't fall into the topology trap. Out of scope for v1.

Nothing changes for an agent that sets none of these: no `delegation`, no
`authorizeToolCall` → identical behavior to today.

## 7. Security considerations

- **Trust boundary.** The in-process chain is trustworthy to the degree the Node
  process is. It defends against a _confused_ deputy (an honest agent misled by
  the model/context), which is the stated threat — not against a _malicious_
  in-process actor that rewrites the chain. For cross-boundary integrity, the
  exported header SHOULD be signed/mTLS'd by the platform (Kagenti/Istio); an
  **optional** `signChain`/`verifyChain` extension can attach a JWS to the header
  for TOAD-to-TOAD hops without a mesh.
- **Fail closed at the boundary, fail observable in-loop.** A thrown
  `AuthorizationError` from `authorizeToolCall` aborts the run (hard stop); a
  `false` return denies just that call and lets the model continue. Both are on
  the trace.
- **No silent widening.** The chain only ever _appends_; a sub-agent cannot drop
  or reorder prior actors, so `every(...)`-style policies cannot be bypassed by
  composition depth.
- **Auditability.** Because the chain rides with the request and every
  decision is hookable, the "authorized activity that was actually a breach"
  blind spot closes: a denied or allowed call is attributable to the full chain,
  not just the bearer.

## 8. Observability

The chain threads naturally into the existing event stream
(`AgentEvent`, `runStream`): `tool_use`/`tool_result` events can carry the
`delegation` snapshot, and a denial surfaces as an error `tool_result`. Combined
with OpenTelemetry around `serveMcp`, a single trace can show the whole
delegation path and who authorized each hop — the same end-to-end story Kagenti
gets from Phoenix, available to a plain TOAD deployment.

## 9. Backward compatibility & rollout

Purely additive. Suggested sequencing:

1. **Types + propagation** — ✅ **done.** `DelegationContext`/`Principal` thread
   through `RunOptions` → `asTool` (auto-extends the chain) → `ToolRunContext`.
   No behavior change when unused; the chain is observable in tools.
2. **Authorization** — ✅ **done.** `authorizeToolCall` (deny-capable) +
   `AuthorizationError` + denied-result handling at the tool-call seam, with
   AND-merge across config and per-call hooks. Covered by `delegation.test.ts`,
   including the chain-wide confused-deputy scenario.
3. **Boundary I/O** — _proposed._ `serveMcp` accept/emit the `Toad-Delegation`
   header so a gateway can enforce/sign.
4. **Optional** — _proposed._ JWS signing; declarative `.agent` `allow:` block
   (separate SPEC bump).

Stages 1–2 are the core confused-deputy fix and shipped as one self-contained,
opt-in change to `toad-runtime`.

## 10. Open questions

- **Header format & name** — bespoke `Toad-Delegation`, or align with an emerging
  standard (e.g. an MCP delegation header, or WIMSE/RFC 8693 token exchange) for
  out-of-the-box gateway interop?
- **Default when `authorizeToolCall` is absent but `delegation` is present** —
  allow (observe-only) or require an explicit allow? Proposed: allow, to keep the
  feature strictly additive; denial is opt-in.
- **Principal id scheme** — free string vs. a SPIFFE-ID-shaped convention
  (`spiffe://…`) to ease platform interop.
- **Should `uses:` in the `.agent` file imply scopes** at compile time, seeding a
  default policy? (Ties into the optional declarative `allow:` block.)
```
