# 09 — 文档同步与版本

**Blocked by**：01、02、03、04、05、06、07、08
**设计冻结**：不涉及 UI

## 要建什么
前八张落地后，说明文字要跟上新出口，idea-loop 升一个 patch 版本。

- 仓库根 `AGENTS.md`「idea-loop 的约定与刻意例外」第 1 条里关于 `seo-scan` 出口的那句（「它的出口是开成 backlog 的 issue，由每周的分拣按建议去向翻状态」一类）改成新出口：扫描后当场分流的 issue、每 3 天的效果报告 PR；同时写 SEO 自动合并是 decision-rules 护栏的一条例外。
- idea-loop 的 SEO 分类 README 和 idea-loop 的 README 同步：每天扫描、results 方向与 results-analyst、分流、自动合并与上线自查、外联四个分支、`SEO.md` 新键（内容原则、内容路径、上线等待、套餐额度与每周分配、分析）。
- seo-brief 第 4 步「角度候选……留给人定」和第 6 步「确认『需要 grill：选题角度和论点』那一行在」跟 issue-session 起草参考新加的 SEO 分支（「需要 grill」照已有结论和内容原则自己答完）对着写：在这两处加一句，SEO issue 起草时走起草参考的 SEO 分支，角度照推荐定、依据写「AI 照推荐定」；人直接要一份 brief（不在 issue 起草里）时照旧留给人定。（04 落地时发现，编排者照「影响这次交付就在当前 PR 修」并进本工单）
- `idea-loop/.claude-plugin/plugin.json` 的 `version` 升 patch（合并前主分支上的版本 +1；写这张工单时是 0.1.20）。版本档位规则见仓库根 `REVIEW.md`「额外要求」，若它要求 minor 就照它。

## 验收标准
- [ ] seo-brief 两处写明 SEO issue 起草时角度照推荐定，人直接要 brief 时照旧；`*-doc.test.mjs` 钉住（先对改前原文看它红）
- [ ] 根 `AGENTS.md` 第 1 条不再说 SEO issue 等人分拣，写了新出口
- [ ] 两份 README 覆盖上面列的每一项
- [ ] `plugin.json` 版本已升，档位符合 `REVIEW.md`
- [ ] idea-loop 全量测试通过

## 选中的存量回归
- `no-project-leak.test.mjs`：README 里的例子不能带项目名
- 根 AGENTS.md / README 相关的文档测试（若有钉着 seo-scan 出口那句的）
