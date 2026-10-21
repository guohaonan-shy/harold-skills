# 从平铺布局迁移

旧布局是 `docs/spec/<slug>.md` 平铺、所有 spec 的工单共用 `docs/spec/tickets/`。一次性迁过去，做成一个 `docs(spec): 每份 spec 一个目录` 提交：

1. 每份 `docs/spec/<slug>.md` 用 `git mv` 挪到 `docs/spec/<slug>/<slug>.md`。wiki-link 按文件名解析，移动不打断它们；相对路径的图片引用会断（spec 深了一层），每条前面补一个 `../`，改完逐条确认文件存在。
2. `docs/spec/tickets/` 下的每张工单，按它的 PR、它引用的 spec 或它的标题判断属于哪份 spec，`git mv` 到那份 spec 的 `tickets/`。判断不了的列给人定。全部归位后旧的 `tickets/` 目录是空的，删掉它。
3. 旧状态值换成现在的：跑 `node "${CLAUDE_PLUGIN_ROOT}/scripts/spec-status.mjs" migrate <docs>`（`idea-loop:spec-status` 的「从旧状态机迁移」）。
4. 跑 `spec-status.mjs check <docs>` 确认没有遗留问题，再跑 `spec-status.mjs index <docs>` 刷新 `docs/spec/index.md`。

正在做的 PR 不受影响：集成分支上已有的 commit 里，`Ticket:` trailer 只写工单名，不写路径。
