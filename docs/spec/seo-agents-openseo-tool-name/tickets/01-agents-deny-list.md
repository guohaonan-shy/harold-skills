# 01 — 带连接器的 agent 只写禁用清单，连接器改了名也拿得到工具

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

「连接器」= 会话里任何一个提供工具的 MCP 服务，不分来源（插件自带、手动配置、claude.ai）。idea-loop 自带 OpenSEO 和 Mobbin 两个连接器。同一个连接器在项目、本地或用户配置里也配了一份时，Claude Code 只连优先级高的那份，插件那份被顶掉，工具名换成手动配置起的名字。agent 定义里的 `tools:` 白名单按全名匹配，于是一个工具都拿不到，SEO 扫描和设计调研空跑。

人已定（2026-11-20 grill）：不再写白名单，改成「继承主会话全部工具，再禁掉几样」。这张工单让下面这件事成立：**不管连接器以什么名字加载，SEO 扫描的方向 agent 和设计调研员都拿得到并调用它的工具，不停下、不要人删配置。**

要改的：

1. **8 个 agent 的定义**：technical-auditor、page-optimizer、keyword-miner、backlink-analyst、geo-analyst、results-analyst、uiux-researcher（插件 agents 目录下）。去掉 `tools:` 那一行，改写 `disallowedTools: Edit, NotebookEdit, Agent`。定义正文里不加「只用某个连接器」之类的约束句。正文里写着连接器工具全名（`mcp__plugin_…`）的地方改成短名称呼（如「OpenSEO 的 `whoami`」「Mobbin 的 `search_screens`」）。原先只靠白名单表达的「只读」，若正文需要交代就照 agent-builder 的写法补一句，不复述权限清单。adr-reconciler、explorer、ui-master 不动。
2. **SEO 扫描（seo-scan skill）开场**：上一版（本分支已有）加了「认 OpenSEO」，三种情形里有「被别的名字顶替就停下、让人删配置」一支。删掉这一支，只留：会话里有某个连接器同时带 `whoami` 和 `get_project_context` 两个工具，就算 OpenSEO 在、往下走；一个都没有，停下交回「OpenSEO 没连上，去 `/mcp` 连上」。停下说明的参考文件里「被顶替」的判断表和交回形状一并删掉；「只有几种情形停下」那句跟着改对。正文里写死的插件全名改成短名，只有 frontmatter 的 `allowed-tools` 保留插件全名（实测它不认中间通配）。
3. **SEO 设置（seo-setup skill）第 1 步**：删掉「被顶替」那一条和它指向的参考文件（被顶替话术那份），原「调不通就告诉人去 `/mcp` 连上」照旧。
4. **为守 5000 字从正文挪出去的三段**（缺口关卡停下的交回、方向 agent 提示模板、项目对不上唯一一个）：改完后正文按 AGENTS.md 量法还超 5000 就留在参考文件里，不超就挪回正文原位，原文不改字。
5. **设计调研说明**：research-backend 参考里 Mobbin 三个搜索工具的全名写法改成短名；运行环境说明（runtime 的 claude-desktop 参考）「装与设置」里 Mobbin 那一条，不再说「手动配了同地址的会让调研员拿不到工具，要删掉」，改成手动配的也能用、只要登录。
6. **agent-builder 模板**：frontmatter 示例里 `tools: <白名单；MCP 可写 mcp__<server>__*>` 和「权限用 `tools` 表达」改成：不用连接器的 agent 用 `tools` 白名单；用到连接器的 agent 不写 `tools:`，写 `disallowedTools` 禁掉不该有的（连接器被别处配置改名时白名单会失效）。
7. **插件 README**：SEO 设置、SEO 扫描两行去掉「只认插件自带的 OpenSEO、被顶替就停下」的说法，改成按短名认 OpenSEO、没连上才停；agents 一节写明用到连接器的 agent 只写禁用清单；测试清单里那份文档测试的说明照新内容改。
8. **文档测试**：把本分支已有的 seo-openseo-superseded 那份文档测试改写（可改名，README 测试清单同步）：钉住 8 个 agent 没有 `tools:`、`disallowedTools` 是 `Edit, NotebookEdit, Agent`；插件里任何 agent 的 `tools:` 行不含 `mcp__plugin_`；seo-scan 开场按短名判断、没有「被顶替」一支、只有「没连上」一种停下；seo-setup 没有被顶替的话术和引用；agent-builder 模板写的是 `disallowedTools`。先对改动前的文字跑一次见红。
9. **假插件探针**（不进测试套件，实现完跑一次，结果写进交回）：材料在集成 worktree 的 `.tmp/grill/2026-11-20-connector-tools/probe/`（假插件 `p`、`proj-none`、`proj-myecho`，那里的 `bl` agent 就是只写禁用清单的写法）。用 `claude -p --plugin-dir`，权限用 `--allowedTools` 给出，不要用 bypass。三次：项目不配置时 agent 调 `ping` 回 pong 且 `Edit`、`Agent` 不在手里；项目用 `myecho` 时 agent 拿到 `mcp__myecho__ping` 回 pong；假插件去掉服务时仿 SEO 扫描开场判断的 skill 停下交回「去 `/mcp` 连上」。

版本：插件 `plugin.json` 本分支已升到 0.1.35（patch），这张不再升；若合进来时主分支已越过 0.1.35，按 patch 重升一档。

## 验收标准
- [x] 8 个 agent 没有 `tools:` 行，`disallowedTools` 是 `Edit, NotebookEdit, Agent`；正文里没有连接器工具全名；adr-reconciler、explorer、ui-master 的 `tools:` 没动。
- [x] SEO 扫描开场按短名判断 OpenSEO：有就往下，一个都没有才停下交回「去 `/mcp` 连上」；没有「被顶替」的判断和交回形状；「只有几种情形停下」那句与实际一致；只有 `allowed-tools` 还写插件全名。
- [x] SEO 设置第 1 步没有被顶替那一条，被顶替话术的参考文件已删，没有任何文件再引用它。
- [x] 挪出正文的三段按字数放对了位置，原文未改字。
- [x] 设计调研说明和运行环境说明里 Mobbin 的写法照第 5 条改了。
- [x] agent-builder 模板照第 6 条改了。
- [x] 插件 README 照第 7 条改了。
- [x] 改写后的文档测试在改动前的文字上失败、改动后通过；插件脚本目录下全部 `*.test.mjs` 通过。
- [x] 假插件探针三次结果写进交回、与期望一致；跑不了的写明原因。
- [x] 版本号照「版本」一段处理。
- [x] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。
- [x] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。
- [x] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」。

## 选中的存量回归
- `seo-params-doc.test.mjs`：断言 seo-scan「缺口关卡」和 seo-setup 的句子，上一版改过它的断言指向，挪回正文时最容易误伤。
- `seo-brief-angle-doc.test.mjs`：钉着 seo-setup 正文不超 5000 字、标签清单和 AI 可见性步骤在指针后面。
- `seo-scan-routing-doc.test.mjs`、`seo-budget-doc.test.mjs`、`seo-results-report-doc.test.mjs`：钉着 seo-scan 交回模板、`whoami` 读余额、results-analyst 定义，改开场和 agent 定义时有风险。
- uiux-research 相关的文档测试（插件脚本目录下以 uiux-research 或 research 开头的）：钉着调研员定义和 research-backend 的写法。
- `no-project-leak.test.mjs`：改说明文字时防止写进真实项目名。
