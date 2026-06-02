# harold-skills

Harold 的个人 Claude Code skills 集合，按 **Claude Code marketplace** 组织为多个可独立安装的 plugin。

Default English version: [README.md](./README.md)

## 这里有什么

| Plugin | 用途 | 状态 |
|---|---|---|
| [`clinical-research/`](./clinical-research/) | 临床医学回顾性队列研究工作流：研究设计、变量编码、统计分析、论文初稿。 | Ready |
| [`excalidrawer/`](./excalidrawer/) | Code-first Excalidraw 图表生成：流程图、时间线、架构图、序列图。 | Ready |
| [`memex/`](./memex/) | 从对话构建个人记忆 wiki，支持 ingest、recap、recall、memory 维护和 reply coaching。 | Ready |
| [`content-creator/`](./content-creator/) | 面向短视频 / 社交 feed 创作者的内容工具集，当前包含 `thumbnail-gen`。 | Ready |
| [`happy-life/`](./happy-life/) | 面向日常仪式感和个人 taste memory 的生活类 skills，当前包含 `daily-coffee-oracle`。 | Ready |

更多 plugin 会陆续加入。

## 安装

```text
/plugin marketplace add guohaonan-shy/harold-skills
/plugin install <plugin-name>@harold-skills
/reload-plugins
```

例如：

```text
/plugin install clinical-research@harold-skills
/plugin install excalidrawer@harold-skills
/plugin install memex@harold-skills
/plugin install content-creator@harold-skills
/plugin install happy-life@harold-skills
```

## 仓库结构

```text
harold-skills/
├── .claude-plugin/
│   └── marketplace.json      # marketplace metadata
├── CLAUDE.md                 # 仓库级维护约定
├── README.md                 # 默认英文 README
├── README.zh-CN.md           # 中文 README
└── <plugin-name>/            # 每个顶层目录是一个 plugin
    ├── .claude-plugin/
    │   └── plugin.json
    ├── README.md             # plugin 介绍、安装说明、用法示例
    ├── references/           # plugin 级共享参考，可选
    └── skills/
        └── <skill-name>/
            ├── SKILL.md
            └── references/   # skill 自己的深度参考，可选
```

`references/` 的布局是灵活的。有些 plugin 只使用 plugin 级 references，有些会同时保留 plugin 级和 skill 级 references。

每个 plugin 都可以独立安装。仓库维护约定见 [CLAUDE.md](./CLAUDE.md)。

## License

MIT
