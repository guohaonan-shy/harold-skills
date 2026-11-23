---
type: adr
status: 生效
tags: [idea-loop, retro, replay, replay-gh-isolation]
summary: 规则回放起的每个子进程（worker、两路判定）一律不带 gh 登录，读不到用例提交之后的线上 issue 与 PR
related: ["[[275]]", "[[0028-retro]]", "[[0052-replay-run-large-now]]"]
---

# ADR-0075 — 规则回放：worker 和判定会话不带 gh 登录

> 由 spec `replay-gh-isolation` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

规则回放（`idea-loop/evals/retro/retro-replay.mjs`，见 [[0028-retro]]）把项目拷到某个用例的提交，让 worker（`claude -p`）在里面重演当时那一步，改前、改后各一遍，再由判定会话回答一道是/否题。项目副本停在过去，但 worker 用的 `gh` 还是跑回放这台机器的登录态，能读线上 issue 和 PR 的现在。

真实例子（#275 原文）：用例 `draft-spec-orphan-capability` 的项目停在提交 `b9602e50`，issue 还没起草 spec。2026-11-10 #148 工单 01 的回放里，改后那一遍的 worker 查 GitHub，读到这个 issue 已被关成 completed、评论写着「spec 已实现并合并」，并在汇报里引用。分拣时（2026-11-13）把 `docs/` 用 `git archive` 解成无远端副本，`gh issue view 148 -R guohaonan-shy/harold-skills` 同样读到后来的状态。

影响：13 个用例的 prompt 只禁了「gh 的任何写操作」，读没禁；凡 prompt 里点名 issue 的用例都能这样读到后来的事。改前那一遍若读到「后来人决定删掉」并照抄，改前就答「是」，用例会被误判成「没抓住问题」。当时实测读到的只有上面 1 次。根因：runner 起子进程时把自己的整个环境原样传下去，没清 token 也没换 `GH_CONFIG_DIR`。

## 2 决策（how）

- **隔离在环境层，不在 prompt 层。** 不往 worker prompt 里加「别查线上」，因为已有测试钉着「worker prompt 只有人的原话，不说自己在被测」，加一句会泄露它在回放里。
- **一份环境给所有子进程**：worker、Claude 判定、Codex 判定用同一个函数造出的环境。做法：去掉 `GH_TOKEN`、`GITHUB_TOKEN`、`GH_ENTERPRISE_TOKEN`、`GITHUB_ENTERPRISE_TOKEN`，把 `GH_CONFIG_DIR` 指到本次 run dir 下一个空目录，`gh` 就报「未登录」退出 4（本机实测）。其余环境（`PATH`、`HOME`、`CLAUDE_CONFIG_DIR` 等）照传，worker 要靠它们找到 claude 的登录。
- 取舍（没做）：`evals/uiux-research/run.mjs` 排除（项目是最小产品上下文，不存在读到之后的事）；删掉 13 个用例 prompt 里「不要 gh 写操作」那句不做（是用例输入的改写，要走用例的「prompt 改写记录」）。
- **已知限制：不拦公开仓库的网页读法。** worker 理论上能用 WebFetch 或 `curl` 读 GitHub 网页拿到同样的现状；没观察到任何一次回放这样读；拦它要禁网络、会误伤要上网的用例。记下，真出现了再开 issue。
- 合并前没有实跑付费回放确认「gh 报未登录后会话照常走到停点」（人说「合并」）；留到下一次真回放时看。

## 3 结果（result）

- `idea-loop/evals/retro/replay.mjs` 导出 `replayChildEnv(env, ghConfigDir)`；`idea-loop/evals/retro/retro-replay.mjs` 在每个 run dir 建 `gh-config` 空目录，用同一份 `childEnv` 起 worker、Claude 判定、Codex 判定。
- 合并在 PR #354（规则回放：worker 和判定会话不带 gh 登录），#275 已关闭；决定记录 [[275]]。
- 守护：`idea-loop/scripts/retro-replay.test.mjs` 里 `replayChildEnv` 的单元测试（四个 token 被去掉、`GH_CONFIG_DIR` 指向给定空目录、其余照传、入参不被改）和 e2e 的假 `claude` / 假 Codex 记下各自看到的 gh 变量；本次对账该文件 78 条全过。
