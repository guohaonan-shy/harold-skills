export const meta = {
  name: 'pr-review-round',
  description: 'One round of three-axis PR review — Correctness / Standards / Spec run in parallel, each triaged on its own, then appended to the shared artifact',
  whenToUse: 'Shared tail called by pr-open-review (round 1) and pr-fix-verify (round N+1) via workflow() composition. Not meant to be invoked directly by a human.',
  phases: [
    { title: 'Review', detail: 'three axes in parallel: codex correctness / standards / spec fidelity' },
    { title: 'Triage', detail: 'each axis triaged against the real code, separately' },
    { title: 'Publish', detail: 'one artifact; only correctness+spec blocking findings surface up top' },
  ],
}

// Codex's own install path — machine-specific, not this plugin's problem to
// solve (it points at a *different* marketplace plugin, not at us). Known
// remaining fragility: if codex is ever installed elsewhere, update here.
const CODEX_COMPANION = '/Users/guohaonan/.claude/plugins/marketplaces/openai-codex/plugins/codex/scripts/codex-companion.mjs'

// See pr-open-review.mjs for why this defensive parse exists — args has been
// observed arriving JSON-stringified rather than pre-parsed.
const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args
const { cwd, prNumber, prUrl, headRefName, baseRefName, roundHint, note, pluginRoot } = parsedArgs

// Workflow scripts have no filesystem/env API, so these can't be resolved
// here — the dispatcher SKILL.md reads ${CLAUDE_PLUGIN_ROOT} (which only
// expands in markdown) and threads it down as `pluginRoot`.
const REVIEW_STANDARDS = `${pluginRoot}/references/review-standards.md`
const ARTIFACT_TEMPLATE = `${pluginRoot}/references/review-artifact-template.html`

// Scratch state for building up the artifact across rounds within one
// session — not the source of truth (the published Artifact is; the
// dispatcher resolves that via Artifact({action:"list"}) so a later session
// picks up where a prior one left off even if this local copy is gone).
// Scoped under cwd rather than a machine-level home-dir path: no Node fs/env
// API is available in this script, cwd is already a verified-working
// absolute path, and per-worktree scoping means two repos (or two worktrees
// of the same repo) can never collide on a PR number. Gitignored.
const PR_REVIEWS_DIR = `${cwd}/.claude/.idea-loop-state/pr-reviews`

const roundNote = note
  ? `\n\nContext for this round (read it — it may already say which prior findings should now be resolved):\n${note}\n`
  : ''

// ── The three axes ────────────────────────────────────────────────────────
//
// They are deliberately separate, and their findings are NEVER merged or
// reranked into one list. A change can pass one axis and fail another:
// code that follows every convention but builds the wrong thing passes
// Standards and fails Spec; code that does exactly what the spec asked while
// wrecking the codebase's conventions does the reverse. One ranked list would
// let a clean axis mask a failing one.
//
// Each axis runs review -> triage as its own pipeline, so a slow axis never
// holds up a fast one's triage.

