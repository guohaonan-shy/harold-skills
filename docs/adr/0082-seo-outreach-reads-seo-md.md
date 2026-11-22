---
type: adr
status: 生效
tags: [idea-loop, seo, seo-outreach, seo-writing, seo-md]
summary: seo-outreach 与 seo-writing 改用 seo-md.mjs 读 SEO.md，不再指向 seo-setup 的私有参考
related: ["[[0020-idea-loop-seo]]"]
---

# ADR-0082 — seo-outreach 与 seo-writing 读 `SEO.md` 一律走 `seo-md.mjs`

> 由 spec `seo-outreach-reads-seo-md` 蒸馏而来，该 spec 已删除。对应 issue #235。

## 1 背景（why）

`SEO.md` 是目标仓库根上的 SEO 配置文件，`idea-loop/scripts/seo-md.mjs` 是读它的统一入口（输出解析好的各节 JSON）。issue #235（2026-11-16 对着 `main` 5f26e2f 读码）发现：`seo-outreach` 的「输入」一节让 agent 去看 `seo-setup` 自己 `references/` 里的 `seo-md.md`，`seo-writing`「规则分两层」也有同样的指针。

这条指针走不通：照字面读别的 skill 的 `references/`，违反 `writing-for-agents` 的「引用另一个 skill」约定；照约定去调 `seo-setup`，它设了 `disable-model-invocation: true`，Skill 工具调不到。根因是这两份写成时 `seo-md.mjs` 还不是统一入口，后来 `seo-scan` 修过同一问题，这两份没跟着改。

## 2 决策（how）

- 两份 SKILL.md 读 `SEO.md` 都改成 `node "${CLAUDE_PLUGIN_ROOT}/scripts/seo-md.mjs" SEO.md`，照 `seo-audit`、`keyword-research` 等现有写法；`seo-outreach` 读「站点」「竞品」「写作」，`seo-writing` 读 `writing.voice` 与 `writing.failures`；没有 `SEO.md` 时各自原有的处理不变。
- 不拆出可被模型调用的格式说明 skill：`seo-md.mjs` 的输出够用，没有调用方需要读格式文档。
- 版本档：patch。

没做（取舍）：`skills/seo/README.md` 里指向 `seo-md.md` 的链接不动（给人看的）；`seo-setup` 读自己的参考合规；`seo-outreach` 的 description 归 #234，不碰。

## 3 结果（result）

- 合并在 PR #351（seo-outreach 读 SEO.md 时不再指向 seo-setup 的私有参考）；issue #235 已 CLOSED（2026-11-17）。
- 对着 `main` c2b43c34 核过：`idea-loop/skills/seo/seo-outreach/SKILL.md` 第 19 行、`idea-loop/skills/seo/seo-writing/SKILL.md` 第 12 行都是 `seo-md.mjs` 读法，两份目录里已没有指向 `seo-md.md` 或 `seo-setup` 的 `references/` 的文字。
- 守护：`idea-loop/scripts/seo-params-doc.test.mjs` 里的「seo-outreach and seo-writing: read SEO.md through seo-md.mjs…」一条（该文件 21 条本次全过）。
