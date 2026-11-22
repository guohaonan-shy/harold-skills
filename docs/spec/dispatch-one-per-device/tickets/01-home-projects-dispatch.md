# 01 — 命令行能列出这台设备的全部项目、读出整台设备的调度表

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

调度会话开在 home 里，要从一处拿到两样东西：这台设备登记了哪些项目、此刻该派什么和各状态的上限。现在命令行只能按单个项目查（`home where`），调度表还写在各项目自己的 issue 跟踪说明里（`issues queues` 读）。

这一刀让命令行的 `home` 模块多两个命令，`issues queues` 不再管时段：

- **`dyna home projects`**（JSON）：项目清单（home 的 `AGENTS.md`「## 项目」一节）里每一行一个对象：名字、项目目录、知识库目录、`owner/repo`、登记的本地 clone 路径和展开 `~` 后的路径、`inHome`（项目目录下有 `docs/` 才算搬进了 home）；没搬进的带一个原因码和一句原因（沿用 `home where` 已有的 not-moved / not-connected 判法和句子）。顺序同清单。
- **`dyna home dispatch [--at=HH:MM]`**（JSON）：读 home 根目录的 `DISPATCH.md`，没有这个文件就用默认值。给出：此刻 `at`、所在时段 `period`（开始、结束；空档为 null）、`dispatch`（`triage` / `todo` / null）、`perRound`（这一时段每轮最多新开几个，空档为 0）、`caps`（triage、in-progress、in-review 三个状态各自同时开着最多几个，「不设」为 null）、`skip`（不调度的项目名列表）、整张时段表 `periods`、三个分组名 `sections`。
- **`DISPATCH.md` 的格式**：两张表加一行。时段表三列「时段 | 派什么 | 每轮最多新开」；状态表两列「状态 | 同时开着最多」，值是正整数或「不设」；一行「不调度的项目：<名字，逗号分隔>」，空着就是全部调度。时段的读法照现有规则（左闭右开、开始晚于结束即跨午夜、没覆盖的时间不派、重叠时靠前的一行算）。默认值：09:00–19:00 triage 每轮 3；22:00–08:00 todo 每轮 3；triage 上限 6、in-progress 与 in-review 不设；没有不调度的项目。读不出的行报错，指出 `DISPATCH.md` 第几行、哪一格、该怎么写。只写了部分表的，缺的那张用默认。
- **`dyna issues queues <docs>`**：去掉 `dispatch`、`limit`、`period`、`periods`、`at`，只留三个分组名 `sections`；`--at` 去掉。时段的解析整体挪到 `home dispatch`，不留两份。
- 命令改了，命令行版本升一档，新版本的命令登记表存进仓库。

## 验收标准

- [ ] 临时 home、没有 `DISPATCH.md`：`dyna home dispatch --at=10:00` 给出 triage、每轮 3、triage 上限 6；`--at=23:30` 给出 todo、每轮 3、in-progress 上限 null；`--at=20:00` 给出 dispatch null、每轮 0。
- [ ] 跨夜与边界：`--at=08:00` 不派、`--at=22:00` 派 todo、`--at=19:00` 不派、`--at=09:00` 派 triage。
- [ ] `DISPATCH.md` 写了「in-progress | 4」和「不调度的项目：Foo, bar」：`caps` 的 in-progress 是 4、`skip` 是 `["Foo","bar"]`；写「不设」的状态是 null。
- [ ] `DISPATCH.md` 里有一行读不出（派什么写了 `done`、每轮写了 0、状态写了不存在的名字、上限写了负数）：命令退出非 0，报错指出第几行并说该怎么写。
- [ ] 临时 home、项目清单两行，一个项目目录有 `docs/`、一个没有：`dyna home projects` 两行都在，顺序同清单，第一行 `inHome: true` 带全部路径，第二行 `inHome: false` 带原因码和原因句。
- [ ] 不带 home 的 `AGENTS.md`、或清单为空：`dyna home projects` 输出空数组，退出 0。
- [ ] `dyna issues queues <docs>` 只输出 `sections`；原来测时段的测试挪到 `home dispatch` 下并仍然通过。
- [ ] 版本升了一档，新版本的登记表已存，`dyna registry --json` 里有 `home projects`、`home dispatch`，且登记表测试通过。
- [ ] `cd dyna && go test ./...` 全过。

## 选中的存量回归

- `dyna/internal/issues` 的时段测试（`schedule_test.go`）：时段解析从这里挪走，挪丢一条边界就会漏掉。
- `dyna/internal/home` 的 `where` / 项目定位测试（`home_test.go`、`project_test.go`）：`projects` 复用同一套清单解析和判法，改动可能牵到 `where`。
- `dyna/internal/app` 的登记表测试（存的那份要等于命令树）。
