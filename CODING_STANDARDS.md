# 代码规范

review 按这份文件和它链接到的文档审代码规范。每条写成照着就能判断对错的规则；只有写下来的才算规则。领域词汇在 `GLOSSARY.md`，架构上为什么这样定在 `docs/adr/`。

## 分层

每个顶层目录是一个独立的 plugin，plugin 之间不互相引用文件；只有 idea-loop 例外地带 `hooks/`、`.mcp.json`、`agents/`、`evals/`（见 `AGENTS.md`）。

## 文件划分

照 `AGENTS.md` 的「标准 plugin 目录结构」；idea-loop 的 skill 按 `skills/{engineering,design,productivity}/<slug>/` 放，参考资料归一个 skill（见 `idea-loop/AGENTS.md`）。脚本放 `<plugin>/scripts/`，测试紧挨着写成同名 `*.test.mjs`。

## 命名

skill 目录名是 kebab-case 的 slug；脚本与测试是 `<名字>.mjs` / `<名字>.test.mjs`。

## 链接

- `AGENTS.md`：仓库级约定——plugin 目录结构、SKILL.md 编写约定、eval 策略、构建新 skill 的流程
- `idea-loop/AGENTS.md`：idea-loop 的 skill 分类、参考资料归属、登记方式
- `idea-loop/skills/productivity/writing-for-agents/`：skill、agent 定义、AGENTS.md 的写法
