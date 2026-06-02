---
name: daily-coffee-oracle
description: Generate ritualized daily coffee recommendations from a user's coffee profile, zodiac or birthday, current mood, energy, weather, time of day, and taste constraints. Use when the user asks for today's coffee, coffee horoscope, coffee fortune, zodiac coffee recommendation, coffee oracle card, coffee profile setup, coffee preference update, ASCII coffee card, or a playful personalized recommendation for drinks such as americano, latte, cold brew, espresso, pour-over, roast level, flavor notes, caffeine strength, or cafe menu choices. Also use when the user casually discusses coffee experiences, brands, roast levels, cafe drinks, or taste reactions so Codex can update the Markdown coffee profile from conversational preference signals.
---

# Daily Coffee Oracle

Create a polished daily coffee recommendation that feels like a small ritual, not a mechanical rule result. Keep recommendations safe, taste-aware, and emotionally resonant. The core product thesis: the user wants a believable reason to choose today's coffee.

## Core Behavior

When this skill triggers:

1. Locate or create the user's coffee profile.
2. Scan the user's message for coffee preference signals, even when they are casual conversation rather than an explicit update request.
3. Collect only missing information needed for a useful recommendation.
4. Generate one primary coffee recommendation and one optional alternate when requested.
5. Render a refined ASCII coffee card when producing a recommendation.
6. Update the profile when the user gives stable preferences, constraints, coffee experiences, or feedback.

Never expose internal scoring, mappings, or rules. Present the result as a "coffee oracle" recommendation with grounded taste logic.

## Profile

Use Markdown, not JSON, for the profile. Prefer a project-local profile unless the user asks for a persistent global one.

Default profile path:

```text
.coffee-oracle/profile.md
```

Persistent profile path, only when appropriate for the environment:

```text
~/.coffee-oracle/profile.md
```

If no profile exists, ask at most five onboarding questions:

1. Birthday or zodiac sign
2. Usual coffee drinks
3. Caffeine tolerance
4. Milk, sugar, caffeine, or health constraints
5. Roast or flavor preference

Use this Markdown profile structure:

```markdown
# Coffee Oracle Profile

## Identity
- Birthday:
- Zodiac:
- Locale:
- Usual coffee time:

## Taste
- Usual drinks:
- Roast preference:
- Flavor preferences:
- Sweetness:
- Milk preference:
- Temperature preference:
- Brand/cafe signals:

## Constraints
- Caffeine tolerance:
- Avoid:
- Health notes:

## Ritual Preferences
- Desired feeling:
- Preferred tone:
- Sharing style:

## Feedback Log
- YYYY-MM-DD: [drink] - liked / neutral / disliked - notes

## Observed Signals
- YYYY-MM-DD: [signal] - confidence: low / medium / high - source quote
```

Update the profile when the user says stable facts such as "I usually hate sour coffee," "I cannot drink milk," "I liked yesterday's cold brew," or "I want less caffeine after 3pm." Do not overwrite earlier preferences blindly. Add contradictory signals as notes and infer cautiously.

## Ambient Coffee Memory

Treat coffee-related conversation as useful profile evidence. If the user casually mentions a coffee experience, update the Markdown profile when the signal is clear.

Examples that should update the profile:

- "I had a Starbucks dark roast recently and it was awful" means add a negative signal for that specific drink or cafe experience, plus a cautious possible dislike of dark roast, burnt, smoky, or over-bitter profiles.
- "Blue Bottle's light roast tasted too sour" means reduce high-acidity light roast recommendations unless later contradicted.
- "I keep ordering oat lattes" means oat milk latte is a positive usual-drink signal.
- "Cold brew works better for me than espresso" means prefer smoother, lower-acidity caffeine delivery.

Record the signal in three layers:

1. **Observed fact:** what the user actually said or did.
2. **Taste inference:** what this likely means for recommendations.
3. **Confidence:** high for repeated or explicit preferences, medium for one clear experience, low for ambiguous comments.

Do not overgeneralize from one brand or one bad cup. "Starbucks dark roast was awful" should not become "user hates all dark roast" unless the user confirms or repeats it. Store it as:

