export const meta = {
  name: 'wireframe-candidates',
  description: 'Generate structurally distinct gray-box wireframe candidates for a surface, then audit that they are genuinely different',
  whenToUse:
    'Called by the /design skill after project truth is loaded and clarification is done, to produce the candidate set a human selects from. Not a standalone entry: it takes an already-assembled brief and returns candidates; it never talks to the user.',
  phases: [
    { title: 'Generate', detail: 'independent candidates, one per structural thesis' },
    { title: 'Audit', detail: 'divergence check plus per-candidate adversarial read' },
  ],
}

// args: {
//   scope, pageType, productTruth, contentInventory, proofInventory,
//   designLanguage, constraints, knowledge, missingInputs
// }
const brief = args || {}

const required = ['scope', 'productTruth']
const missing = required.filter((k) => !brief[k])
if (missing.length) {
  return {
    error: `brief is missing required fields: ${missing.join(', ')}`,
    hint: 'The /design skill must load project truth and finish clarification before calling this workflow.',
  }
}

// Each thesis is a different BET about which content carries the page, not a
// different layout. Layout is the consequence; the bet is what the human picks.
const THESES = [
  {
    key: 'proof-first',
    bet: '最强的真实证据（产品 UI、结果、客户材料）足以自己说话，主张让位给它',
    forces: '把可核验内容放到视觉重心，主张压缩成一句；风险是缺少认知锚点，读者不知道在看什么',
  },
  {
    key: 'claim-first',
    bet: '需要先建立认知框架，读者才看得懂证据；主张与解释先行，证明紧随偿还',
    forces: '主张占据重心，证据必须在相邻位置立刻偿还；风险是偿还不及时就变成空话',
  },
  {
    key: 'object-walk',
    bet: '产品对象本身的工作流就是最好的结构，让同一个对象贯穿全页',
    forces: '章节顺序由对象状态推进决定，而非由营销漏斗决定；风险是对象不够具体时结构会散',
  },
]

const CANDIDATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['thesis', 'bet', 'blocks', 'responsibilityMap', 'tradeoffs', 'invalidatedBy', 'requiresInputs'],
  properties: {
    thesis: { type: 'string', description: 'thesis key this candidate was generated from' },
    bet: { type: 'string', description: 'one sentence: what content strength this candidate is betting on' },
    blocks: {
      type: 'array',
      description: 'ordered gray-box blocks, desktop reading order',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'job', 'slots', 'why_here'],
        properties: {
          name: { type: 'string' },
          job: { type: 'string', description: 'the single responsibility of this block' },
          slots: {
            type: 'array',
            items: { type: 'string' },
            description: 'content slots with real/empty/unknown marked, e.g. "claim (real)", "trust (empty)"',
          },
          why_here: { type: 'string', description: 'why this block sits at this position, in terms of the bet' },
        },
      },
    },
    responsibilityMap: {
      type: 'object',
      additionalProperties: false,
      required: ['carriesClaim', 'carriesProof', 'carriesIdentity', 'firstConversion'],
      properties: {
        carriesClaim: { type: 'string' },
        carriesProof: { type: 'string' },
        carriesIdentity: { type: 'string' },
        firstConversion: { type: 'string' },
      },
    },
    mobileReorder: { type: 'string', description: 'how the order changes on mobile and why, or why it does not' },
    tradeoffs: { type: 'string', description: 'what this candidate gives up relative to the others' },
    invalidatedBy: { type: 'string', description: 'the observation that would make this candidate the wrong choice' },
    requiresInputs: {
      type: 'array',
      items: { type: 'string' },
      description: 'inputs that must exist for this candidate to work; mark ones currently missing',
    },
  },
}

const AUDIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['structurallyDistinct', 'collapsedPairs', 'weakest', 'notes'],
  properties: {
    structurallyDistinct: {
      type: 'boolean',
      description: 'true only if every pair differs in responsibility assignment or block order, not just framing',
    },
    collapsedPairs: {
      type: 'array',
      items: { type: 'string' },
      description: 'pairs that are the same structure in different words, e.g. "proof-first / object-walk"',
    },
    weakest: { type: 'string', description: 'which candidate rests on the thinnest real input, and why' },
    notes: { type: 'string' },
  },
}

