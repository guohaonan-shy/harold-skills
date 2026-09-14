# GitHub review record

Read this when preparing, publishing or resuming either PR workflow. GitHub PR Markdown,
Conversation comments and inline threads are the durable record. No HTML artifacts or
required local review files. Temporary command inputs are disposable.

## Read and publish

Use authenticated gh with PR/review-thread access. The helper calls official REST/GraphQL
APIs, with JSON on stdin, and paginates comments/threads. Official GitHub plugin tools can
also inspect the PR; use the helper for writes to preserve markers and retry behavior.

```bash
node "<pluginRoot>/scripts/github-review.mjs" snapshot OWNER/REPO PR
node "<pluginRoot>/scripts/github-review.mjs" publish /absolute/path/to/plan.json
```

snapshot returns base/head SHAs, title/body, complete comments, recovered findings with stable
IDs/root comment IDs/thread IDs/URLs, prior rounds and current round. Read human replies too.
Only one publisher should operate on a PR at a time. Each write checks base/head; API errors
stop publication rather than silently creating a different kind of comment. GitHub provides
no cross-API transaction: after partial failure, report written operations, reread state,
and retry the same plan after reconciling edits.

The publish JSON:

| Field | Contents |
| --- | --- |
| repo, pr | Base repository owner/name and PR number |
| headSha, baseSha | Full SHAs from the reviewed snapshot |
| expectedBody, expectedTitle | Unmodified PR text read before drafting; detects edit conflicts |
| body, title | Complete current description/title preserving human context and decisions |
| summary | Short Chinese round delta, decisions and limitations |
| checks | Entries {name, required, status, evidence}; required correctness, standards, spec, verification plus relevant CI |
| updates | Only new/changed findings; omitted prior findings remain open |

Check status: passed, failed, incomplete, not-applicable, always with evidence/reason.
Correctness must run. No spec and no sufficient accepted agreement means incomplete.
No written applicable standards can mean not-applicable, with discovery evidence.
Not applicable never means a required tool failed to start.

Each finding update contains:

- key: stable failure identity (behavior/invariant + trigger); reuse across axes, rounds and
  line moves. The helper allocates F-N IDs.
- title, axes (correctness/standards/spec), priority (P0/P1/P2), blocksMerge, status.
- body: concise Chinese scenario, expected/observed behavior, evidence/procedure and suggested
  fix. Identify Codex as correctness source and Claude as verifier where applicable; the
  authenticated account publishes both, without impersonating another GitHub identity.
- location: optional {path, line, side: "RIGHT" | "LEFT"} for a real current diff anchor.
  Verify it first. Omit for cross-cutting concerns; Conversation comments are not threads.
- For resolved: verification: {headSha, result: "passed", procedure, before, after}.
  Include independent verification/regression evidence in visible body too.
- For dismissed/accepted-risk: dispositionEvidence with rebuttal or maintainer decision URL.
  Accepting risk is not fixing. Reopening requires new evidence.

Updates reply to the ROOT inline comment, not a reply ID. Resolution uses GraphQL thread ID,
not REST comment ID. The helper resolves/reopens after posting the explanation. Conversation
updates are new linked comments with the same finding ID. Hidden markers support recovery;
all meaningful evidence also belongs in visible Markdown. Preserve human discussion.

## Description and diagrams

Explain the final change, not commit chronology. Every logical change gets a before/after
example and code entry links. Use native fenced mermaid for changed flows, dependencies or
state transitions when useful. Small changes can use examples alone. No external diagram
service or HTML report is needed.

Suggested order: why → logical changes (example + Mermaid where useful) → actual verification
→ limits/decisions. Fold long traces/eval tables with details. Update title when scope expands.
Preserve human-authored constraints and issue/spec links.

Trace diagram edges/examples to actual code. Validate Mermaid syntax with available tooling
and inspect GitHub rendering after publication when a browser is available; disclose checks
not performed. A syntax check is not rendered QA. Prose-only changes need no app servers unless
a claim requires them.

One summary per reviewed head: retries update that round, new commits start a new round.
Link every finding and report axis/check gaps independently of blocker count. An old SHA
summary is historical after a push. Fetch current head before claiming readiness.
Never auto-approve or merge.

## Existing artifact-only PRs

Fresh PRs need no migration. If an old PR has no GitHub finding records, report missing history.
A legacy HTML file can be imported once only when available and the user authorizes migration;
mark old verification stale. Otherwise run a fresh current-head review rather than inventing
IDs or claiming old findings resolved. Do not open or republish an artifact.
