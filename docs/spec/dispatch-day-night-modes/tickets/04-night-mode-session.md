# 04 — issue 会话的夜间模式：不停下问人，做到 review 完

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

调度夜里开出的 todo 会话，任务里写着「夜间模式」。这样的会话一路做到 PR review 完、停在等人说合并，中间不因为要人定的事停下：

- `issue-session` 加一份参考讲夜间模式，正文只加一行：任务里写了「夜间模式」就照那份参考做（正文现在接近 5000 字上限，不能写进正文）。
- **开 PR 之前不停下问人**：要人定的，照 `decision-rules` 按推荐定；每条写进 PR 描述的「夜里替你定的」：选了什么、为什么、另一种是什么。
- **停下等人的只有**：合并 PR、删分支或数据、强推、对外发信或在别人的仓库评论、碰这个 issue 以外的项目。碰到了写进 PR 描述的「等你定的」，停下；会话留在 in-progress。
- **做到哪停**：`pr-review` 跑完一轮、PR 转 ready、会话移进 in-review，停在等人说合并。夜里不做 retro、不归档，白天人在场时做。
- 对 `implement` / `pr-review` / `pr` 里会停下问人的地方，参考里说清夜间模式下各自怎么走（例如实现卡住的「要你决定」改成按推荐定并记进「夜里替你定的」）；需要的话 `pr` 的 PR 描述格式加上「夜里替你定的」「等你定的」两小节的写法。

## 验收标准

- [ ] `issue-session` 正文有一行指向夜间模式参考，正文主体 < 5000 字
- [ ] 夜间模式参考写明：不停下问人、按推荐定并记进「夜里替你定的」、只在列出的五类事上停、停在 review 完的哪一点、不做 retro 和归档
- [ ] PR 描述格式说明了「夜里替你定的」「等你定的」写在哪、每条写什么
- [ ] 一个文字 tripwire 测试守住：参考存在、正文指到它、五类停下的事都列着
- [ ] 插件全部测试绿（含 `no-project-leak`）

## 选中的存量回归

- `idea-loop/scripts/issue-session-implement-doc.test.mjs`：读 issue-session 正文。
- `idea-loop/scripts/pr-body.test.mjs`、`idea-loop/scripts/pr-flow-doc.test.mjs`：PR 描述加小节时可能碰到节名与顺序。
