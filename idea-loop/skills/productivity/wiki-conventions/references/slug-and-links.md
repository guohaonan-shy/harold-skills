# slug 与链接的细则

slug 是文件名去掉 `.md`；这是 Obsidian vault，`[[slug]]` 按 basename 解析，与目录无关。下面三条由命令守着。

- `docs/` 下每个 slug 全局唯一（工单和 `index.md` 只按路径引用，不在此列）；`dyna home commit` 遇到重名就拒绝。
- 移动不打断链接，删除会：`[[...]]` 指到的 slug 都要有文件（行内代码和代码块里的不算）；`dyna home commit` 遇到死链就拒绝。
- ADR 文件名（四位编号加名字，编号递增、不复用）用 `dyna home adr new <名字>` 取。
