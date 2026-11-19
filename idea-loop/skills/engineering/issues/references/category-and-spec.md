# 分类，以及 issue 与 spec 的关系

`<docs>` 指 `<项目目录>/docs/`（项目目录：`idea-loop:wiki-conventions` 的「项目目录」）。

## 分类

除了状态，issue 还带模块和类型两种 label：模块是 `type:<父类>`，可选的子类 `type:<父类>/<子类>`，打子类时父类一起打上；类型是 `kind:bug` / `kind:feature` / `kind:improvement` 之一。项目有哪些模块、另外保留哪些 label，写在项目目录 `ISSUE_TRACKER.md` 的「分类 label」一节，`/idea-loop:setup` 建它。`dyna issues type` 打模块，会替换原有的 `type:*`；类型用 `gh issue edit --add-label`。

## spec 与 issue

spec 的 `issues:` 写这份 spec 属于的 issue。读 spec 内容、刷 `docs/spec/index.md`、查旧布局与遗留的 `status` 行，用 `dyna spec index|check <docs>`；`check` 报了旧平铺布局，停下提议照 `idea-loop:wiki-conventions` 的「从平铺布局迁移」迁移。spec 标题下的结论格式脚本要读：每个 issue 一行 `> #12 存在：…` 或 `> #12 不存在：…`，写法见 `idea-loop:to-spec` 的模板；旧 spec 的「验证」表（每行 `| #12 … | 存在 | … |`）仍然认得。
