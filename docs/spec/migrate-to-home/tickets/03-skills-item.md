# 03 — 清理用户级 skill：`dyna home config` 的 skills 项

**Blocked by**：01（同一个命令加项的写法）
**设计冻结**：不涉及 UI

## 要建什么

人跑 `dyna home config plan --only skills`，看到 `~/.claude/skills/` 下每个 skill 一行：名字、是不是软链、软链指向哪、近 30 天的会话记录里被调用几次、去留（空，人填）。人在 plan 的 JSON 里给每行填「留」或「删」，存成文件，跑 `dyna home config apply --only skills --plan <文件>`：

- 先把整个 `~/.claude/skills/` 备份进 `<home>/.backup/<时间>/skills/`（软链照软链备份，同时备份 plan 文件）。
- 「留」的复制进 `<home>/skills/<名字>/`：软链复制它指向的内容，home 里存实体。
- 「删」的删掉 `~/.claude/skills/` 下那个目录或软链本身；软链指向的内容不动。
- 没填去留的行不动，执行结束报出来；这样的行还在时 `~/.claude/skills` 不换（不然它们会丢），只报「还有没定的行」。
- 全部行都定了、做完后，把 `~/.claude/skills` 换成指向 `<home>/skills/` 的软链（先建好再改名替换，中途不出现没有 `~/.claude/skills` 的时候）。
- 提交 `<home>/skills/`，message `chore: 用户级 skill 搬进 home`。
- `~/.claude/skills` 已经是指向 `<home>/skills/` 的软链：出表状态「已是」，执行什么都不做。
- 调用次数：数 `~/.claude/projects/*/*.jsonl` 里近 30 天（按记录的时间戳）`Skill` 工具调用、参数里 skill 名等于这一行名字的次数。

插件里不写任何具体 skill 的名字（`no-project-leak` 守着）：留哪几个由人在 plan 里填。

## 验收标准

- [x] 临时 `HOME` 下假 `~/.claude/skills/`：一个要留的软链、一个要留的目录、两个要删的；一份假会话记录在 30 天内调用过其中一个、40 天前调用过另一个：出表四行，标出软链指向，调用次数一个 1、其余 0。
- [x] plan 里两个留、只给一个删、另一个不填：执行后备份里四个都在，留下的两个在 `<home>/skills/` 且是实体，填了删的那个没了，没填的还在并报出来，`~/.claude/skills` 还不是软链。
- [x] 把最后一行填成删再执行：它没了，`~/.claude/skills` 是指向 `<home>/skills/` 的软链，home 多一个提交；软链指向的原内容还在。
- [x] 第三次执行什么都不改。
- [x] 不带 `--only` 的 `plan` 仍是四行；`cd dyna && go test ./internal/home/...` 全过。

## 选中的存量回归

- `dyna/internal/home` 的 config 测试：同一个命令加项。
- `idea-loop/scripts/no-project-leak.test.mjs`：插件里不许出现真实 skill 名。
