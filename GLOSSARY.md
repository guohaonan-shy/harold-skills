# harold-skills

Harold 的 Claude Code skills 集合；这里的词条是在这些 plugin 的通用流程里流通的概念。

## 术语

### 运行环境

**运行环境**：
跑 idea-loop 会话的宿主，它决定会话里有哪些工具可用，例如 Claude 桌面端、magi。
_Avoid_: 环境（单说会跟开发环境、dev 环境混）, 工作环境、执行环境（0.2.0 计划里的旧叫法）, workspace, 宿主, host, platform

**能力**：
通用流程要运行环境替它做的一类操作，例如定时任务、会话管理；每个运行环境对每个能力要么给出做法，要么写明没有。
_Avoid_: 工具（工具是能力在某个运行环境里的具体做法）
