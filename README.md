# harold-skills

Harold's personal collection of Claude Code skills, organized as a **Claude Code marketplace** of independently installable plugins.

中文版本: [README.zh-CN.md](./README.zh-CN.md)

## What's here

| Plugin | Purpose | Status |
|---|---|---|
| [`clinical-research/`](./clinical-research/) | Retrospective clinical research workflows: study design, variable coding, statistical analysis, and paper drafting. | Ready |
| [`excalidrawer/`](./excalidrawer/) | Code-first Excalidraw diagram generation for flowcharts, timelines, architecture diagrams, and sequences. | Ready |
| [`memex/`](./memex/) | Personal memory wiki from conversations, with ingestion, recap, recall, memory maintenance, and reply coaching. | Ready |
| [`content-creator/`](./content-creator/) | Content creation toolkit for short-video and social-feed creators. Currently ships `thumbnail-gen`. | Ready |
| [`happy-life/`](./happy-life/) | Personal lifestyle skills for daily rituals and taste memory. Currently ships `daily-coffee-oracle`. | Ready |
| [`idea-loop/`](./idea-loop/) | Closed loop from idea to shipped engineering — design-tree interview → spec → tracer-bullet tickets → TDD implementation → three-axis PR review (Correctness / Standards / Spec) → knowledge-base reconciliation. Generalized out of a real project, reads the target repo's own conventions rather than hardcoding them. | Ready |

More plugins may be added over time.

## Install

```text
/plugin marketplace add guohaonan-shy/harold-skills
/plugin install <plugin-name>@harold-skills
/reload-plugins
```

Examples:

```text
/plugin install clinical-research@harold-skills
/plugin install excalidrawer@harold-skills
/plugin install memex@harold-skills
/plugin install content-creator@harold-skills
/plugin install happy-life@harold-skills
/plugin install idea-loop@harold-skills
```

## Repository Structure

```text
harold-skills/
├── .claude-plugin/
│   └── marketplace.json      # marketplace metadata
├── CLAUDE.md                 # repository maintenance conventions
├── README.md                 # default English README
├── README.zh-CN.md           # Chinese README
└── <plugin-name>/            # each top-level directory is one plugin
    ├── .claude-plugin/
    │   └── plugin.json
    ├── README.md             # plugin introduction, install notes, usage examples
    ├── references/           # plugin-level shared references, optional
    ├── workflows/            # optional — Workflow-tool scripts (.mjs), e.g. idea-loop's PR review loop
    └── skills/
        └── <skill-name>/
            ├── SKILL.md
            └── references/   # skill-specific deep references, optional
```

`references/` is flexible. Some plugins use only plugin-level references, while others keep both plugin-level and skill-level references when the material is skill-specific.

Each plugin is independently installable. See [CLAUDE.md](./CLAUDE.md) for repository maintenance conventions.

## License

MIT
