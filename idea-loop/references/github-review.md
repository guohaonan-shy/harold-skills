# GitHub review record

Read this when preparing, publishing or resuming a review loop. **One Conversation comment per round**
(the round post) plus the PR description are the durable record. No HTML artifacts or local review
files; temporary plan JSON is disposable.

## Helper

```bash
node "<pluginRoot>/scripts/github-review.mjs" snapshot OWNER/REPO PR
node "<pluginRoot>/scripts/github-review.mjs" publish /absolute/path/to/plan.json   # or - for stdin
```

`snapshot` returns head/base SHAs, the PR title and body, every round post (round, URL, the findings
recorded in its marker), the latest status per finding key across rounds, `nextRound` and the highest
finding ID. Per-finding comments from the earlier design are counted (`legacyCount`) and continue the
numbering, but are never rewritten.

`publish` validates the plan, checks that the PR is open and its head/base equal the plan's, allocates
`F-N` IDs (a key keeps its ID across rounds), renders the round post and creates it, or edits the same
post when that round was already published for the same reviewed SHA. Retrying the same plan never
duplicates a post. Only one publisher should operate on a PR at a time.

## Identity

If `~/.idea-loop/github-apps.json` has an entry for the repository, the helper signs a JWT with that
GitHub App's private key, exchanges it for an installation token and uses it only as `GH_TOKEN` for its
own `gh` calls. The token is never printed, written or handed to an agent. Round posts then come from
the App (for Toeflair: `toeflair-claude`, App ID 4948428). Speaking as the App with the App's own token
is not impersonation. Without an entry, the gh login publishes and the post says so. Pushing, creating
the PR and writing its description stay with Harold's gh login.

```json
{ "guohaonan-shy/Tofelair": { "appId": 4948428, "privateKeyPath": "~/projects/TOFEL-demo/toeflair-claude.pem" } }
```

The App needs Issues read/write (Conversation comments) and Pull requests + Contents read.

## Plan

| Field | Contents |
|---|---|
| repo, pr, round | Base repository, PR number, the round being published |
| reviewedSha | The head this round reviewed |
| headSha | The head after this round's fix commits (equals reviewedSha when nothing was committed) |
| baseSha, mergeBaseSha | Full SHAs from preparation |
| summary | Short Chinese summary of the round |
| checks | `{name, required, status, evidence}`; required correctness, standards, spec, verification (plus project-checks) |
| findings | This round's findings; earlier rounds keep their outcome unless a key reappears |

Check status: passed, failed, incomplete, not-applicable, always with evidence. Correctness must run.
No explicit acceptance agreement means spec is incomplete, never not-applicable.

## Finding fields

Every field is written for the person deciding, in concise Chinese. The helper rejects a plan that
breaks any rule in the right column.

| Field | Meaning | Enforced |
|---|---|---|
| key | Stable failure identity (behavior/invariant + trigger), reused across rounds | unique per plan |
| title | The consequence, not the mechanism | no `path:line` |
| impact | One sentence: who, when, what goes wrong | ≤ 60 characters, no `path:line` |
| repro | Numbered steps from a user action or input | ≥ 2 steps |
| fix | ONE recommended remedy + one-line reason; after a fix, what was done | required for confirmed/resolved |
| options | Exactly two choices with their cost | required for needs-decision |
| evidence | Output, line references, trace | required; rendered folded |
| instrument | unit-test / api / db / browser / eval / eval-replay / static | closed set |
| reproducer | The rerunnable command or browser steps | required for confirmed/resolved |
| introduced | Whether this PR introduced it (review-standards.md) | false ⇒ never blocks |
| location | `{path, line}` on the head, rendered as a permalink | optional |
| priority, axes, status, blocksMerge | P0/P1/P2; correctness/standards/spec; see below | closed sets |

Status: confirmed, resolved, needs-decision, needs-verification, backlogged, dismissed, accepted-risk.

- **resolved** needs `verification {result: "passed", instrument, beforeSha, headSha, procedure, before, after}`
  where beforeSha is the reviewed head, headSha the plan's head (a later commit), and instrument equals
  the finding's own; unit-test, api and db also need `testRef`, the regression test that failed before
  and passes after.
- **backlogged** is a pre-existing problem with `backlog {path, entry, commit}`; it never blocks.
- **dismissed** and **accepted-risk** need `dispositionEvidence`: a rebuttal, or a linked maintainer decision.
  Accepting risk is not fixing.

## Round post

Rendered by the helper in a fixed order, so it reads the same every round:

```markdown
## Review 第 N 轮 · 审 a1b2c3d → 修复后 e4f5a6b
<summary>
<verdict: mergeReady, or what blocks>
| # | 标题 | 优先级 | 轴 | 状态 |
### F-1 · [P1] <title>
axes · 状态 · 阻塞/不阻塞 · 本次引入/存量问题 · [代码](permalink)
**影响** → **复现** → **修法** → **验证**（修复前/修复后/回归测试）→ <details>证据</details>
<details>本轮检查</details>
```

A hidden marker at the top holds the compact findings so the next round's snapshot can recover them;
everything meaningful is also in the visible text. mergeReady is never a merge authorization.

## PR description

Written once, when the loop opens the PR: why, each logical change with a before/after example,
native Mermaid only where a flow needs it, code links, and a final `## 验收契约` section with the
accepted agreement verbatim. A reused PR's human-written description is not rewritten; when it has no
`## 验收契约` section, only that section is appended. Round posts carry the review history.
