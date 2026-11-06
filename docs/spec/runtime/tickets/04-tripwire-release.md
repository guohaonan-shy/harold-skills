# 04 — 守住解耦并发 0.1.11：tripwire、README、版本号

**Blocked by**：02 — engineering 的流程只写能力名；03 — productivity、design、seo 的流程只写能力名
**设计冻结**：不涉及 UI

## 要建什么

一个 tripwire 测试扫 idea-loop 的 `skills/` 与 `agents/`：除了 runtime 自己的 references 与 frontmatter 的工具声明行（`allowed-tools:`、`tools:`），不许出现运行环境专用写法（名单见 spec「tripwire 的名单」）；命中输出「文件:行  规则  原文」。plugin README 写清支持哪两种运行环境、能力清单在哪、怎么强制指定运行环境，文件树里加 runtime skill、检测脚本与 SessionStart hook。版本升到 0.1.11。

做完后：在任一通用 skill 里写一行定时任务工具名，测试变红并指到那一行；删掉后变绿。

## 验收标准

- [x] tripwire 测试先在一个故意写死工具名的夹具上看到红，再对插件全绿。
- [x] 放行只有两类：runtime 的 references、frontmatter 的工具声明行；测试注释写明为什么放行。
- [x] README 写了：支持 claude-desktop 与 magi；命令行与 IDE 按 claude-desktop 判、缺的能力走退路；`IDEA_LOOP_RUNTIME` 强制；能力清单指向 `idea-loop:runtime`。
- [x] magi reference 与 spec 里 `magi cron` 的时区写成人的时区，不再写 UTC。
- [x] `idea-loop/.claude-plugin/plugin.json` 的 version 是 0.1.11。
- [x] `node --test '*/scripts/*.test.mjs'` 全绿。

## 选中的存量回归

- `no-project-leak.test.mjs`：同类 tripwire，新测试的扫描范围与它对齐，别互相漏扫。
- 全量套件：收缩这一步最后一次确认 02、03 没留尾巴。

> 按规则定（2026-11-06，编排者，依据实测）：`magi cron` 的表达式按人的时区解析，不是 UTC（实测：`magi cron create … --expr "7 3 * * 1"` 后 `magi cron show` 显示 `when 7 3 * * 1 (Asia/Shanghai)`；`magi help cron` 写的 UTC 与实际不符）。`magi cron show` 有 `last ran` 字段、不带成败。magi reference 与 spec 里写「按 UTC」的地方改成「按人在 magi 设的时区（`magi cron show` 的 when 一行会显示）」；顺带改 README 第 29 行 issue-triage 还写的「weekly desktop task」（03 交回的存量）。
