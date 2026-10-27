---
type: spec
status: 完成
tags: [idea-loop, retro, skill-length]
summary: retro 的 SKILL.md 主体按字符数约 3200 字，没超 5000：验证为不存在，原数是按字节数的
related: []
issues: [124]
---

# retro：SKILL.md 主体超过 5000 字的上限

## 验证

| issue | 结论 | 证据 |
|---|---|---|
| #124 | 不存在 | issue 里的 6678 是在 C locale 下跑 `wc -m` 得到的：Claude Code 的 shell 里 `LANG`、`LC_ALL` 都是空的，`wc -m` 这时数的是字节，一个汉字算 3 个。2026-10-27 对着 `origin/main 8491043` 量 `idea-loop/skills/productivity/retro/SKILL.md`：C locale 下 `wc -m` 得 6678，跟 issue 一致；`LC_ALL=en_US.UTF-8 wc -m` 得 3270，Python `len()` 也是 3270；去掉 frontmatter 后主体 3176 字，离仓库 `AGENTS.md`「SKILL.md 主体保持精简（< 5000 字）」的上限还差约 1800 字。所以不用精简。量法没写明、误报会重复出现，这件事由 #132 管。 |

## 关联

- 覆盖的 issue：#124 idea-loop retro：SKILL.md 主体超过 5000 字的上限
- 同一个误报：#93 idea-loop dreaming：SKILL.md 主体超过 5000 字的上限（它的会话也验证为不存在，spec `dreaming-skill-length` 还没合进主分支）
- 根因：#132 SKILL.md「主体 < 5000 字」没写怎么量，wc -m 在 C locale 下数的是字节，误报超长。它要改规则写法或加检查；本 spec 不重叠，不分先后
- 相邻：#125 design-archive 的 SKILL.md 主体约 2.1 万字。按字符数量全文仍有 11494 字（C locale 下 `wc -m` 是 21626），是真超长，跟本 issue 无关
