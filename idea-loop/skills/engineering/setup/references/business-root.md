# 业务根目录与说明文件

下文 `business` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/business.mjs"`。布局见 `idea-loop:wiki-conventions` 的「业务与知识库」。

## 还没有业务根目录

由人建：个人业务建一个私有仓库，公司业务在虚拟机上 `git init`、不连远端；把业务的代码仓库 clone 进去。`business root` 报 `legacy: true` 就是还没有（知识库还在代码仓库里），搬迁不在这里做。

## 写

1. 业务根目录的 `.gitignore` 列出下面每个代码仓库（`business root` 的 `repos`）。代码仓库里只留它自己的 `AGENTS.md` / `CLAUDE.md`，idea-loop 不往里写。
2. **业务说明文件**：`business instructions` 看业务下每个仓库用的是 `CLAUDE.md` 还是只有 `AGENTS.md`，`recommend` 就是业务根该放的那份（都有 `CLAUDE.md` → `CLAUDE.md`；都只有 `AGENTS.md` → `AGENTS.md`；混用 → `AGENTS.md`）。`## idea-loop` 块和 `## issue 分类` 都写进它。
3. **两份都读**：`needsSwitch` 为真（两种仓库混用）而 `switchOn` 为假时，把下面这段原样给人，说明它改的是这台机器上所有项目（没被 `CLAUDE.md` 引入的 `AGENTS.md` 也会读进来），由人自己写进用户设置 `~/.claude/settings.json`；写在仓库的 `.claude/settings.json` 里不生效：

   ```json
   { "pluginConfigs": { "cc-plugin-agents-md@builtin": { "options": { "instructionFiles": "claude-md-and-agents-md" } } } }
   ```

4. `ISSUE_TRACKER.md` 的「issue 所在仓库」写 issue 开在哪个 GitHub 仓库（`owner/name`）：知识库的远端不是 issue 所在的地方，`issues.mjs` 从这一行取。
5. 多个仓库时，`DEVELOPMENT.md`、`REVIEW.md`、`CODING_STANDARDS.md` 里各仓库不同的小节按 `## <仓库名>` 分节，共同的写在分节之前。

完成条件：`.gitignore` 列全了代码仓库；`business instructions` 的 `current` 里有 `recommend` 那份；混用时开关已开或那一段已给人；「issue 所在仓库」已填。
