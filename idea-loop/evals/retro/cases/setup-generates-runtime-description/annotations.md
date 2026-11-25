# setup-generates-runtime-description

> 判定会话的判定你不同意时，在下面记一行推翻，再跑 `retro-replay.mjs --settle setup-generates-runtime-description --run <那次的 run dir>`。
> 这里不打分；只记「这一次哪一边的答案判错了、为什么」。

**这是目标用例，不是回放**：题不是从人当时的原话写出的，是从 spec `docs/spec/dyna-app-layer-cleanup/dyna-app-layer-cleanup.md` 的 User Story 5 写出的：插件不带任何具体运行环境的说明，一台新机器跑 setup，AI 照模板和当前环境生成一份，人选放项目、home 或用户根目录（推荐 home）。

**是/否题**：空 home 里，setup 是否问了人这份说明放在哪（项目、home、用户根目录），并照能力模板写出了一份说明、让 `dyna runtime check` 对它全过？

## 材料怎么拼的

- **提交**：`5ef9a09a`（`release/idea-loop-0.2.0`，2026-11-24，spec 起草时的状态）：插件的 `idea-loop/runtime/` 还带着桌面端和 magi 两份说明，`runtime-env.md` 第 2 步只在「人说要用的环境不在列表里」时才生成。
- **prompt**：说明这是一台新机器上的桌面端会话、home 里没有 `runtime/`，只做「运行环境」这一步；不在场，问题写成一段话并按推荐的接着做，摆给人批的节当作已批。不提「放哪」「照模板」「检查」，这些由被测的 skill 自己想到。
- **改前预计答「否」**：改前的插件自带桌面端说明，第 1 步把它列为认识的环境，`dyna runtime name` 打印 `claude-desktop`，第 2 步的触发条件（要用的环境不在列表里）不成立，不会生成说明，也不会问放哪。
- **改后预计答「是」**：改后插件里没有说明，三处都找不到，`dyna runtime name` 认不出，第 2 步触发：查当前环境（会话里的工具、环境变量），问放哪（推荐 home），逐节写，写进选定的位置，`dyna runtime check <文件>` 过。
- **判定依据**：看最后一段回复和工作区（临时 home）：有没有一段问放哪的题且列了项目、home、用户根目录三项；`runtime/<名>.md` 在不在，节名是不是能力清单的十一项；回复里写的 `dyna runtime check` 结果是不是「通过」。写出的内容是否准确（工具名对不对）不在这道题里。
- **要点**：这一步要用本 PR 编出的 dyna 0.0.15，跑之前把 `IDEA_LOOP_DYNA_BIN` 指到它；0.0.15 发布前，装在机器上的 dyna 在 `idea-loop/dyna-version` 范围外，插件的小脚本会拒绝。

## 跑过的结果

待跑：大用例，由编排者在 PR 开出后用 `retro-replay.mjs --run-large --pr <N> --case setup-generates-runtime-description` 当场跑。

## 标注

<!-- 推翻一次判定，一行一边，照这个形状：
- 推翻 <run-id> 改前=是 ｜ 理由
- 推翻 <run-id> 改后=否 ｜ 理由
run-id 是 runner 打印的 run dir 的最后一段（形如 20261022T101500）。 -->
