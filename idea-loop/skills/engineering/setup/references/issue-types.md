## issue 分类

issue 除了 `status:*` 状态，还带分类 label：父类打成 `type:<父类>`，子类打成 `type:<父类>/<子类>`，打子类时父类一起打。idea-loop 验证 issue 时打，人也可以手动打。

- `<父类>`：<什么样的 issue 归它>
  - `<子类>`：<什么样的 issue 归它>
- `<父类>`：<什么样的 issue 归它>

保留的 label：`retro`、`<label>`、`<label>`

`retro` 必写：retro 开出的 issue 带它，调度不给它们一个一个出会话卡片，而是按 plugin 凑成一次 retro 整合。