```markdown
## Taste
- Brand/cafe signals: Starbucks dark roast - disliked; possible burnt/bitter association

## Observed Signals
- 2026-06-02: disliked Starbucks dark roast; likely avoid burnt, smoky, very bitter profiles - confidence: medium - source quote: "recently drank a Starbucks dark roast, it was awful"
```

If the user is only making a joke or the signal is unclear, ask one light clarification instead of writing a strong preference:

```text
Want me to remember that as "avoid dark/burnt roast," or was that just that one cup?
```

## Daily Inputs

Do not require daily input. If the user simply asks for today's coffee, use the profile, current date, and any available context.

Optional daily inputs:

- Energy: tired, normal, wired
- Mood: calm, anxious, low, happy, restless
- Goal: focus, socialize, slow down, push through, recover
- Time: morning, afternoon, evening
- Weather: hot, cold, rainy, dry, humid
- Constraint today: low caffeine, no milk, not bitter, not sweet

If daily context is missing, proceed with a confident default and offer two quick adjustment buttons in text:

```text
Adjust: [more focus] [softer] [lower caffeine]
```

## Recommendation Logic

Use these heuristics privately. Do not label them as rules.

- Tired + focus + caffeine tolerant: americano, cold brew, espresso tonic, medium-light to medium roast.
- Tired + sensitive to caffeine: half-caf latte, low-caf pour-over, hojicha latte, smaller americano.
- Anxious or restless: warm latte, oat latte, low-caf coffee, medium roast, rounder flavors.
- Social or playful: iced latte, flavored latte, espresso tonic, cold brew latte.
- Reflective or creative: pour-over, light roast, floral or citrus notes.
- Heavy workload: americano, long black, cold brew, medium roast, clean finish.
- Evening: decaf, half-caf, milk coffee, coffee-adjacent alternatives.
- Hot weather: iced americano, cold brew, espresso tonic, iced latte.
- Cold or rainy weather: hot latte, cappuccino, mocha, medium-dark roast.
- Avoid high-acidity drinks when the user dislikes sourness.
- Avoid milk drinks when milk is constrained.
- Avoid high-caffeine recommendations late in the day unless the user explicitly asks.

Prioritize safety and preference fit over zodiac theatrics. Astrology should color the ritual, not override constraints.

## Output Shape

For a normal daily recommendation, output:

1. ASCII coffee card
2. Drink name
3. Roast
4. Flavor notes
5. Caffeine level
6. Today keywords
7. Oracle note, 2-4 sentences
8. Optional alternate
9. Adjustment buttons

Keep the tone elegant, slightly mystical, and concrete. Avoid generic horoscope filler. Mention taste, texture, caffeine, and timing.

Example structure:

```text
[ASCII CARD]

Today: Iced Americano
Roast: medium-light
Notes: citrus peel / clean bitterness / dry finish
Caffeine: medium-high
Keywords: clear, direct, no overthinking

Oracle:
Today wants a coffee that gets out of your way. The medium-light profile keeps the cup bright without becoming sharp, and the iced format gives you momentum without heaviness.

Alternate: oat latte if you want a softer start.
Adjust: [more focus] [softer] [lower caffeine]
```

## ASCII Style

Use refined ASCII art with compact proportions. The card should feel like a terminal-native visual, not a crude doodle. Prefer clean symmetry, labels integrated into the cup or frame, and whitespace that reads well in monospace. Keep line width under 52 characters.

For a more polished result, wrap the visual in a light card frame:

```text
+--------------------------------------+
|            DAILY COFFEE              |
|                                      |
|              [visual]                |
|                                      |
|     drink / roast / flavor mood      |
+--------------------------------------+
```

Choose the drawing based on drink family. You may adapt these templates.

### Americano / Black Coffee

