# 03 — cover skill：照项目的品牌和配方出博客列表封面

**Blocked by**：02 — SEO.md 记下项目的写作检查配置和配图取值
**设计冻结**：不涉及 UI

## 要建什么
idea-loop 的 seo 组新增一个可被模型调用的 skill `cover`：给一篇文章（标题、角度、封面主体）出列表封面，放到项目的图片目录、写进文章 frontmatter 的封面字段。

- 项目取值从两处读：`SEO.md`「配图」节（图片目录、生图工具、字段名）和 `DESIGN.md`（front matter 的色板与字体 token；Components 章的「blog-cover」组件：logo 路径、底色、主体风格、生图提示词骨架）。找 DESIGN.md 用 `git ls-files | grep -i 'DESIGN.md$'`（design-modeling 没有现成步骤，写进 cover 自己的说明），多份时读「配图」节指定的那份，没指定就停下问人、托管时按默认配方。
- 通用做法从 Toeflair 的项目级 `cover`、`hero` 和 `blog-image-kit` 里取（本机 `TOFEL-demo` 仓库的项目级插件）：列表封面能垫白字标题、主体居中防裁切、HTML→PNG 用浏览器渲染、颗粒用 canvas、重渲后对 md5 防缓存。项目取值（底色、提示词、MCP 工具、路径、字段名）一律不带进插件。
- 文章顶部大图（hero）是它的一个分支：项目文章页要大图时同一套做法出。
- 项目没配「配图」节或 DESIGN.md 没有「blog-cover」：人在场就问；托管时用插件的默认配方出图，交回里写一句「项目没配封面配方，用的默认」，不阻塞。
- `design-modeling` 的准入分层表加一句：博客封面、OG 卡这类品牌对外图的配方算 Components 章的组件。
- description 只做路由（根 `AGENTS.md`「Frontmatter description 只做路由」），触发词覆盖「做封面」「重出封面」。

## 验收标准
- [x] 用一个只有通用默认、没有 DESIGN.md 配方的临时项目跑一次，产出一张封面 PNG，交回写明用了默认配方。
- [x] 用一个配了「配图」节和 DESIGN.md「blog-cover」的临时项目跑一次，封面用上了它的色和 logo；两张图放进交回给人看。
- [x] 插件里不出现 Toeflair 的取值；`no-project-leak.test.mjs` 通过。
- [x] 插件说明里的 skill 清单列出 `cover`。
- [x] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。
- [x] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。
- [x] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」。
- [ ] review 第 1 轮 C1（2026-11-20）：「放进仓库」一步以完成条件结尾：正常路径（图在图片目录、每个语言版本的封面字段都写了）和退路（图留在临时目录、交回写明）各一句。规则原文：「每一步都以一个完成条件结尾」。
- [ ] review 第 1 轮 C2（2026-11-20）：渲染参考里要动浏览器的两处，改成「用 Skill 工具调 `idea-loop:browser`」，截图存放限制那处带上 `idea-loop:runtime` 的「浏览器」一节。规则原文：「要 agent 当场用上另一个 skill：写『用 Skill 工具调』它的名字，只要其中一节就加上节名」。

## 选中的存量回归
- `no-project-leak.test.mjs`：从项目搬方法最容易带进取值。
- `seo-skill-descriptions-route-only-doc.test.mjs`：seo 组 skill 的 description 只做路由。
- `issue-group-skills.test.mjs`：skill 按分类目录放的约定。
