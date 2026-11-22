# 起调度

人敲 `/idea-loop:issue-dispatch`（在哪个目录都行）时按下面四步做完，再做第一轮。定时到点调起的轮次不走这里。完成条件：`dispatch-home` 开着，`DISPATCH.md` 在 home 里，旧的 `dispatch-<仓库名>` 任务都停用了。

1. **建任务**：用『定时任务』在 home（`~/home`）建，已有就更新：任务 id `dispatch-home`，标题 `issue 调度`，cron `7,37 * * * *`（每 30 分钟，分钟避开 0 和 30），prompt 调起 `idea-loop:issue-dispatch`（写法照『定时任务』里的 prompt 写法，不带参数），工作目录 home。汇报里写下次运行的时间。
   - 模型：`SKILL.md` 不在开头钉模型和思考强度。汇报里提醒人：在运行环境里把 `dispatch-home` 的模型手动选成 Sonnet（在哪里选，照『会话管理』「调度」里写的）。
2. **`DISPATCH.md`**：
   - home 根目录没有就建一份，内容是下面的默认值，再 `dyna home commit "dispatch: DISPATCH.md" DISPATCH.md` 提交到 home：

     ```
     | 时段 | 派什么 | 每轮最多新开 |
     |---|---|---|
     | 09:00–19:00 | triage | 3 |
     | 22:00–08:00 | todo | 1 |

     | 状态 | 同时开着最多 |
     |---|---|
     | triage | 6 |
     | in-progress | 不设 |
     | in-review | 不设 |

     不调度的项目：
     ```

   - 项目清单里（`dyna home projects`）哪个项目的 `ISSUE_TRACKER.md`（项目目录下）还有「调度」一节，就先把这一节的数并进 `DISPATCH.md` 之后的样子，和改前的 `DISPATCH.md`，一起摆给人看（改前改后），人同意后才写入：旧表的「上限」并进时段表的「每轮最多新开」，状态表照默认；几个项目的旧表不一样，逐个列出，让人选用哪一份。写入后删掉那个项目 `ISSUE_TRACKER.md` 里的「调度」一节，两处一起 `dyna home commit`。人不同意就都不动，汇报里写明。
3. **停用旧任务**：『定时任务』列出已有的，id 是 `dispatch-<仓库名>` 的逐个停用（只停用，不删）。不停的话旧任务和 `dispatch-home` 各跑各的，会给同一个 issue 各开一个会话。汇报里列出停了哪几个。
4. **第一轮**：立刻照 `SKILL.md` 的「每一轮」做。
