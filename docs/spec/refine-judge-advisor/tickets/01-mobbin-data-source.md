# 01 — 设计调研的数据源从 Refero 换成插件自带的 Mobbin

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

现在调研员（`idea-loop:uiux-researcher`）的工具写死了 Refero 的五个工具名，可 idea-loop 插件自己不带 Refero：它只配在某个项目自己的 MCP 配置里，换一个项目起调研员就直接失败。人已改订 Mobbin，判断是 Mobbin 的作品更新、更好。

这张工单之后：装了 idea-loop 的任何项目都多一个 Mobbin 连接，人说「查一下别人怎么做」时，整页调研（`idea-loop:uiux-research`）从 Mobbin 找参考，交出的调研页照旧过 `research-check`。

- **插件的 MCP 配置**加 Mobbin 的远程 MCP（`https://api.mobbin.com/mcp`，http，OAuth 登录，要 Mobbin 付费计划），写法跟插件里已有的 OpenSEO 一样。装了插件后它的工具名是 `mcp__plugin_idea-loop_mobbin__*`，调研员的工具清单换成它（照 SEO 那几个 agent 写 `mcp__plugin_idea-loop_openseo__*` 的写法）。
- **调研页契约**（uiux-research 的参考资料）里 Refero 的层次（screens / flows）和截图地址的规律，换成 Mobbin 的（screens / flows / sections），**按实测写**：开工时用这台机器上已连上的 Mobbin 工具（会话里有一组 Mobbin 的 `search_screens` / `search_flows` / `search_sections`）真搜几次，看返回的字段和图片地址长什么样，照实写。
- **Mobbin 没连上**：整页调研停下，告诉人怎么连（照 OpenSEO「没连上时只有 seo 分类受影响」的先例）；不影响别的分类。
- **跟着改的地方**：setup 的预检（含预检表）、运行环境 `idea-loop:runtime` 的「装与设置」（桌面端和 magi 两份参考），idea-loop 的 README，仓库根目录 `AGENTS.md` 里「唯一带 `.mcp.json`」那条（现在只写了 OpenSEO）。在 magi 里起调研员，起它的会话把 `magi mcp call` 的写法放进 prompt，照 runtime「调用 MCP」的做法。
- **eval 的统计**：`uiux-research` baseline 的 runner 和会话流解析脚本现在统计的是「调了几次 Refero」，改成统计 Mobbin。
- 某个项目自己配的 Refero 不迁移、不删，插件里也不再提它。用户级装过的 `mobbin` MCP 不在这张工单里动（合并后由人删）。
- **版本号**：插件版本已在切票提交里升过 patch（0.1.20 → 0.1.21），这张不再动。

## 验收标准

- [x] 插件的 MCP 配置里有 Mobbin 一项，写法跟 OpenSEO 同一种；`design-archive-mcp` 测试里守着「插件自带哪些 MCP」的那条改成认 Mobbin，不再说 Refero 在用户级
- [x] 调研员定义的工具清单里没有任何 Refero 工具名，换成 Mobbin 的通配写法
- [x] 调研页契约写明 Mobbin 的三层（screens / flows / sections）和截图地址的规律，内容出自这次实测（交回时附一次真实搜索返回的字段名清单作证据）
- [x] 契约和 skill 写明 Mobbin 没连上时整页调研停下、告诉人怎么连
- [x] setup 预检、runtime 两份「装与设置」、README、根目录 `AGENTS.md` 那条都改成 Mobbin；在插件目录和根 `AGENTS.md` 里搜 `refero`（不分大小写），除 `evals/uiux-research` 下已存档的人工标注外没有残留
- [x] baseline runner 与会话流解析统计的是 Mobbin 调用次数，对应单元测试改过并通过
- [x] 用 Mobbin 真跑一次整页调研（任选 baseline 里的一个问题），交出的页面过 `research-check`（页面由本会话已连的 Mobbin 连接器照契约做出；经调研员起跑那条路径时插件自带的 Mobbin 还没登录，停在「没连上」，待人 `/mcp` 登录后重跑 `run.mjs --only leave-confirm`）
- [ ] ⏭ 延后 → 人：`uiux-research` 的 baseline 全套用 Mobbin 重跑、交人标注（付费的大批量运行，按约定夜里跑）
- [x] `no-project-leak` 测试通过（契约里的例子不出现任何真实项目的名字）

## 选中的存量回归

- `design-archive-mcp.test.mjs`：里面有一条断言「插件只带归档服务和 OpenSEO、Refero 在用户级」，这次正好要改它
- `research-check.test.mjs`：调研页契约的图片地址规律变了，校验不能跟着放松
- `research-baseline.test.mjs`、`claude-stream.test.mjs`：统计字段从 Refero 换成 Mobbin
- `setup-single-source.test.mjs`、`runtime-skill-doc.test.mjs`：setup 预检和 runtime 的文字被改
- `no-project-leak.test.mjs`：契约要补新例子
- [ ] review 第 1 轮 C1（2026-11-19）：调研契约里不用术语表避用的叫法「用户流程」，改用「用户路径」（GLOSSARY.md「用户路径」词条写明避用「用户流程」；代码规范：领域词汇以术语表为准）
