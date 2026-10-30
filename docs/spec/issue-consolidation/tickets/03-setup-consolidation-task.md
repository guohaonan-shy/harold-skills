# 03 — setup 建 cloud 整合定时任务：装 Claude GitHub App、建任务、清连接器、跑一次冒烟

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

一个跑在 Claude cloud 上的定时任务（claude.ai/code/routines，每次运行是一个会话，列在桌面应用侧边栏的 Scheduled 组），每 6 小时看一遍目标仓库开着的待验证 issue，把改同一个文件、或改同一个页面 / 功能模块的几个挂到一个新开的根 issue 下面。这张工单交付两样：

**整合任务的 prompt**（setup 自己的参考资料，建任务时原样写进去；cloud 会话不装插件，所以规则全在 prompt 里）：

- 只看开着、没有 `status:*` label（待验证）、还没有父 issue 的 issue；验证中及以后的不动，已关闭的不回溯。
- 判组依据，满足一条就合：改同一个文件（md 和代码都算）；改同一个页面或同一个功能模块。判模块要读标题和正文，不能只看 label。给出例子（同一个 SKILL.md 的几个 issue；同一个 Email 功能、同一个付款回调、同一个分析页的几个 issue）。
- 已有一个根（有子 issue、开着、自己没有 `status:*` label，即还没开工）覆盖这个文件或模块时，挂到那个根下；根已经开工（验证中及以后）就不挂，新开一个根（只有一个候选就不动）：标题写改的是哪个页面或模块，正文第一行写「由整合定时任务开出」，正文主要写改什么页面、模块，具体内容留在子 issue。一组不设上限。
- GitHub 调用只走仓库范围的 REST：列 issue 用 `GET repos/<仓库>/issues?state=open`（跳过 PR，分页），开根用 `POST repos/<仓库>/issues`，挂子 issue 用 `POST repos/<仓库>/issues/<根号>/sub_issues`，`sub_issue_id` 是 issue 的数据库 id（REST 返回的 `id`），不是号。不用 GraphQL、不用 `search/issues`、不用 `gh issue view`（cloud 会话里都被拒）。
- 不发评论、不改 label、不关 issue。每次合了什么、为什么合，写在这次运行的会话里；没有可合的就写「无」。
- 不改仓库文件、不提交、不开 PR。

**setup 新增一节「整合定时任务」**（放在已有的定时任务小节旁边）：

1. 打印装 Claude GitHub App 的链接 `https://github.com/apps/claude/installations/new`，说明只装在要整合的这个仓库上、这一步只能人在 GitHub 上点；等人说装好。
2. 用 RemoteTrigger 建 cloud 定时任务：cron `7 */6 * * *`（按 UTC 读，偏开整点），仓库是目标仓库，prompt 是上面那份（仓库名填进去）。
3. 建完清掉任务上挂的全部连接器（新建的任务默认挂上账号在 claude.ai 上连的所有连接器，整合任务一个都不用）。
4. 「Run now」跑一次冒烟测试，告诉人去侧边栏 Scheduled 组看那次运行的会话、核对合并结果。
5. 没有 RemoteTrigger 工具、或人拒绝：把 prompt 和以上设置原样给人，记「未做」及原因。

setup 的「交回」一节加一行：整合任务建没建（任务 id、cron）、连接器清没清、冒烟跑没跑。setup 的 description 只在必要时补一个词，保持只做路由。

## 验收标准

- [x] setup 有一份整合任务的 prompt，覆盖：只整合待验证且无父 issue 的、两条判组依据带例子、挂到已有根或新开根、根正文首行写出处、只走仓库范围 REST（三个接口写全，`sub_issue_id` 用数据库 id）、不发评论、合并理由写进运行会话
- [x] setup SKILL.md 新增整合定时任务一节：App 安装链接、RemoteTrigger 建任务（`7 */6 * * *`）、清连接器、Run now、没工具 / 人拒绝时的退路；「交回」一节有对应的一行
- [x] setup SKILL.md 主体在 5000 字以内（超了就把长的部分放进 setup 自己的参考资料）
- [ ] ⏭ 延后 → PR 交付验收：真 cloud 冒烟（spec「测试决策」增量用例 4：装好 App、Run now，测试仓库里两个改同一个 SKILL.md 的待验证 issue 被挂到一个新根下，根首行写出处，没有任何评论，运行会话写了合并理由）
- [x] review 第 1 轮 S1（2026-10-30）：整合任务只往还没开工的根下挂——「现成的根」要求根自己没有 `status:*` label（还是待验证）；根已经开工（验证中及以后）就新开一个根或不动。依据 spec「只整合待验证的 issue；验证中及以后的不动」。「要建什么」里同一句一起改

## 选中的存量回归

- `idea-loop/scripts/no-project-leak.test.mjs`：prompt 里举的 Toeflair / 本仓库例子不能变成写死的规则，确认它不报。
- `idea-loop/scripts/skill-private-references.test.mjs`：新参考资料只由 setup 读。
