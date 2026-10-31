# 候选池：形状、怎么读、怎么写

人批了、选「进候选池」的规则候选，一条一份文件，放在 `<docs>/records/retro-candidates/`（`type: record`）。池按落点分仓库：落点是插件（idea-loop 的 skill、agent、reference、脚本）的，在 `guohaonan-shy/harold-skills` 的池里；落点是目标仓库自己规则文件的，在目标仓库自己的池里。retro 写入新的一份、或在已有那份的「出现」里追加一行；`dreaming` 读它、数次数、把攒够的提议开成 issue，并改「状态」。

## 一份文件的形状

```markdown
---
type: record
captured: <YYYY-MM-DD>
title: "retro 候选：<一句话，要改什么>"
tags: [retro-candidates]
---

> 来自 <仓库>#<issue 号> 的 retro（<日期>）。人批了，去处选「进候选池」。

- 信号：纠正与追问 / 对题的选择 / 人自己说的方向（<补一句是什么情形>）
- 落点：<插件 skill 名 / 目标仓库的哪个文件 / 哪个检查>
- 旧文：<现在写的，原文；没有写「无」>
- 新文：<改成的，原文>
- 归并：<它是哪条已有原则的特例（没有写「无」）>
- 例子：<这场会话里它是怎么出现的，一两句>
- 状态：在池里

## 出现

- <仓库>#<issue 号>（<日期>）：「<逐字原话>」（<当时在哪一步>）；决定记录：[[<决定记录的文件名>]]
```

- `状态` 是闭集：`在池里` / `已开 issue（<链接>）` / `驳回（<理由>）`。你写入时只写 `在池里`，另外两种由 `dreaming` 和人改；开过 issue、驳回的不删，留作以后认得出。
- `出现` 每次一行，行首必须是 `- <仓库>#<号>`：计数脚本按它数「不同会话」。同一场会话的两行只算一次。后来被人推翻的那一行不删，在行尾加 `（已推翻：「<推翻时的原话>」）`，它不再算数。
- 原话逐字，核过 digest 再写。
- 文件名：`<YYYY-MM-DD>-<主题 slug>.md`；slug 在 `docs/` 里全局唯一（建之前 grep 一遍）。
- 次数不靠人数：`node "${CLAUDE_PLUGIN_ROOT}/scripts/retro-pool-count.mjs" <池目录>`，按 JSON 输出每份的次数和是否过门槛（≥3），形状不对的列成问题、退出码 2。写完一份就对那个池跑一遍，确认没有问题。

## 判同类

候选「同类」写池里的哪一份，按决定记录「情形 / 处置」的读法（[decision-record.md](decision-record.md) 的「读它的规矩」）：落点相同，再读池里那一份的旧文、新文、例子，核对要改的是不是同一件事，不看措辞像不像。拿不准就写「池里没有」，宁可多一份，不并错。「同类」的 N 是那一份现在的次数加 1，次数以计数脚本为准。

## 摆给人时怎么回

- **去处由人定，你不给推荐。** 依据是人的原话：「我觉得retro过程中进入候选还是直接进入issue需要由我来判断」。
- 人只回了「批」、没说去处，问一句去哪；人用了别的说法（例：「留在候选吧」）按意思归到「批·进候选池」或「批·开 issue」，拿不准就问。
- 回了「改成…」的，改完再摆一次，同样二选一。
- 候选「同类」写了池里的一份时，摆的时候说出来：「这是第 N 次，并进 <那一份>」。

## 读当前仓库的池

列出每份的标题、落点、状态、次数：`node "${CLAUDE_PLUGIN_ROOT}/scripts/retro-pool-count.mjs" <docs>/records/retro-candidates`；目录不存在就是还没有。retro 就跑在 harold-skills 里时，当前仓库的池和 harold-skills 的池是同一个，不用再远程读。

## 写进当前仓库的池

- 新建一份：按上面的形状写，「出现」一行，是这场会话。
- 「同类」写了那一份的：在它的「出现」末尾加一行，别的不动（形状、状态、旧文新文都不改；你觉得旧文新文该改，说给人，由人定）。

写完跑计数脚本，把那一份的新次数报给人。

## 读与写 harold-skills 的池（retro 不在 harold-skills 里跑时）

不检出，用 `gh`。下面 `<R>` 是 `guohaonan-shy/harold-skills`，`<D>` 是它的默认分支（`gh repo view <R> --json defaultBranchRef --jq .defaultBranchRef.name`）。

读：

```
gh api repos/<R>/contents/docs/records/retro-candidates --jq '.[].name'
gh api -H 'Accept: application/vnd.github.raw' repos/<R>/contents/docs/records/retro-candidates/<文件名>
```

把读到的文件放进 `.tmp/retro/<YYYY-MM-DD>-<主题>/harold-pool/`，再对那个目录跑计数脚本。

备好要写的文件（第 5 步）：新建的按上面的形状写在 `harold-pool/` 下；追加的，在读下来的那份末尾加一行「出现」。先记下文件路径，池里那一份的链接（`https://github.com/<R>/blob/<D>/docs/records/retro-candidates/<文件名>`）在第 6 步合并后补进决定记录的「结果」。

写（第 6 步，只改 `docs/` 的 PR）：

```
gh api repos/<R>/git/ref/heads/<D> --jq .object.sha
gh api repos/<R>/git/refs -f ref=refs/heads/docs/retro-pool-<日期>-<主题> -f sha=<上一步的 sha>
# 新建：不带 sha；追加：带上现有文件的 sha（contents 接口返回里的 .sha）
gh api -X PUT repos/<R>/contents/docs/records/retro-candidates/<文件名> \
  -f message='docs(records): retro 候选 <一句话>' -f branch=docs/retro-pool-<日期>-<主题> \
  -f content="$(base64 < <备好的文件>)" [-f sha=<现有文件的 sha>]
gh pr create -R <R> --head docs/retro-pool-<日期>-<主题> --base <D> --title ... --body ...
```

检查全过就合并（`gh pr checks`，再 `gh pr merge`；合并方式照 harold-skills 的 `DEVELOPMENT.md`「分支」一节）。任何一步开不成（没有权限、检查红、冲突），记下原因，把这条候选的全文留在这场的决定记录里交给人，不重试到成功为止。
