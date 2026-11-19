# 05 — pr 模块

**Blocked by**：01 — dyna 入口、登记表、版本核对，issues 模块打通
**设计冻结**：不涉及 UI

## 要建什么

把 pr-body、review-loop、evidence、changed-lines、review-check 收成 `dyna pr …`；github-app 成为共用包（以 bot 身份发言，归档评论用）。review-check 变成 `pr candidates submit`：校验过了才算交回。新增：`gh pr` 的开、转 ready、看、合并。

通用要求（每个模块工单都一样）：命令照工单 01 的写法挂进命令树、标好调用方、进登记表；旧脚本的参数、输出、退出码不变（命令按动作起名，旧脚本名不再出现在命令里）；旧脚本先留着，不改 skill 文字（skill 迁移在工单 16–18，删旧实现在工单 19）。

## 验收标准

- [ ] 对应旧脚本的行为测试断言全部搬成 `go test` 并通过（逐条对照，没搬的写理由）
- [ ] `dyna pr body set` 对同一个 PR 正文与旧脚本写出同样结果，含「参考以外有代码指称就拒写」
- [ ] `dyna pr candidates submit` 对格式不对的候选拒绝并说出哪一条
- [ ] `dyna registry --json` 里有这个模块的每条命令，调用方标注正确

## 选中的存量回归

- `pr-body.test.mjs`、`review-loop.test.mjs`、`evidence.test.mjs`、`changed-lines.test.mjs`、`review-check.test.mjs`、`github-app.test.mjs`：行为基准
