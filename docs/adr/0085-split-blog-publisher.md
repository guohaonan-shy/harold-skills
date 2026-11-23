---
type: adr
status: 生效
tags: [idea-loop, seo, seo-writing, cover, og, writing-lint, split-blog-publisher]
summary: 博客 workflow 拆进 idea-loop seo 组：brief 出图、改稿循环、通用写作 lint，项目取值走 SEO.md 与 DESIGN.md
related: ["[[163]]", "[[2026-11-16-blog-workflow-grill]]"]
---

# ADR-0085 — 博客 workflow 进 idea-loop 的 seo 组：通用方法进插件，项目取值进目标仓库

> 由 spec `split-blog-publisher` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

issue #163 起因：一个下游项目（记作「项目 A」）的项目级 skill `blog-publisher` 同时装着写正文的通用规则和项目自己的取值，idea-loop 的 `seo-writing` 里又有同一批通用规则。核对基准是 2026-11-16 的两边 `origin/main`。三处问题：

- **写作规则两边各一份。** `SEO.md` 的「写作」节把 `seo-writing` 指到项目的 `voice.md`，新规则不知道该落哪边。例子：项目 A 的一次 retro 出的写作规则候选，最后落进了项目的 `voice.md`，别的项目拿不到。
- **把关工具全在项目里。** 项目 A 的 `voice-lint` 脚本有 21 条判错规则，逐条分类：通用 3、阈值或词表要配 15、只属于项目 A 的 3。评委评分表 13 个维度，11 个通用、2 个要配。
- **封面和 OG（分享卡）只有项目自己的版本，方法和取值缠在一起。** 另一个项目要做封面和分享卡，只能整套抄过去再挑取值。人还评价 OG 模板「太简单了」。

根因：没有一条「通用方法进插件、项目取值进目标仓库」的分界。决定记录见 [[163]]，grill 记录见 [[2026-11-16-blog-workflow-grill]]。

## 2 决策（how）

- **全放 idea-loop 的 seo 组，不进 `content-creator`。** AI 原按「先扩展已在用的工具」推荐 `content-creator`，人从「封面、OG 要跟 brief 的角度接上」推翻。`seo-brief`、`seo-writing` 改，新增 `cover`、`og` 两个可被模型调用的 skill。单独成 skill 而不写成 `seo-brief` 的参考，是因为写作循环里 `seo-writing` 也要调它们重出图，而一个 skill 的私有参考别的 skill 读不了。
- **不另做直接调用的入口。** 博客 workflow 就是 SEO 全托管（#291）下的一个内容类 SEO issue，在一个 todo 会话里从 brief 走到 PR。人停的点只有选角度、挑封面主体、改稿后人改一遍，且只在人在场时停；托管时照推荐定，依据写「AI 照推荐定：<理由>」。
- **流程四步。** brief 新增「配图」一步（出封面和 OG，图提交在 issue 分支上）；初稿；改稿循环（通用写作 lint 加项目补充 lint，再起写作评委打分，`local` 问题自动改，最多三轮，没干净的写进交回）；发布前检查与构建后 `seo-check`。写作评委报 `premise`（论点站不住）时 AI 不自己翻论点，issue 翻回 triage 并附评委原话。
- **通用写作 lint 做成脚本**：`voice-lint` 里通用和要配的 18 条进 `writing-lint.mjs`，默认值取项目 A 现行值，词表中英各一份；项目专属的 3 条留项目，由「补充 lint」键指过去。不做成 PostToolUse hook，在改稿循环里显式跑。
- **项目取值放哪**：写作类走 `SEO.md`「写作」节，新增「lint 配置」「补充 lint」「第二评委」三个键；工具类走 `SEO.md` 新增的「配图」节，图片目录必须在「内容路径」以内，`seo-setup` 写入前检查；品牌类扩 `DESIGN.md`，封面和 OG 的出图配方作为 `blog-cover`、`og-card` 两个组件放 Components 章，不新建品牌 skill（「先扩展已在用的工具」）。项目没配时，人在场就问，托管时用默认配方并在 PR 描述写一句。
- **OG 重新设计**：自带三种版式，读 `DESIGN.md` 的 token 渲染。
- **写手用 Claude，第二评委项目可选。** 依据是 Google 官方文档（2026-11-16 读）对某新模型的描述：定位不含写作、不遵守长度目标、仅企业客户可用。
- **顺序**：排在 #291 之后，两边都改 `SEO.md` 格式。
- **版本**：夜里 AI 按 `REVIEW.md` 字面定 minor，人改定 patch（见 [[163]] 题 8）。

取舍（没做）：

- 不合并 `content-creator` 的 `thumbnail-gen`（平台与尺寸不同）。
- 不重写 `seo-writing` 已有的写法规则，不迁移、不重做已发布文章的图。
- 不做不经 issue 的直接入口，人说「写一篇博客」就先开 issue。
- 项目 A 那一侧的迁移（`blog-publisher` 退役、文风文件挪位、项目级 `cover` / `og` 删除）不在本仓库做，另开了项目 A 的 issue。

## 3 结果（result）

- 新 skill：`idea-loop/skills/seo/cover/SKILL.md`、`idea-loop/skills/seo/og/SKILL.md`（`og/assets/` 下 `poster.html`、`split.html`、`block.html` 三种版式，渲染脚本 `idea-loop/scripts/og-render.mjs`）。
- 写作循环：`idea-loop/scripts/writing-lint.mjs`；`idea-loop/skills/seo/seo-writing/references/revision-loop.md` 与 `judge-rubric.md`；`seo-brief` 的 `SKILL.md` 有「配图」一步。
- 键与节：`idea-loop/scripts/seo-md.mjs` 解析「lint 配置」「补充 lint」「第二评委」与「配图」节，`idea-loop/skills/seo/seo-setup/references/seo-md.md` 记录；`idea-loop/skills/design/design-modeling/SKILL.md` 的准入表写明博客封面、OG 卡的出图配方算 Components 章的组件。
- 合并在 PR #403（博客 workflow 进 idea-loop 的 seo 组：brief 出图、写作循环、通用写作 lint）；issue #163 已关闭；决定记录补充在 PR #429。审核中顺带修了其余 seo skill 写死的节数（原 issue #404，已关闭），术语「写作评委」「出图配方」进了 `GLOSSARY.md`。
- 守护：`idea-loop/scripts/writing-lint.test.mjs`、`seo-writing-loop-doc.test.mjs`、`seo-brief-images-doc.test.mjs`、`cover-skill-doc.test.mjs`、`og-skill-doc.test.mjs`、`og-render.test.mjs`、`seo-md-writing-images.test.mjs`、`seo-md-keys-doc.test.mjs`、`seo-blog-workflow-readme-doc.test.mjs`、`no-project-leak.test.mjs`。本次对账跑了 `writing-lint`、`seo-writing-loop-doc`、`seo-brief-images-doc`、`cover-skill-doc`、`seo-md-writing-images`、`seo-blog-workflow-readme-doc` 六个测试文件，127 条全过。