const context = `
## Scope
${brief.scope}

## Page type / surface
${brief.pageType || '(not classified)'}

## Product truth
${brief.productTruth}

## Content inventory
${brief.contentInventory || '(none supplied)'}

## Proof inventory
${brief.proofInventory || '(none supplied)'}

## Design language (from the target project's DESIGN.md)
${brief.designLanguage || '(no DESIGN.md found — gray-box only, no visual decisions)'}

## Constraints
${brief.constraints || '(none stated)'}

## Approved design-lib knowledge
${brief.knowledge || '(none — allow-list empty or library unreachable; work from first principles and label assumptions)'}

## Known missing inputs
${brief.missingInputs || '(none recorded)'}
`.trim()

const RULES = `
Hard rules for a gray-box wireframe candidate:

1. GRAY BOX ONLY. No color, typeface, imagery, or visual treatment decisions. The
   human is selecting a structure, not a look. Naming a visual style is a failure.
2. NO INVENTED CONTENT. Every slot is marked (real) when the inventory shows a real
   input, (empty) when it is confirmed absent, or (unknown) when nobody has said.
   Never fabricate customer logos, metrics, security claims, pricing entitlements,
   or product UI that does not exist. A block whose only content is unknown must be
   declared as such, not filled in.
3. ONE JOB PER BLOCK. If a block needs "and" to describe its job, split it.
4. THE BET IS THE POINT. Every ordering decision must trace back to the thesis you
   were given. "It looks better this way" is not a reason.
5. STATE WHAT KILLS IT. invalidatedBy must be a concrete observation about the
   product or content, not a hedge.
`.trim()

phase('Generate')
log(`generating ${THESES.length} independent candidates for: ${brief.scope}`)

const candidates = await parallel(
  THESES.map((t) => () =>
    agent(
      `You are producing ONE gray-box wireframe candidate for the surface described below.

Your assigned thesis — this is a BET about which content carries the page, and every
structural decision you make must follow from it:

  ${t.key}: ${t.bet}
  What it forces: ${t.forces}

Commit to this bet fully. Do not hedge toward the other possible structures; another
agent is arguing those independently, and the human needs genuinely different options
to choose between. If the supplied content makes this bet unworkable, say so inside
"tradeoffs" and "invalidatedBy" rather than quietly drifting to a safer structure.

${RULES}

${context}`,
      { label: `candidate:${t.key}`, phase: 'Generate', schema: CANDIDATE_SCHEMA },
    ),
  ),
)

const built = candidates.filter(Boolean)

if (!built.length) {
  return { error: 'no candidate survived generation', candidates: [] }
}
if (built.length < THESES.length) {
  log(`WARNING: only ${built.length}/${THESES.length} candidates generated; the rest failed`)
}

phase('Audit')

const summary = built
  .map(
    (c) =>
      `### ${c.thesis}\nBet: ${c.bet}\nOrder: ${c.blocks.map((b) => b.name).join(' → ')}\nClaim: ${c.responsibilityMap.carriesClaim}\nProof: ${c.responsibilityMap.carriesProof}\nIdentity: ${c.responsibilityMap.carriesIdentity}\nFirst conversion: ${c.responsibilityMap.firstConversion}`,
  )
  .join('\n\n')

const audit = await agent(
  `Below are wireframe candidates produced independently for the same surface.

Your job is to detect FAKE VARIETY. Candidates count as structurally distinct only if
they differ in who carries which responsibility, or in block order that changes what a
reader meets first. Two candidates that shuffle framing while assigning the same
content to the same positions are the SAME candidate and must be reported as collapsed.

Default to reporting collapse when uncertain. A human is about to spend real review
time on these; presenting three options that are secretly one wastes it.

Also name the candidate resting on the thinnest real input — the one most dependent on
slots currently marked (unknown) or (empty).

${summary}`,
  { label: 'audit:divergence', phase: 'Audit', schema: AUDIT_SCHEMA },
)

return {
  scope: brief.scope,
  candidates: built,
  audit: audit || { structurallyDistinct: false, collapsedPairs: [], weakest: '', notes: 'audit agent failed' },
  gate: 'HUMAN_SELECTION_REQUIRED',
}
