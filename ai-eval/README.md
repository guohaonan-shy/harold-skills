# ai-eval plugin

判断一次 AI 流水线的改动（提示词、模型、思考预算）有没有让产物变差：把候选放进产品自己的流水线，在一组固定样本上跑，用确定性断言加 Codex 判官打分，和存好的线上基线比，对着项目 `EVAL.md` 里写的准出标准判过或不过。

插件里不写任何项目的名字、路径或数字。项目的事实（命令、存放处、样本的问题类型、准出标准）只写在项目根目录的 `EVAL.md` 里，由 `eval-setup` 生成。

## 安装

```
/plugin marketplace add guohaonan-shy/harold-skills
/plugin install ai-eval@harold-skills
```

然后在目标仓库里调 `ai-eval:eval-setup`，生成 `EVAL.md`。

## 依赖

下面两样是插件声明的依赖，不抽象成可替换的后端：

- **PostHog**：存样本（dataset）和判官 scorer 的定义。读 LLM analytics 需要 `POSTHOG_PERSONAL_API_KEY`，凭据的位置写在项目的 `EVAL.md`「费用与额度」。
- **Codex**：当判官。每个 scorer × 样本起一次全新的 `codex exec`，判官走 Codex 订阅，调用环境里会扣留 `OPENAI_API_KEY` 和 `CODEX_API_KEY`。

## Skills

| Skill | 什么时候用 | 用法示例 |
|---|---|---|
| `ai-eval:eval-setup` | 第一次在项目里用、或评测的存放处、用户任务、判官配置、准出标准有变 | 「给这个项目建 `EVAL.md`」：读项目的代码和文档，写出 `EVAL.md`，读不到的列成待确认清单问你 |
| `ai-eval:eval-run` | 改一个 AI 任务的提示词、模型或思考预算 | 「我要改摘要任务的提示词，跑一次实验」：先评估现有样本和指标看不看得出这次改动，再开两段式实验、诊断、写报告，放量前核对基线 |
| `ai-eval:eval-samples` | 看每个 case 有几个样本、往评测集加样本或期望 | 「数一下覆盖」「加一个超长输入的样本」：数出缺口、逐条提议，你同意才入库 |
| `ai-eval:eval-baseline` | 候选全量上线后升基线、新用户任务建第一份基线、加了样本之后补基线 | 「候选全量上线了，升基线」：先报规模等你同意，再按新的生产配置重跑 |
| `ai-eval:eval-judge` | 实验到了判官这一步、重判某几个 scorer 或样本、结束判官会话 | 「重判 `tone` 这个 scorer」：生成判官任务、起判官、还原分数 |
| `ai-eval:eval-metrics-review` | 一个用户任务接入评测之前、改了判官 scorer 之后、判官的分总是不稳 | 「审一下这个用户任务的判官」：出保留、改写、挪成确定性断言、删掉四种结论的表，交你拍板 |

## 目录

- `skills/`：6 个 skill。
- `references/`：`judge-format.md`（判官用到的文件格式）、`judge-prompt.md`（判官的固定提示）。
- `scripts/`：判官流水线（`judge-pack` / `judge-run` / `judge-validate` / `judge-settle` / `judge-launch` / `judge-agreement`）、配对统计 `paired-stats`、覆盖统计 `coverage`、`read-json`，每个脚本旁有同名的 `.test.mjs`；`no-project-leak.test.mjs` 守着插件里不出现任何项目的名字和领域词。

跑测试：

```
node --test 'ai-eval/scripts/*.test.mjs'
```
