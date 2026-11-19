# 18 — skill 迁移：seo 类，删掉 runtime、browser、seo-check 三个 skill

**Blocked by**：01 — 末尾「人的决定」那一格（版本改成 0.0.1）
**设计冻结**：不涉及 UI

## 要建什么

seo 类 skill 和 seo 的方向 agent 里的全路径脚本调用改成 `dyna seo …`；seo-check skill 删掉，只留检查命令和构建后 hook。删掉 runtime、browser 两个 skill：所有 skill、agent 里引用 `idea-loop:runtime` 的 39 处、`idea-loop:browser` 的 20 处改成 `dyna runtime show <能力>`。这张跟 16、17 碰的文件可能重叠（runtime 引用遍布各类）：只改 runtime、browser 引用那几行，不碰 16、17 改的命令行。

## 验收标准

- [ ] 插件里没有 runtime、browser、seo-check 三个 skill，没有任何文件引用它们
- [ ] seo 类 skill 和 agent 里没有全路径脚本调用；扫描测试通过

## 选中的存量回归

- `runtime-skill-doc.test.mjs`、`runtime-tripwire.test.mjs`：守着 runtime skill，skill 删了要随之改写或删掉并写理由
- seo 的 `*-doc.test.mjs`：断言 seo skill 的文字

> 补充（工单 11 交回，2026-11-19）：runtime 数据在插件的 `runtime/` 目录（capabilities.md 与每种环境一份）。删 runtime skill 时一起改数据里指向旧东西的字眼：capabilities.md 的「怎么用」「检测规则」「加一种运行环境」三节、两份环境数据里指向 SKILL.md 的链接和「走 SKILL.md 的退路」、抢锁和桌面端交出那两步里的旧脚本调用（改成 `dyna ui lock …`、`dyna runtime handoff`）、注入头话里的「idea-loop:runtime」。对着旧脚本差分的注入测试随之改成对着新文字断言。claude-desktop 那份注入已有 9933 字（上限一万），只删不加。