const AXES = [
  {
    key: 'correctness',
    label: 'Correctness',
    review: `Run a codex adversarial review and return its full raw output.

Working directory: ${cwd}
Command: node "${CODEX_COMPANION}" adversarial-review --wait --base "${baseRefName}" --cwd "${cwd}"

Before running it, sanity-check the target is real:
- \`test -d "${cwd}"\`
- \`git -C "${cwd}" cat-file -e "${baseRefName}^{commit}"\` (try \`origin/${baseRefName}\` too, fetching first, if the plain ref doesn't resolve locally)
If either check fails, do NOT run codex — return ran:false and explain what failed in rawOutput instead.

Set \`ran:false\` whenever the review did not actually produce a review — not only when the pre-flight checks fail. That includes: the command exits non-zero, it returns in a couple of seconds having printed an install/setup error, or the output carries no findings section at all. A tool that failed loudly must not be reported as a tool that looked and found nothing.

Otherwise run the command in the foreground and wait for it to finish (it can take several minutes — expected, this agent call is already async to whatever is waiting on it, no need to background it yourself). Capture stdout+stderr verbatim into rawOutput.${roundNote}`,
    triage: (raw) => `You are triaging codex's adversarial review output for PR #${prNumber} (${headRefName} -> ${baseRefName}).

This is the **Correctness** axis: does this change break something? Bugs, crashes, data corruption, security, money. NOT style, NOT whether it built the right thing.

Codex's raw output:
"""
${raw}
"""
${roundNote}
For EVERY finding, read the FULL changed file(s) in ${cwd} (not just the hunk codex quoted) and trace the actual caller/consumer/data path before classifying — codex is sharp but not infallible. Reuse that trace as your evidence field, not a restatement of codex's claim.

Scope-contamination check: this working tree may have other live changes in flight, and codex's \`review --base\` reads the live tree rather than a pinned snapshot. Before filing a finding, spot-check its cited file:line against \`git -C "${cwd}" diff ${baseRefName}...HEAD --stat\` — if that file is not part of this PR's diff, DISMISS it as scope contamination.

Do not invent findings that aren't in codex's output.`,
  },

  {
    key: 'standards',
    label: 'Standards',
    review: `Review PR #${prNumber}'s diff in ${cwd} on the **Standards** axis: does this code follow this repo's documented conventions?

You are NOT hunting bugs (another axis does that) and NOT checking whether it built the right thing (a third does that).

**Step 1 — find and run whatever this repo already uses for lint/typecheck, scoped to this diff.**

\`\`\`
git -C "${cwd}" diff ${baseRefName}...HEAD --name-only
\`\`\`

For each language the diff touches, find the repo's own tool config — walk up from each changed file to the nearest \`pyproject.toml\` (with a \`[tool.ruff]\` section) / \`ruff.toml\` / \`.ruff.toml\` for Python, the nearest \`tsconfig.json\` for TypeScript, or whatever this repo's own README/CLAUDE.md names for other stacks — and run it scoped to the changed files from the directory that owns that config (e.g. \`ruff check <changed .py files>\`, \`tsc --noEmit -p tsconfig.json\`). If a language has no discoverable config, skip it — this step is opportunistic, never invent a check the repo doesn't already have. Never edit or commit anything — this axis reads, it does not write.

**A check whose findings CI already blocks on is not yours to report.** Check the repo's CI config (\`.github/workflows/*.yml\` or equivalent) — if the exact same check already gates merges there, still run it (to know what CI will say) but **file no finding for any of it**; the author is already blocked and will fix it. **A check that runs but isn't CI-enforced is different — its diff-scoped findings ARE yours to file**, since nothing else catches them.

**Filter to the diff.** Whatever a tool finds outside the lines this PR actually touched is pre-existing debt, not this review's business — report only what the diff introduced or touches.

**Step 2 — then review what tools cannot check.**

Read ${REVIEW_STANDARDS} in full — it carries this repo's 8 documented engineering principles rendered as diff-checkable questions, plus the Fowler smell baseline that applies even where nothing is documented, plus the reporting rules.

Two things bind you:
- **Do not re-report anything the tools already found in step 1.** Tooling owns "objectively wrong"; you own "is this written well".
- A documented repo standard can be a hard violation. A baseline smell is **always** a judgement call — say "possible Feature Envy", never "violates standards".

**Be sparing — this axis is the one that generates noise, and noise here costs more than a missed nit.** Three rules:

- **No speculative concerns without evidence.** If you cannot point at the hunk and say concretely what goes wrong, do not file it.
- **Cap the volume: at most 5 findings.** Do not walk all 12 smells looking for hits. Report the ones that would actually change how someone reads or maintains this code.
- **Prefer the design-level principles over the nitpicks.** "Built something nobody asked for" (Simplicity first / Speculative Generality), "touched code unrelated to the task" (Surgical changes), and "the verification could not have failed" (Verify with a falsifiable signal) are worth a human's attention. Naming quibbles and message chains are not — skip them unless they are genuinely confusing.

Every finding cites its source: either the standards file + the specific rule, or the smell name + the quoted hunk.${roundNote}`,
    triage: (raw) => `You are triaging the **Standards** axis findings for PR #${prNumber}.

Raw axis output:
"""
${raw}
"""

For each finding, open the real file in ${cwd} and check it holds. Classify:
- CONFIRMED — it genuinely violates a documented rule, or the smell is really there and worth acting on.
- PLAUSIBLE — the smell is arguable, or the rule's application here is a judgement call you can't settle alone.
- DISMISSED — false positive, or the repo documents something that overrides it. Write the one-line rebuttal.

Anything that came from the deterministic tools (ruff / tsc) is CONFIRMED by construction — the compiler and linter do not have opinions. Keep them, don't re-litigate them, and mark their evidence as the tool's own message.

Severity depends on where the finding came from — this is the axis's one real distinction:

- **Tool-derived (\`tsc\`)**: the compiler does not have opinions. A type error on code this PR touched is objectively wrong, so grade it on its real impact (up to \`high\`) and mark \`fromTool: true\`. These **do** count toward the merge gate — nothing else in the repo enforces types.
- **Judgement (documented standards, Fowler smells)**: capped at \`medium\`, never \`high\`/\`critical\`, pure style is \`low\`, and **these never block a merge.** Their job is to keep the codebase honest over time, not to hold up a PR that works and does what was asked.

Never file a ruff finding at all — CI owns those (see the review brief).`,
  },

  {
    key: 'spec',
    label: 'Spec',
    review: `Review PR #${prNumber}'s diff in ${cwd} on the **Spec** axis: does this code faithfully implement what was agreed?

You are NOT hunting bugs and NOT checking conventions. You are checking fidelity to the agreement.

**Step 1 — find the spec.** In this order, stop at the first hit:
1. Tickets: \`ls ${cwd}/docs/spec/tickets/\` — a ticket whose title/slug matches this branch (\`${headRefName}\`) or the PR title. Its **acceptance criteria checkboxes** are the sharpest contract available.
2. Spec: \`ls ${cwd}/docs/spec/\` — matched by branch name, PR title, or the ticket's parent.
3. The PR body / linked issue, via \`gh pr view ${prNumber} --json title,body\` in ${cwd}.

If you find nothing, return ran:true with \`noSpec:true\` and an empty findings list, and say where you looked. **Do not invent a spec from the diff** — that would make this axis pass by construction, which is worse than admitting it had nothing to check.

**Step 2 — read it in full**, then read the diff, then report three things:
- **Missing / partial** — a requirement the spec asked for that this change does not deliver, or delivers halfway.
- **Scope creep** — behaviour in the diff nobody asked for. (Refactors that the spec did not call for count here.)
- **Wrongly realised** — something that looks implemented but does not do what the spec's words actually say.

**Quote the spec's own line for every finding.** A finding without a quoted line is not a Spec finding — drop it.

Pay particular attention to §5 测试决策 if the spec has one: it names which instrument each kind of change must be verified with (TDD unit / TDD API / real DB / eval / screenshot / browser E2E). A change that skipped its named instrument is a Spec finding, not a Standards one.${roundNote}`,
    triage: (raw) => `You are triaging the **Spec** axis findings for PR #${prNumber}.

Raw axis output:
"""
${raw}
"""

For each finding, re-read both the quoted spec line and the actual code in ${cwd}. Classify:
- CONFIRMED — the spec says X, the code does not do X. Quote both sides.
- PLAUSIBLE — the spec is ambiguous here, or it is genuinely unclear whether this was meant to be in this slice. Flag for the human, do not force a verdict.
- DISMISSED — the spec actually allows it, or it lives in another ticket. One-line rebuttal.

A finding whose spec quote you cannot locate in the spec file is DISMISSED as fabricated — say so plainly.

Severity: a missing requirement the user would notice is at least \`high\`; unrequested scope is usually \`medium\` (it is maintenance debt, not breakage).`,
  },
]

