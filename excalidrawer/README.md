# excalidrawer

[中文](./README.zh.md) | **English**

Code-first Excalidraw diagram generation as a Claude Code plugin. Four skills, each owning one diagram type — the AI asks 2–3 load-bearing questions via AskUserQuestion, reads the skill's recipe (diagram-kind knowledge), composes elements with sugar shorthand, then calls the `excalidrawer-mcp` server's `render_diagram` tool to emit `.excalidraw` / `.svg` / `.png`.

**Target audience**: developers, researchers, and PMs who write docs, build slides, or paste diagrams into Feishu / Notion / GitHub. **Not for diagram designers** — output is hand-drawn (Excalidraw) style, suited to engineering docs, not commercial posters.

---

## The 4 skills

| Skill | Use case | Trigger keywords | Output |
|---|---|---|---|
| **flowchart** | Decision flows / process diagrams / branching logic | flowchart / 流程图 / decision tree / yes-no / branching / business flow / approval flow | `./flowchart-<name>.{excalidraw,svg,png}` |
| **timeline** | Timelines / roadmaps / project milestones | timeline / 时间线 / roadmap / milestone / 里程碑 / phase / Q1Q2 | `./timeline-<name>.{excalidraw,svg,png}` |
| **architecture** | System architecture / layered components / module topology | architecture / 架构图 / layering / 3-tier / microservices / data platform | `./architecture-<name>.{excalidraw,svg,png}` |
| **sequence** | Sequence diagrams / multi-actor interactions / call chains | sequence diagram / 时序图 / interaction / call order / handshake / OAuth | `./sequence-<name>.{excalidraw,svg,png}` |

Each SKILL.md's frontmatter `description` is stuffed with EN/CN trigger keywords — describing your need in natural language is enough to fire the right skill. Explicit `/flowchart` / `/timeline` / `/architecture` / `/sequence` also work.

---

## Install

The underlying MCP server is declared in `plugin.json` like this — all clients share the same config:

```json
"mcpServers": {
  "excalidrawer": {
    "command": "npx",
    "args": ["-y", "-p", "excalidrawer@^0.5.7", "-c", "excalidrawer-mcp"]
  }
}
```

`npx` auto-fetches the underlying `excalidrawer` npm package on first launch and caches it. To speed up cold start, install globally: `npm install -g excalidrawer` — the MCP server will prefer the global binary.

### Claude Code (CLI) ✅

https://github.com/user-attachments/assets/a8d136e9-3ade-4f2a-a7f9-f09abf54d7f2

```text
/plugin marketplace add guohaonan-shy/harold-skills
/plugin install excalidrawer
/reload-plugins
```

Works out of the box. The 4 skills show up in the `/` menu, and natural-language keywords trigger them automatically.

### Claude Desktop — Code / Cowork mode ✅

Both Code mode and Cowork mode ship with a terminal — installation is identical to the CLI flow:

```text
/plugin marketplace add guohaonan-shy/harold-skills
/plugin install excalidrawer
/reload-plugins
```

Note on Cowork mode: the plugin lives inside the VM, so it doesn't touch your host machine; the VM has network access, so `npx` package fetching works fine.

> Regular Chat mode **does not support plugins** — see the "manual integration" path below.

### Claude Chat / Claude Desktop Chat 🚧

Chat mode has no plugin loader, so MCP and skills have to be **wired up separately by hand**. The experience is incomplete right now.

**MCP server** — add it to the desktop config at `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "excalidrawer": {
      "command": "npx",
      "args": ["-y", "-p", "excalidrawer@^0.5.7", "-c", "excalidrawer-mcp"]
    }
  }
}
```

Fully quit and relaunch the desktop app — `render_diagram` and `compute_layout` will become callable.

**Skills** — Chat does not auto-load this repo's SKILL.md files. You'll have to manually copy each of the 4 skills' SKILL.md + `recipes/` contents into claude.ai → Settings → Capabilities → Skills and upload them one at a time.

**Known limitations (why this is 🚧)**:

