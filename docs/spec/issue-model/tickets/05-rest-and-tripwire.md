# 05 — 其余入口换新模型，整合下线，tripwire 钉住

**Blocked by**：02、03、04
**设计冻结**：不涉及 UI

## 要建什么

插件里剩下读写旧状态的地方全部换成新模型，再用一个文档测试钉住不回退：

- setup：删整合定时任务和它的 prompt reference，survey 不再查 spec 状态；setup 问「团队用不用 triage」写进 `ISSUE_TRACKER.md`。
- dreaming 与 adr-reconciler：spec 了结 = `issues:` 里的 issue 全关了，不再看 spec 的 `status`。
- wiki-conventions：frontmatter 的 `status` 闭集里删掉 spec 一行，「spec 目录存在 = 还没了结」的判法换成看 issue；`check` 的出处换成新的 spec 读取脚本。
- retro、seo-setup、seo-scan、seo-geo、seo 开 issue 的脚本：开出的 issue 是 backlog（不打 `status:*`），状态名换新。
- `idea-loop/README.md`、evals 用例里引用旧状态的文字（用例记的历史 prompt 原话不改，只改说明文字）。
- 整合的文档测试改写成新模型的 tripwire：扫插件全部文件，没有 `spec-status`、八个旧中文状态名、「整合」的旧用法、`consolidation-prompt.md`。

## 验收标准
- [ ] tripwire 测试存在，在本刀之前的代码上会红、本刀之后绿
- [ ] setup 不再装整合定时任务，问 triage 用不用
- [ ] dreaming / adr-reconciler 判了结用 issue 的关闭
- [ ] 插件 scripts 的 `node --test` 全绿

## 选中的存量回归
- `setup-consolidation-doc.test.mjs`：改写成 tripwire 的那一个。
- `seo-issues.test.mjs`、`seo-scripts.test.mjs`：seo 开 issue 的状态变了。
- `retro-*.test.mjs`：retro 开 issue 的路径。
- `research-baseline.test.mjs`、`retro-case.test.mjs`：evals 文本改动不能破坏用例结构。
