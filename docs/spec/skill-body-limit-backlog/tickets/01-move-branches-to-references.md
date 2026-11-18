# 01 — design-modeling 与 pr-review 把部分运行才走到的一节挪进参考文件，主体压回 5000 字

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

idea-loop 有两份 skill 说明的主体（去掉开头 frontmatter 之后的部分，按 UTF-8 字符数量）超过仓库规定的 5000 字：design-modeling（约 5485）和 pr-review（约 5108）。量法：`awk 'f>=2; /^---$/{f++}' SKILL.md | LC_ALL=en_US.UTF-8 wc -m`。

做完后，调用这两个 skill 的 agent 每次都要走的步骤原样留在主文件里；只有少数运行才走到的一节整段原样搬进这个 skill 自己的参考文件目录，主文件原处保留同名小节标题，正文换成一句以触发条件开头的指针（「……时，读 references/<文件名>」）。挪，不删，不改写：搬过去的内容逐字一致，只允许调整标题层级。

- pr-review 的「设计变更」一节：只在人接受了一处跟冻结画布不同的设计时走到。挪进参考文件 `design-change.md`（跟 implement skill 的「设计变更」同样的做法：implement 那一节已经是指针加同名参考文件）。
- design-modeling 的「一次写入怎么走」一节：只在真的写 `DESIGN.md` 的运行（新建、蒸馏、对账）走到，只写设计法候选或判断准入的运行不走。挪进参考文件 `write.md`。别的 skill 和 agent 按「一次写入怎么走」这个小节名点它，所以标题必须保留。

同时把字数测试改回守 5000：pr-review 的字数测试现在上限是 5108（一条临时棘轮，注释写着压回 5000 是这个 issue 的事），改成 5000 并去掉「棘轮」的措辞；implement 的回放测试里「implement 主体不比 9589 字长」那一条已经被另一条 < 5000 的测试取代，删掉。

idea-loop 插件版本升一个 patch；插件 README 里如果列了这两个 skill 的参考文件，补上新文件。

## 验收标准

- [x] design-modeling、pr-review 两份 SKILL.md 主体按上面的量法都 < 5000 字（PR 描述贴改前改后的数）
- [x] pr-review 主文件仍有「设计变更」小节，正文是一句以触发条件开头、指向 `references/design-change.md` 的指针；参考文件里有原来那一节的全文（含 `idea-loop:design-change-sync` 和「PR 分支」）
- [x] design-modeling 主文件仍有「一次写入怎么走」小节，正文是指向 `references/write.md` 的指针；参考文件里有原来那一节的全文（备份、lint、diff 几步都在）
- [x] 挪走的内容在主文件里不再留一份（不重复）
- [x] pr-review 的字数测试守 5000，先在改前的文本上看到它红，改后绿；「设计变更」那条测试改成断言指针 + 参考文件内容
- [x] 设计变更的一致性测试对 pr-review 也像 implement 一样把参考文件拼进「设计变更」再测，仍然绿
- [x] implement 回放测试里「不比 9589 长」那一条删掉
- [x] 新增一条 design-modeling 的文档测试：主体 < 5000，「一次写入怎么走」小节在且指向 `references/write.md`，参考文件含备份、lint、diff 三步
- [x] idea-loop 全部测试通过；插件版本升 patch
- [x] review 第 1 轮 人批示 1（2026-11-18）：design-modeling 主文件开头（frontmatter 之后、「是什么」之前）那两段删掉——写 DESIGN.md 时 lint 由插件 hook 自动跑，收尾的 lint 与 diff 命令已在 `references/write.md`
- [x] review 第 1 轮 人批示 2（2026-11-18）：「是什么」里「DESIGN.md 由 YAML front matter（…）和 Markdown 正文（…）组成」这句移出，改成「结构」一节开头的两行表格（front matter / 正文，各写它装什么、给谁读）；「是什么」其余三条保留
- [x] review 第 1 轮 人批示 3（2026-11-18）：「结构」一节下分两个三级小节：「Front matter」（现在独立的「Front matter」一节整节挪进来，标题文字不变，别的参考文件按「Front matter」这个名字点它）和「正文」（现在「结构」下的章表）；章表下面两条（`omitted:` 声明那条、「前八章来自 Google 规范…靠写的人守」那条）删掉
- [x] review 第 1 轮 人批示 4（2026-11-18）：主体仍 < 5000 字，idea-loop 全部测试通过；按小节名点「Front matter」「结构」「一次写入怎么走」的参考文件、hook 注释与测试仍对得上

## 选中的存量回归

- `pr-review-slim-doc.test.mjs`：直接守 pr-review 主文件的结构和字数，这一刀改的就是它。
- `design-change-final-version-doc.test.mjs`：读 pr-review 的「设计变更」小节判断一致性，挪走正文后会失效，要像 implement 那样拼参考文件。
- `implement-replay-large-doc.test.mjs`：含要删的 9589 旧棘轮。
- 所有按「一次写入怎么走」或 design-modeling 小节名做断言的文档测试（`grep -l 一次写入怎么走 idea-loop/scripts/*.test.mjs`）：挪走正文后可能断言不到原句。