- Skill trigger keywords / AskUserQuestion flow / recipe-read pipeline are not yet verified end-to-end in Chat mode
- Whether an uploaded custom skill correctly routes to MCP tools is still untested
- No one-shot script — the 4 skills must be uploaded individually

Short-term guidance: power users should stick to Claude Code (CLI) or Desktop Code/Cowork mode. Chat mode is only recommended for lightweight "MCP tool only, no skill" use cases.

### Codex 🚧

MCP / skill integration paths for Codex are not yet verified — TBD.

---

## What a single session looks like

```
1. cd ~/<your-project>/             # outputs land in cwd
2. "draw a user registration flowchart"  # natural-language trigger
   → flowchart skill activates
   → AskUserQuestion asks for scenario / decision points / direction
   → Read skills/flowchart/recipes/flowchart.md (diagram-kind knowledge)
   → compose sugar elements (+ compute_layout for chain x-coordinates)
   → call mcp__excalidrawer__render_diagram(elements, output)
   → write ./flowchart-user-registration.{excalidraw,svg,png}
3. Paste the .svg into Markdown or the .png into Notion / Feishu / slides
4. "split decision node X into Y and Z"
   → AI edits the sugar array, re-renders, filename stays the same → clean diff
```

---

## Directory layout

```
excalidrawer/
├── .claude-plugin/plugin.json
├── README.md                              # English (default, this file)
├── README.zh.md                           # Chinese
├── references/                            # plugin-wide shared
│   ├── conventions.md                     # clarify / naming / MCP fallback / language / routing
│   ├── sugar.md                           # sugar schema cheatsheet (shape / arrow L1-L4 / auto routing / helper)
│   └── colors.md                          # palette
└── skills/
    ├── flowchart/
    │   ├── SKILL.md
    │   └── recipes/flowchart.md           # diagram-kind patterns (nodes / back-edge / decision)
    ├── timeline/
    │   ├── SKILL.md
    │   └── recipes/timeline.md            # two axis/dot styles / text triplet / color cycle
    ├── architecture/
    │   ├── SKILL.md
    │   └── recipes/architecture.md        # single lane / multi-lane / column alignment / edge toggles
    └── sequence/
        ├── SKILL.md
        └── recipes/sequence.md            # actor + dashed lifeline / direction split / cross-lifeline labels
```

---

## Design notes

- **MCP-first**: `render_diagram` (sugar/raw → file) + `compute_layout` (geometry helper). CLI is the fallback when MCP is unavailable.
- **Sugar shorthand** (`references/sugar.md`): agents compose terse JSON directly; raw Excalidraw elements still pass through. No more hand-writing the full schema.
- **Recipe vs template**: diagram-kind opinions ("API Gateway is its own tier", "back-edges use vertical edge pairs") live in `skills/<name>/recipes/*.md`, read by the agent after clarification. Earlier versions baked these into engine templates — adding a variant meant editing the engine. Now a new variant = a new recipe; engine stays untouched.
- **AskUserQuestion is mandatory**: 1–3 load-bearing questions before drawing — cuts the cost of "drew it, then realized it needs to change."
- **gstack-style naming**: outputs use stable semantic names in cwd (`./<type>-<name>.{ext}`), not `outputs/<timestamp>/`. Downstream tools read by name.

---

## Decoupled from npm package version

This plugin's `version` (in `plugin.json`) tracks **plugin-content changes only** (SKILL.md / recipe rewrites, layout tweaks). The underlying npm package `excalidrawer` is versioned independently — the plugin pins its **minimum capability requirement** with a `^` range in `mcpServers.args`, and only re-pins when new capabilities are needed.

Current pin: `excalidrawer@^0.5.7` (sugar mode + auto-orthogonal routing + arrow style options + MCP server).

---

## Feedback

File issues at the [harold-skills repo](https://github.com/guohaonan-shy/harold-skills/issues).

Underlying npm package source: https://github.com/guohaonan-shy/excalidrawer (separate repo)

**Author**: Harold
