# 02 — 候选只出 P0 和本期焦点，P2 另取

**Blocked by**：01 — seo 不再单独排队
**设计冻结**：不涉及 UI

## 要建什么

调度取候选时按价值排：先是带 `priority:P0` 的（根，或没有父 issue 的 issue），再是标题在「本期焦点」里的根，各自按号从小到大。焦点写在业务的 `ISSUE_TRACKER.md`（知识库根；老布局就是仓库根）的「本期焦点」一节，一行 `本期焦点：模块甲、模块乙`，用顿号隔开，根的标题与其中一个完全相同才算。没有这一节或这一行空着：只出 P0。子 issue 不出、带 `Idea` label 的不出（label 名比较不分大小写）、spec issue 不出、被 spec 列着的不出；开了不到 6 小时就不出的那条等待整个删掉。

另有一个取 P2 的方式：同样范围里不带 P0、不在焦点、不是想法的，按号从小到大。

建 label 时多建 `priority:P0` 与 `Idea`，两者都不算多余 label。对账时，根自己不带 P0、但它开着的子 issue 里有带 P0 的，给根加上 `priority:P0`，并在对账输出里说一行。

文字同步：spec 状态 skill 里「候选只出根，不出开了不到 6 小时的」和命令清单改成新的行为；setup 写 `ISSUE_TRACKER.md` 的模板带上「本期焦点」一节（留空，说明怎么填）；本仓库的 `ISSUE_TRACKER.md` 加这一节（留空）。

## 验收标准

- [x] 假 gh 给出 #1（P0，无父）、#2（根「Email 报告」）、#3（根「付款」）、#4（#2 的子 issue）、#5（`Idea`）、#6（无父、P0、刚开 1 分钟）、#7（无父、无 label），焦点「Email 报告」：候选是 [1, 6, 2]
- [x] 同一组数据取 P2：[3, 7]
- [x] 没有「本期焦点」一节：只出 P0
- [x] 焦点 `idea-loop/engineering`，根 `idea-loop/engineering` 出、根 `idea-loop/design` 不出
- [x] 根 #2 不带 P0、子 #4 带：对账给 #2 加 `priority:P0`
- [x] 仓库里没有 `priority:P0`、`Idea`：建 label 时两个都建出，不列为多余
- [x] 全量测试通过

## 选中的存量回归

- `issues.test.mjs` 的候选、建 label、对账几组：改了同一批函数
- `setup-single-source.test.mjs`：setup 的模板改了
