---
type: spec
status: 完成
tags: [idea-loop, dreaming, skill-writing]
summary: dreaming 的 SKILL.md 主体超 5000 字：验证为不存在，issue 量到的是字节数，按字符数是 3525
related: []
issues: [93]
---

# dreaming：SKILL.md 主体超过 5000 字的上限

## 验证

| issue | 结论 | 证据 |
|---|---|---|
| #93 | 不存在 | issue 里的「约 6500 字」是字节数，不是字数。issue 用的 `wc -m` 在没设 UTF-8 locale 的 shell 里（`LANG`、`LC_ALL` 都为空）按字节数，一个汉字算 3 个：同一份文件，C locale 下 `wc -m` 得 6712，`LC_ALL=en_US.UTF-8 wc -m` 得 3645。规则原文是 `AGENTS.md`「SKILL.md 主体保持精简（< 5000 字）」和 `REVIEW.md`「主体 < 5000 字」，没有一种说得通的「字」的读法会超：去掉 frontmatter 后主体按字符数 3525，按「汉字 + 英文词」数约 1420，整份文件 50 行。issue 开出时那一版（PR #90 合并的 `f5c569d`）同样量：字节 6530、字符 3519，当时也没超。2026-10-27 对着 `origin/main 8491043`，用 Python 按 UTF-8 读文件、去掉 frontmatter 后数字符核的，全仓 45 份 SKILL.md 一起量了做对照。 |

## 关联

- 覆盖的 issue：#93 idea-loop dreaming：SKILL.md 主体超过 5000 字的上限
- 同一个量法开出的：#124 idea-loop retro：SKILL.md 主体超过 5000 字的上限，也是 C locale 下 `wc -m` 量的（6678），按字符数 retro 主体是 3176，看来同样不存在，留给它自己的 issue 会话核；#125 idea-loop design-archive：SKILL.md 主体约 2.1 万字，按字符数是 11386，确实超了，跟本 issue 无重叠
- 相邻还没完成的 spec：无涉及 dreaming SKILL.md 篇幅的