phase('Review')
const axisResults = await pipeline(
  AXES,
  (axis) =>
    agent(axis.review, {
      label: `review:${axis.key}`,
      phase: 'Review',
      schema: {
        type: 'object',
        properties: {
          ran: { type: 'boolean' },
          rawOutput: { type: 'string', description: 'The axis findings, or why it could not run' },
          noSpec: { type: 'boolean', description: 'Spec axis only: no spec was found to check against' },
          toolFindings: { type: 'string', description: 'Standards axis only: verbatim ruff/tsc output scoped to this diff' },
        },
        required: ['ran', 'rawOutput'],
      },
    }),
  async (review, axis) => {
    // An axis that did not run must stay distinguishable from an axis that ran
    // and found nothing — collapsing them into `findings: []` is how a review
    // that never happened comes out looking like a clean pass.
    if (!review || !review.ran) {
      return { axis: axis.key, label: axis.label, ran: false, reason: review?.rawOutput || 'agent returned nothing', findings: [] }
    }
    if (review.noSpec) {
      return { axis: axis.key, label: axis.label, ran: true, noSpec: true, reason: review.rawOutput, findings: [] }
    }
    const triaged = await agent(axis.triage(review.rawOutput), {
      label: `triage:${axis.key}`,
      phase: 'Triage',
      schema: {
        type: 'object',
        properties: {
          findings: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                file: { type: 'string' },
                line: { type: 'number' },
                severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
                verdict: { type: 'string', enum: ['CONFIRMED', 'PLAUSIBLE', 'DISMISSED'] },
                evidence: { type: 'string', description: 'The trace/proof, the quoted spec line, the tool message, or the DISMISSED rebuttal' },
                fixDirection: { type: 'string', description: 'Suggested fix approach; empty for DISMISSED' },
                fromTool: { type: 'boolean', description: 'Standards axis: came from tsc rather than judgement — these can block' },
              },
              required: ['title', 'file', 'severity', 'verdict', 'evidence'],
            },
          },
        },
        required: ['findings'],
      },
    })
    return {
      axis: axis.key,
      label: axis.label,
      ran: true,
      toolFindings: review.toolFindings || '',
      findings: (triaged && triaged.findings) || [],
    }
  },
)

