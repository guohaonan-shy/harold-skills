# harold-skills

Harold's personal collection of Claude Code skills, organized as a **Claude Code marketplace** of independently installable plugins.

中文版本: [README.zh-CN.md](./README.zh-CN.md)

## What's here

| Plugin | Purpose | Status |
|---|---|---|
| [`excalidrawer/`](./excalidrawer/) | Code-first Excalidraw diagram generation for flowcharts, timelines, architecture diagrams, and sequences. | Ready |
| [`content-creator/`](./content-creator/) | Content creation toolkit for short-video and social-feed creators. Currently ships `thumbnail-gen`. | Ready |
| [`happy-life/`](./happy-life/) | Personal lifestyle skills for daily rituals and taste memory. Currently ships `daily-coffee-oracle`. | Ready |
| [`idea-loop/`](./idea-loop/) | Closed loop from idea to shipped engineering — design-tree interview → spec → [design diverge → design converge] → tracer-bullet tickets → TDD implementation → three-axis PR review (Correctness / Standards / Spec) → knowledge-base reconciliation. The bracketed design pair comes from the `design` plugin and runs only when it is installed and the spec touches UI. Generalized out of a real project, reads the target repo's own conventions rather than hardcoding them. Depends on `excalidrawer`. | Ready |
| [`design/`](./design/) | UI design for idea-loop projects: research, diverge, refine to a freeze, measure the implementation against the frozen canvas, the design archive and `DESIGN.md`. Depends on `idea-loop`. | Ready |
| [`seo/`](./seo/) | SEO for idea-loop projects: OpenSEO-backed research, a weekly scan that files issues, briefs, writing, outreach, a pre-publish check. Depends on `idea-loop`. | Ready |

More plugins may be added over time.

## Install

```text
/plugin marketplace add guohaonan-shy/harold-skills
/plugin install <plugin-name>@harold-skills
/reload-plugins
```

Examples:

```text
/plugin install excalidrawer@harold-skills
/plugin install content-creator@harold-skills
/plugin install happy-life@harold-skills
/plugin install idea-loop@harold-skills
/plugin install design@harold-skills   # optional, installs idea-loop too
/plugin install seo@harold-skills      # optional, installs idea-loop too
```

## Repository Structure

```text
harold-skills/
├── .claude-plugin/
│   └── marketplace.json      # marketplace metadata
├── AGENTS.md                 # repository maintenance conventions (CLAUDE.md imports it)
├── README.md                 # default English README
├── README.zh-CN.md           # Chinese README
└── <plugin-name>/            # each top-level directory is one plugin
    ├── .claude-plugin/
    │   └── plugin.json
    ├── README.md             # plugin introduction, install notes, usage examples
    ├── references/           # plugin-level shared references, optional
    ├── workflows/            # optional — Workflow-tool scripts (.mjs), e.g. idea-loop's PR review loop
    ├── evals/                # optional — a pinned baseline eval (only idea-loop and design have one)
    └── skills/
        └── <skill-name>/
            ├── SKILL.md
            └── references/   # skill-specific deep references, optional
```

`references/` is flexible. Some plugins use only plugin-level references, while others keep both plugin-level and skill-level references when the material is skill-specific.

Each plugin is independently installable. See [AGENTS.md](./AGENTS.md) for repository maintenance conventions.

## License

MIT