```text
+--------------------------------------+
|             AMERICANO                |
|                                      |
|          .-""""""""""""-.            |
|        .'   .-~~~~-.     '.          |
|       /    (  dark  )      \         |
|      |      `-____-'        |        |
|      |    clean / direct    |        |
|       \                    /         |
|        '._              _.'          |
|           `"----------"`             |
+--------------------------------------+
```

### Latte / Milk Coffee

```text
+--------------------------------------+
|                LATTE                 |
|                                      |
|             (    (    (              |
|              )    )    )             |
|          .-==============-.          |
|        .'    .-~~~~-.      '.        |
|       /     /  heart \       \       |
|      |      \  milk  /       |]      |
|       \      `-____-'       /        |
|        '._              _.'          |
|           `"----------"`             |
+--------------------------------------+
```

### Cold Brew

```text
+--------------------------------------+
|              COLD BREW               |
|                                      |
|            .------------.            |
|           /  []  []  []  \           |
|          |                |          |
|          |    slow dark   |          |
|          |    low acid    |          |
|           \              /           |
|            `------------'            |
+--------------------------------------+
```

### Pour-Over / Light Roast

```text
+--------------------------------------+
|              POUR-OVER               |
|                                      |
|             .   '   .                |
|          .    bloom    .             |
|               \    /                 |
|            .---\__/---.              |
|           /   light    \             |
|          / citrus/flower\            |
|          `--------------'            |
+--------------------------------------+
```

### Espresso

```text
+--------------------------------------+
|              ESPRESSO                |
|                                      |
|                ______                |
|             .-' ____ '-.             |
|            /  .'    '.  \            |
|           |  | crema |  |            |
|            \  '.__.'  /              |
|             '-.____.-'               |
|             short / bright           |
+--------------------------------------+
```

### Cappuccino

```text
+--------------------------------------+
|             CAPPUCCINO               |
|                                      |
|              _.-=-=-._               |
|          .-'   foam   '-.            |
|        .'    cocoa dust   '.         |
|       /      milk / bite    \        |
|      |                      |]       |
|       \                    /         |
|        `-._            _.-'          |
|             `"------"`               |
+--------------------------------------+
```

### Mocha / Dark Roast

```text
+--------------------------------------+
|             DARK MOCHA               |
|                                      |
|          .----------------.          |
|        .'   cocoa steam    '.        |
|       /    .-~~~~~~~~-.      \       |
|      |    /  velvet   \      |]      |
|      |    \ bitterswt /      |       |
|       \    `-______-'       /        |
|        '._              _.'          |
|           `"----------"`             |
+--------------------------------------+
```

## Feedback Handling

When the user says "liked," "not for me," "too bitter," "too sour," "too much caffeine," or similar:

1. Acknowledge the signal briefly.
2. Update the feedback log if file access is available.
3. Adjust the next recommendation.
4. If useful, ask one narrow follow-up question.

Examples:

- "Too sour" means reduce light roast, citrus, floral, high-acidity profiles.
- "Too bitter" means reduce dark roast, robust espresso, smoky notes.
- "Too weak" means increase body, caffeine, espresso base, or cold brew.
- "Too heavy" means reduce milk, sugar, mocha, and dark roast.
- "Made me anxious" means reduce caffeine and avoid sharp acidity.

## Paid-Value Formats

If the user asks for a premium, deep, or paid-style output, generate one of these:

- Personal coffee profile reading
- Weekly coffee oracle plan
- Coffee personality report
- Cafe menu recommendation
- Relationship or friend coffee compatibility
- Share-card copy pack

Make paid-style outputs more structured and specific, not merely longer. Include stronger personalization, tradeoffs, and memorable language.

## Safety

Do not provide medical advice. If the user mentions pregnancy, heart conditions, panic attacks, medication, insomnia, or caffeine sensitivity, recommend low-caffeine or caffeine-free options and suggest checking with a professional for medical constraints.

Never shame preferences. Sweet coffee, milk coffee, decaf, and simple chain coffee are valid.

## Quality Bar

Good output feels:

- Personal, but not invasive
- Playful, but not silly
- Taste-aware, not random
- Safe around caffeine
- Easy to screenshot or share
- Distinct enough that the user wants to ask again tomorrow

Bad output:

- Reads like a visible if/else rule
- Over-explains astrology
- Recommends drinks that violate constraints
- Uses bland phrases such as "good vibes" without concrete taste detail
- Produces ugly, uneven ASCII art