const byAxis = {}
for (const r of axisResults.filter(Boolean)) byAxis[r.axis] = r

const skipped = AXES.map((a) => a.key).filter((k) => !byAxis[k] || !byAxis[k].ran)
if (skipped.length) log(`⚠️ 未跑成的轴：${skipped.join(', ')} — 会在 artifact 里标成「❌ 未跑」，不要当成「查过且干净」`)

// Fail closed on Correctness — but fail closed on the MERGE, not on the round.
//
// Correctness is the axis between a merge and a shipped bug, so a silent
// non-run there must never read as green. It gets enforced by refusing to
// report a passing gate (openHighSeverityCount stays null and correctnessRan
// is false), NOT by returning early.
//
// Round 1 of PR #338 is why: codex was broken on the machine, this returned
// immediately, and Standards + Spec — which had both completed, 12 triaged
// findings across six agents — were discarded with it. Their work had to be
// dug out of journal.jsonl by hand. A broken tool on one axis is not a reason
// to throw away what the other two found.
const correctnessRan = Boolean(byAxis.correctness && byAxis.correctness.ran)
const correctnessFailure = correctnessRan
  ? null
  : `Correctness axis did not run: ${byAxis.correctness ? byAxis.correctness.reason : 'agent died'}`
if (correctnessFailure) log(`❌ ${correctnessFailure}\n   → 本轮不给合并放行；Standards / Spec 的结果照常发布并在 artifact 里标明 Correctness 未跑。`)

