# 规则回放跑完之后

`retro-replay.mjs --run-large` 退出后，它的输出写着结果进了哪个文件。读那份 review loop 文件里新的 `规则回放` 条目核实（runner 不发会话消息，也不发通知），再按结果走：

- **全过**：条目已是处理完的状态（`review-loop.mjs check` 不列它）。回到「没活了就停下」：没有别的挡着就 `gh pr ready` 进 `idea-loop:pr-review`。
- **有不过的**（含退出码 4、5：判定或某个会话没给出结果，条目里记着）：停下，不进 review。把没过的用例、判定会话在改前改后各答了什么和出处摆给人，选项就是条目里的三个处理（判定对 / 判定错 / 用例有问题），等人批示；人的批示照「人回复后」处理。
- **runner 不认 `--run-large`**（报 `unknown argument`）：`~/.idea-loop/bin/` 里是旧版拷贝，先跑插件的 `scripts/retro-install.mjs` 重装（即 `/idea-loop:setup` 的「规则回放 runner」那一步），再跑。
