# 02 — engineering 的流程只写能力名：setup、调度、会话、分拣、issue、PR、浏览器

**Blocked by**：01 — 运行环境层落地
**设计冻结**：不涉及 UI

## 要建什么

engineering 分类下的 skill 与它们的 references 里，所有写死某个运行环境工具或界面的地方，改成「用『<能力>』能力：<要做什么>，做法照 `idea-loop:runtime`」。涉及：setup（预检表、Linear 接入、每周对账、每周分拣、夜间回放）、issue-dispatch、issue-session（含起草 spec 的 reference）、issue-triage、issues、pr、browser。夜间回放脚本打印给会话照做的 prompt（让会话转发消息的那段）也改成能力名。

issue-dispatch 拆成通用部分与运行环境部分：对账、队列与上限、候选、每轮最多开 3 个、汇报留在正文；「怎么一轮一轮跑、怎么数开着的会话、怎么交出 issue」三处交给 runtime（spec「调度在 magi 里的形状」）。issue-session 的认领、换 section、收尾同理：桌面端照旧，magi 里不挪分组、收尾时归档自己。setup 在 magi 里建每周分拣与调度用定时任务能力，prompt 写「用 Skill 工具调 idea-loop:<skill>」。各 skill 自己写的退路删掉，统一照 runtime 的退路。

桌面端行为不变：删掉的每一处写法都必须已经在 01 的 claude-desktop reference 里。

## 验收标准

- [x] engineering 下的正文与 references 里不再出现运行环境专用写法（照 spec「tripwire 的名单」grep，frontmatter 的工具声明行除外）；在交回里贴 grep 结果。
- [x] 每处删掉的桌面端写法都能在 claude-desktop reference 里找到（交回里列对照）；发现缺的，补进 reference，不留在正文。
- [x] issue-dispatch 正文不再写 section、卡片、会话内循环的具体做法；在 magi 里照 runtime 能读出完整的一轮（cron 新开、按 slug 与状态计数、直接开、停掉自己）。
- [x] setup 在 magi 里建每周分拣的步骤能照 runtime 做出 `magi cron create triage-<仓库名> … --action create_session … --prompt "用 Skill 工具调 idea-loop:issue-triage"`。
- [x] browser 不再写「Playwright MCP 不在就停下」，改为照 runtime 的『浏览器』能力；magi 里用 `magi browser`；magi 下「摆给人看」走退路（截图经『发文件给人』发出并附 URL），magi reference 同步写明。
- [x] 夜间回放脚本打印的 prompt 不含运行环境专用工具名；它的测试相应更新。
- [x] 改到的 SKILL.md 主体仍 < 5000 字；README 里对应的描述同步。
- [x] `node --test '*/scripts/*.test.mjs'` 全绿。

## 选中的存量回归

- `issue-model-tripwire.test.mjs`：setup 写 triage 答案进 ISSUE_TRACKER.md 的断言，改 setup 正文时最容易碰掉。
- `issues-skill-doc.test.mjs`：issues 的 Linear 做法与 tracker 模板的断言。
- `pr-review-slim-doc.test.mjs`、`implementer-standards-doc.test.mjs`：读 skill 文档断言的测试，改正文措辞可能牵动。
- `retro-install` 相关测试：它断言打印的 prompt 文本。

> 按规则定（2026-11-06，编排者，依据 spec「退路」）：magi 的『浏览器』里「把一页摆给人看」这一用途写成「没有」：magi 的匿名浏览器只有本会话看得到。退路是截一张图，经『发文件给人』发出，并附上页面 URL 让人自己打开。改 magi reference 的『浏览器』小节与 browser skill 时照这条写。

> 按规则定（2026-11-06，编排者，依据实测）：magi 里会话**不能归档自己**（`magi sessions archive` 只收它开出的 helper），**能停掉自己**（`magi sessions stop` 对自己可用）。调度会话与 issue 会话收尾改成 `magi sessions stop` 停掉自己；调度数开着的会话改成 slug 前缀 `<仓库名>-<号>`、状态不是 stopped / exited / dead、也没归档的。01 落地的 magi reference 里写的「archive 归档自己」与「未归档」随这张一起改；spec 已同步。