phase('Publish')
const published = await agent(
  `Publish/update the review artifact for PR #${prNumber} (${headRefName} -> ${baseRefName}) as an **HTML page**.

Local source of truth (always Read-modify-Write, never rebuild from scratch — prior rounds must survive):
${PR_REVIEWS_DIR}/pr-${prNumber}-review.html

Structure and styling come from ${ARTIFACT_TEMPLATE}. **Read it first.** It encodes an information hierarchy that was designed and approved — do not redesign it per round, and do not go back to a wall-of-markdown page. If the local file doesn't exist yet, copy the template and fill it; if it does, edit it in place.

Resolve the PR's already-published Artifact via Artifact({action:"list"}) so you update the SAME page instead of minting a new one — unless this is genuinely round 1 (no local file AND nothing matching in the list). Migrating from an older \`pr-N-codex-review.md\` page: reuse its URL, carry its findings and round history into the HTML, and keep the F-N ids.

Determine the ACTUAL round number from the page's own round list (last + 1); roundHint=${roundHint} is only a hint.

## What goes where — this is the part that matters

**One number at the top**: open CONFIRMED findings at critical/high **from Correctness and Spec only**. Standards never counts toward it and never appears in the top section. A style opinion must not make a working, faithful PR look blocked.

**「需要你处理」section**: only the findings counted in that number, severity-ordered. This is the one part meant to be read line by line.

**Every long trace goes inside \`<details class="trace">\`.** The evidence field runs to hundreds of words; leaving it expanded is what made the old page unreadable. Title, location, severity chip stay outside; the trace is one click away.

**Everything else — Standards, Plausible, Resolved, Dismissed — goes in \`<details class="quiet">\`, collapsed.** They are the record, not the to-do list.

${correctnessFailure ? `**⚠️ Correctness 轴本轮未跑：${correctnessFailure}** —— 在 Summary 的轴记分板上把它标成 **❌ 未跑** 并写明原因，顶部那个大数字旁边加一句「Correctness 未跑，本轮不能视为通过」。**绝不把它记成 0 条发现。** 「没人看过」和「看过且干净」必须可区分。\n` : ''}**Mechanical ruff findings never appear here** — the CI gate owns them, and the author fixes them before the PR can merge.

**Keep the three axes separate — never merge or rerank across them.** A change can pass one and fail another; one combined list lets a clean axis hide a failing one.

**An axis that did not run is ❌ 未跑 with its reason, never zero findings.** "Nobody looked" and "looked and found nothing" must stay distinguishable.

${roundNote}
Carry forward: prior-round entries marked resolved by the context above get a ✅ note in place and move to the Resolved section; a "fixed" claim contradicted this round gets ⚠️ and stays open. New findings take the next unused F-N id across the whole page's history — never reuse one, not even a resolved one.

Content language: Chinese; code identifiers and paths stay as-is.

This round's triaged findings, per axis:
${JSON.stringify(axisResults.filter(Boolean), null, 2)}

Publish it: Artifact({file_path: "${PR_REVIEWS_DIR}/pr-${prNumber}-review.html", url: <resolved url if one existed>, favicon: "🔍", title: "PR #${prNumber} Review", description: "<one line: what still needs a decision>"}).

Return: the artifact URL, the round number used, this round's NEW findings (with ids), and \`openHighSeverityCount\` = CONFIRMED critical/high still open from **Correctness, Spec, and any Standards finding with \`fromTool: true\`** (a compiler error is not an opinion). Standards *judgement* findings are excluded — they never block.`,
  {
    phase: 'Publish',
    schema: {
      type: 'object',
      properties: {
        artifactUrl: { type: 'string' },
        round: { type: 'number' },
        findings: { type: 'array', items: { type: 'object' } },
        openHighSeverityCount: { type: 'number', description: 'Correctness + Spec only; Standards never blocks' },
      },
      required: ['artifactUrl', 'round', 'findings', 'openHighSeverityCount'],
    },
  },
)

return {
  prNumber,
  headRefName,
  baseRefName,
  round: published.round,
  artifactUrl: published.artifactUrl,
  findings: published.findings,
  // Correctness 没跑时，openHighSeverityCount 一律 null 而不是数字 ——
  // 调用方（pr-open-review / pr-fix-verify）拿 0 会当成「干净可合」，
  // 拿 null 才知道「这一轮没资格放行」。
  openHighSeverityCount: correctnessRan ? published.openHighSeverityCount : null,
  correctnessRan,
  correctnessFailure,
  axesRun: AXES.map((a) => a.key).filter((k) => byAxis[k] && byAxis[k].ran),
  axesSkipped: skipped,
}
