# records
> 契约：运营台账——会话起头、之后由人持续更新的记录；文件用 `type: record`，不进 spec 的生命周期，也不在 dreaming 里删。

| 目录 | 收什么 | 谁写 | 谁读 |
|---|---|---|---|
| `retro-candidates/` | `idea-loop:retro` 里人批了、选「进候选池」的规则候选，一条候选一份文件。落点是插件（idea-loop 的 skill、agent、reference、脚本）的，在 harold-skills 的池里；落点是项目自己规则文件的，在项目自己的池里 | retro 写入新的一份，或在已有那份的「出现」里追加一行；人批了、推翻了的也在 retro 里改 | dreaming 读它、数次数、把攒够的提议开成 issue，并改「状态」 |

## `retro-candidates/` 里一份文件的形状

- frontmatter：`type: record`、`captured`、`title`、`tags`。
- 依次：信号、落点、旧文、新文、归并、验证、例子，各一条 bullet。「验证」写改完怎么证明它治好了当时的问题：回放用例三样（当时的提交、那句 prompt、一道是/否题）/ 检查的名字 / 「判不了」加原因。早先的文件没有「归并」「验证」两条，不回填，读池的脚本照旧收。
- 一条 bullet `- 状态：…`，闭集：`在池里` / `已开 issue（<链接>）` / `驳回（<理由>）`。开过 issue、驳回的不删，留作以后数次数时认得出。
- 一节 `## 出现`，每次出现一条 bullet：`<仓库>#<issue 号>（<日期>）：「<逐字原话>」；决定记录：<链接>`。后来被人推翻的那一行不删，在行尾加 `（已推翻：「<推翻时的原话>」）`。

次数不靠人数：`node idea-loop/scripts/retro-pool-count.mjs docs/records/retro-candidates` 读整个池，按 JSON 输出每份的次数、状态和是否过门槛（出现次数 ≥ 3，依据是人在 Tofelair#538 里的原话「出现超过两次」）。次数是「出现」里不同会话（`<仓库>#<号>` 不同）的行数，去掉标了已推翻的；形状不对的文件列成问题、退出码非零。
