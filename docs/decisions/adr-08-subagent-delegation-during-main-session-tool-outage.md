# ADR 08: Subagent Delegation During Main-Session Tool Outage

Date: 2026-11-11
Status: Accepted

## Context

Midway through the ATLAS build, the main agent session's built-in
tools — Bash, Read, Write, Edit, MultiEdit, LS, Glob, Grep — went
down. Every call returned one of two errors: `context deadline
exceeded` or `Post http://prod-wsmgr-svc:8080/mcp: EOF`. The outage
was not transient: a call would hang for tens of seconds, return
the deadline/EOF error, and the next call would do the same. The
tools stayed down for the remainder of the build. The main session
could still *think* (the LLM was responding), still *dispatch
subagents* via the Task tool, still *track state* via TodoWrite/
TodoRead, and still *invoke skills* via the Skill tool — but the
direct file-and-shell surface was gone. This is the single most
important finding of the entire ATLAS build, and this ADR records
the decision the agent made in response.

The constraints at the moment of failure were sharp. The ATLAS
build was not finished: the data layer, the frontend views, the
charts, the API endpoints, the seeded benchmark data, the GitHub
repo, the docs, and the verification all remained. Halting and
reporting "tools down" would have left the deliverable at ~20%
complete. Waiting for the tools to recover was not an option — the
outage showed no sign of resolving, and the session context would
have filled while waiting. The Task tool (subagent dispatch)
continued to work because subagents have their own tool connections
that don't share the main session's broken `prod-wsmgr-svc:8080/mcp`
endpoint. This was verified empirically: a Task call to a subagent
returned a result with file writes confirmed, even as the
main-session Bash tool returned EOF on the very next call. The
architecture — orchestrator + stateless executors — was designed
exactly for this kind of failure, and the build was about to test
that design under live fire.

## Decision

**Delegate all remaining execution to subagents via the Task tool**,
with the main session acting purely as orchestrator. Specifically:
(a) the main session holds the plan (via TodoWrite), the context
(what's been done, what remains), and the verification (via separate
verify subagents that read the actual files); (b) every concrete
execution step — write the Prisma schema, write the API route
handlers, write the chart components, seed the benchmark data,
create the GitHub repo, write the docs — is dispatched as a Task
with a detailed, self-contained prompt (because subagents are
stateless and cannot ask the main agent clarifying questions);
(c) parallel independent deliverables are dispatched as parallel
Task calls (e.g., docs subagents and verify subagent ran
concurrently); (d) verification is done by a *separate* verify
subagent that reads the actual files and reports back, because the
subagent's final text report was sometimes garbled (model
degradation under load — see the capability report §13) even when
the file writes succeeded. The main session never directly called
Bash/Read/Write/Edit/LS/Glob/Grep after the outage — every file
operation went through a subagent.

## Alternatives Considered

- **Halt and report the outage** — the correct choice if the outage
  made the deliverable impossible. Rejected because the Task tool
  still worked and the deliverable was achievable via subagents.
  Halting would have left the build at ~20%.
- **Wait for recovery** — the outage showed no sign of resolving
  over many minutes; the session context would have filled while
  waiting. Rejected as indeterminate and context-wasteful.
- **Retry the main-session tools with backoff** — tried; the
  retries returned the same `context deadline exceeded` / EOF
  errors. Rejected as the failure was not transient.
- **Switch to a different tool modality in the main session** —
  e.g., use the Skill tool to invoke a skill that internally uses
  Bash. This was used opportunistically (the Skill tool continued
  to work), but skills are narrow; the broad file-and-shell surface
  was still needed, and only subagents provided it.
- **Ask the user to restart the session** — would have lost all
  context. Rejected.

## Consequences

**Positive.** The build completed. Every deliverable — the Prisma
schema, the 11 API endpoints, the 6 views, the 8 charts, the seeded
benchmark data, the GitHub repo, the docs, the verification — was
produced by subagents under the main session's orchestration. The
architecture (orchestrator + stateless executors) was vindicated
under the exact failure mode it was designed for. The main session's
context was preserved (subagents return a short report, not the
full tool-call log), which let the build fit in one context window.
Parallel dispatch of independent deliverables (docs + verify, then
docs-A + docs-B + docs-C in parallel) compressed the wall-clock
elapsed time.

**Negative.** **Added latency**: every file operation required a
Task round-trip (seconds to tens of seconds), where the main-session
Bash would have been sub-second. **Harder iterative debugging**: a
subagent can't ask the main agent a clarifying question, so every
prompt had to be fully self-contained, which made small iterative
fixes expensive (a one-line typo fix became a full Task call with
context re-embedded). **Subagent final-report text was sometimes
garbled** (model degradation under load — words run together,
truncated sentences) even though the file writes succeeded; this
forced a separate verify subagent to read the actual files and
report ground truth, doubling the verification cost.

**Neutral.** The decision is not reversible (the main-session tools
did not recover), but it is the right one for any future build that
hits the same failure mode: **delegate early, delegate detailed
prompts, verify with a separate subagent that reads the actual
files**. The capability report §10 and §13 document the strategy
and the limitations in detail. This ADR is the canonical reference
for the workaround.
