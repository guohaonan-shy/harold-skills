# Review

## 验证命令

写代码时常跑前两条，提交前跑全量；review 时每一条都跑一遍。

| 用途 | 命令 |
|---|---|
| 类型检查 | 无（纯 `.mjs`，没有类型检查） |
| 单个测试文件 | `node --test <文件>` |
| 全量测试 | `node --test '*/scripts/*.test.mjs'` |
| lint | 无 |

## 额外要求

- 改了某个 plugin 的 skill、agent、hook、脚本或产物位置，同一个改动里同步它自己的 `README.md`（`AGENTS.md` 的约定）。
- `SKILL.md` 的 frontmatter description 只做路由，主体 < 5000 字，`allowed-tools` 收窄到具体命令模式（`AGENTS.md`「SKILL.md 编写约定」）。
- 写进 idea-loop 的规则不硬编码 Toeflair（`idea-loop/scripts/no-project-leak.test.mjs` 守着）。
