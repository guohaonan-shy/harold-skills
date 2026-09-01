# Heuristics checklist — structured usability scoring for Gate 2

Three independent scoring passes to run over the rendered preview at `design-ui` Gate 2 (and again
at `design-motion` Gate 2 for anything usability-relevant that motion touches). Each pass answers a
different question; running only one misses what the others catch.

## 1. Nielsen's 10 usability heuristics — score 0–4 per heuristic

Score each heuristic against the actual rendered surface, not the concept. A dimension under 3/4 is
a finding, not a footnote — name it, route it back to the owning stage (composition issue → W,
concept issue → B, craft issue → F).

| # | Heuristic | Check for |
|---|---|---|
| 1 | Visibility of system status | Is there a loading indicator for any async action? Does the UI confirm an action completed? |
| 2 | Match between system and the real world | Does terminology match the user's domain language, not internal system names? |
| 3 | User control and freedom | Is there an undo/cancel/back path out of every flow, especially destructive ones? |
| 4 | Consistency and standards | Do same-meaning controls look the same everywhere in this surface (and match sibling surfaces)? |
| 5 | Error prevention | Does the design prevent the error before it happens (constrained inputs, disabled invalid actions) rather than only catching it after? |
| 6 | Recognition rather than recall | Are options/actions visible in context, or does the user have to remember something from an earlier screen? |
| 7 | Flexibility and efficiency of use | Does a repeat/expert user have a faster path (shortcuts, bulk actions) without the novice path being removed? |
| 8 | Aesthetic and minimalist design | Is every element carrying real signal, or is something present "because it looks nice"? |
| 9 | Help users recognize, diagnose, and recover from errors | Does an error message state what happened, why, and how to fix it (three-part formula, design-core.md §5.6)? |
| 10 | Help and documentation | For a genuinely non-obvious action, is help discoverable in context rather than requiring an external doc? |

**Severity mapping for findings**: P0 = blocks the primary task or causes data loss; P1 = causes
confusion or a wrong action but is recoverable; P2 = friction, not confusion; P3 = polish-only.

## 2. Cognitive load checklist

Three load types, checked independently — a surface can pass one and fail another:

- **Intrinsic load** (the task's own inherent difficulty) — is the UI adding *extra* difficulty on
  top of the task's real complexity (unnecessary steps, indirection)?
- **Extraneous load** (load caused by bad presentation, not the task) — inconsistent layout,
  unclear labels, competing visual signals that force the user to work out what matters.
- **Germane load** (effort that actually builds the user's understanding) — the only load type that
  should ever be added deliberately; extraneous load should be removed, not "balanced."

Eight-item checklist:

1. Working-memory ceiling: no more than **4** simultaneous unrelated things the user must hold in
   mind to complete one step.
2. Every visible control has an obvious purpose without hovering/clicking to find out.
3. Related information is visually grouped; unrelated information is visually separated.
4. The primary action is unambiguous at every step (see design-core.md's squint test).
5. Error states explain themselves without requiring the user to reconstruct what went wrong.
6. Progressive disclosure hides advanced/rare options behind a clear affordance, not upfront.
7. The user is never asked to remember a value from a previous screen that the system already has.
8. Terminology is consistent across the whole flow, not renamed screen-to-screen.

**Eight named violation patterns** (use these as diagnosis labels, not just "confusing"):

- **Wall of Options** — too many undifferentiated choices presented flat, with no grouping/default.
- **Memory Bridge** — the user must remember something from an earlier screen with no visible
  reminder.
- **Silent State** — a state change happened with no visible confirmation.
- **Buried Primary** — the main action is visually subordinate to a secondary one.
- **Terminology Drift** — the same concept named differently across screens.
- **Modeless Ambiguity** — it isn't visually clear which mode/context the user is currently in.
- **Recall-not-Recognition** — the user must type/remember instead of picking from what's shown.
- **Undifferentiated Density** — everything rendered at the same visual weight, nothing to anchor on.

## 3. Five-persona red-flag test

Read the surface through five lenses; each carries a distinct failure mode a single "does this
look good" pass won't catch. Pick the personas relevant to the interface type (not all five apply
to every surface — a public marketing page cares less about Sam/Riley than a dense in-app tool
does).

| Persona | Cares about | Test question | Red flag |
|---|---|---|---|
| **Alex** (first-time visitor) | Can I tell what this is and what to do first? | "What is this page for, in one glance?" | No clear entry point within 3 seconds of looking |
| **Jordan** (returning power user) | Can I do the thing fast without re-learning? | "Where's the shortcut for what I do every day?" | Every action requires the same number of clicks as a first-time user's |
| **Sam** (screen-reader / keyboard-only user) | Can I reach and operate everything without a mouse? | "Can I tab to this control and know what it does from its accessible name alone?" | A control with no accessible name, or unreachable by keyboard |
| **Riley** (small/older device, poor connection) | Does this still work when the network/device is worse than mine? | "What does this look like at 360px on a throttled connection?" | Layout breaks, or the page is unusable until a heavy asset finishes loading |
| **Casey** (anxious/high-stakes user — money, deletion, privacy) | Am I safe from an accidental irreversible action? | "What happens if I misclick here?" | A destructive/high-stakes action with no confirmation or undo |

**Interface-type → persona selection**: dense in-app tools weight Jordan + Sam heavily; public
marketing pages weight Alex + Riley; anything touching payment/deletion/account access always
includes Casey regardless of surface type.
