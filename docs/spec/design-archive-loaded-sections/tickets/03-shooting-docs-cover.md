# 03 — 拍图手册、对账、归档、初扫加上 `cover` 这一步

**Blocked by**：01（边的 `shot` 与规则 8）、02（`cover` 命令）
**设计冻结**：不涉及 UI

## 要建什么

给 agent 读的拍档案截图说明，按新的情形走：一个不分段、比主视口高的状态（比如加载完的报告页），先 `screen` 拍主视口图，再 `cover` 补拍首屏以下会连出边的组件，按返回给每条边写 `shot`。agent 读完这些文档，拍一张长报告页时会照这几步做，对账时会把补拍图逐张比。

要改的地方：

1. **拍图手册**（`design-archive` 的 shooting 参考文件）：
   - 「情形怎么选」加一种情形「比主视口高、不分段的状态」，单独一节写步骤：装时间 → 走到这个状态 → 跑 `screen` → 跑 `cover`（`--out` 同目录）→ 按返回的 `shot` 给每条边写上；有 `unlocated` 时怎么办（多半是 `locate` 写错了或组件改名了，修 `locate` 再跑）。
   - 「单屏状态」一节补一句：不知道页面高不高时跑一次 `cover`，返回空就是单屏状态。
   - 「看到什么 → 做什么」里 `heightDrift` 不是 0 那一行，单屏状态的说法从「改成声明分段」改成：不分段的照新情形补拍（入口状态是营销页那种结构化长页面的，才改成声明分段）。
   - （「命令」代码块的 `cover` 那一行已由 02 加上。）
2. **dreaming 对账**（`design-archive` 的 review-reconcile 参考文件）第 3 步「拍」、第 4 步「比」：不分段的状态 `screen` 之后加 `cover`；补拍图逐张跟 `prod/` 里同名的图比，比法和分段图一样；`cover` 合出来的分组跟 `prod/` 里的 `shot` 不一样（内容变了），判「档案过期」，按新的分组重写 `shot`。
3. **合并前归档**（`design-archive` 的 review-archive 参考文件）里拍单屏状态的地方，跟着加 `cover` 与写 `shot`。
4. **design-archive 的 SKILL.md**：「按需读」表里拍档案截图那一行的情形列表加上这种情形（主体保持 < 5000 字，现在 4785）。
5. **dreaming 初扫**（`dreaming` 的 initial-scan 参考文件）第 7 步：情形列表里加这种情形，拍法照拍图手册。

文档里出现的每一行 `design-archive-sections.mjs cover …` 调用都要是真实子命令和它自己的选项（现有 doc 测试会核）。

## 验收标准

- [x] 文档测试先红后绿（加在 sections doc 测试里，照现有「拍档案的地方把单屏状态送去 `screen`」那条的写法）：拍图手册的「情形怎么选」里有「比主视口高、不分段的状态」；拍图手册、对账、归档、初扫这四处提到拍单屏 / 不分段状态的地方都提了 `cover`。
- [x] 现有 doc 测试「文档里每行调用都是真实子命令、只用自己的选项」通过（新写的 `cover` 调用行被它核过）。
- [x] 对账说明写明：补拍图逐张比、分组变了判档案过期并重写 `shot`。
- [x] `no-project-leak` 测试通过：新文字里的例子用通用的报告页，不用真实项目名。
- [x] 每份改过的 SKILL.md 主体仍 < 5000 字（量法见仓库 AGENTS.md）。

## 选中的存量回归

- sections doc 测试（`design-archive-sections-doc.test.mjs`）：核文档里的命令行。
- 设计档案 skill doc 测试（`design-archive-skill-doc.test.mjs`）：核 design-archive 的 SKILL.md 与参考文件的结构。
- 防项目信息泄漏测试（`no-project-leak.test.mjs`）。
