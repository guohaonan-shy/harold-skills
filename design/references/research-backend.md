# Research backend — routing to Refero's three layers

**Load when:** `design-ui` stage C has a named question the concept can't answer on its own (see
`skills/design-ui/SKILL.md` §C). This file is the routing contract only — which of Refero's three
research layers answers which kind of question. Tool mechanics (parameters, batch limits, platform
filters) live in the `refero-design` skill's own `references/mcp-tools.md`; don't restate them
here, they'd rot out of sync.

## The three layers

| Named question is about… | Layer | Refero call |
|---|---|---|
| Visual direction — taste, aesthetic family, palette/type mood | Styles | `refero_search_styles` |
| A concrete UI pattern — how a specific component or screen is structured | Screens | `refero_search_screens` (+ `refero_get_screen`, `refero_get_similar_screens`) |
| A multi-step flow — how a user moves across connected screens to complete a task | Flows | `refero_search_flows` (+ `refero_get_flow`) |

Pick the layer that matches the *question*, not the altitude of the work — a Component-altitude
run can still need Flows if the named question is "what happens after this action, across
screens," and a Surface-altitude run can stay at Styles if the only open question is visual
direction.

## Caveats that change which layer to reach for

- Styles doesn't currently cover in-app dashboards, auth screens, settings screens, or iOS app
  screens as style systems — for those, go straight to Screens/Flows even for a visual-direction
  question.
- Even for product UI, use Styles first to establish taste, then Screens/Flows for
  product-specific structural logic — don't skip Styles just because the surface is in-app.
- User-provided sources always outrank a Refero search; Refero is a fallback candidate search, not
  ground truth (`design-ui` stage C, `platform: "web"`).

## Provenance

Refero's three-layer research backend is a live dependency of this plugin, not a one-time
inspiration source — naming it here and in `design-ui`'s stage C is the intended coupling. This
file exists only to keep the routing decision (which layer for which question) visible in prose
next to `design-ui`, per this plugin's convention of naming referenced files explicitly rather than
pointing at a directory.
