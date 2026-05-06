# harold-skills

Harold's personal collection of Claude Code skills, organized as a **Claude Code marketplace** of independently installable plugins.

## What's here

| Plugin | Purpose | Status |
|---|---|---|
| [`clinical-research/`](./clinical-research/) | 临床医学回顾性队列研究工作流（study-design / variable-coding / stat-analysis / paper-draft）| ✅ Ready |

更多 plugin 会陆续迁过来。

## Install

```text
/plugin marketplace add guohaonan-shy/harold-skills    # 加入 marketplace
/plugin install <plugin-name>                          # 装某个 plugin
/reload-plugins                                        # 让 skill 生效
```

例如装 `clinical-research`：

```text
/plugin install clinical-research
```

## Repository structure

```
harold-skills/
├── .claude-plugin/
│   └── marketplace.json     # marketplace metadata
├── CLAUDE.md                 # 仓库级维护约定
├── README.md                 # 本文件
└── <plugin-name>/            # 每个目录 = 一个 plugin
    ├── .claude-plugin/plugin.json
    ├── README.md
    ├── references/           # plugin 内跨 skill 共享约定
    └── skills/
        └── <skill-name>/
            ├── SKILL.md
            └── references/   # skill 自己的深度参考
```

每个 plugin 独立可装。维护约定见 [CLAUDE.md](./CLAUDE.md)。

## License

MIT
