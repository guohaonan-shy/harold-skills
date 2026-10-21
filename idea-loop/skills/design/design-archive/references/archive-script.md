# 归档脚本做了什么

`design-archive-write.mjs` 的步骤，读它的拒绝原因或核对它挪了什么时用：

1. **校验**：把 `delta/` 叠在 `prod/` 上跑「校验」的全部规则。`usedBy` 此时还没重算，这一步不判它（既不判与反向引用是否一致，也不判其中的链接是否还能解析：被删的页面会留下过期的链接）；第 3 步生成之后再完整校验一次。
2. **覆盖与删除**：`delta/` 下除 `removed.md` 与 `index.md` 外的文件按同路径覆盖进 `prod/`（含各自的 `assets/`）；`removed.md` 列出的对象删掉。组件的整个文件夹随它走；页面或组件的文件夹里没有对象文件了，连 `assets/` 一起删。
3. **重算**每个组件、动效的 `usedBy`（只改这一个字段，其余字节不动；集合没变的文件不碰），重新生成 `prod/index.md`：页面、组件、动效、用户路径四张清单，表体取自 frontmatter，index 自己的 frontmatter（主视口 / 主题 / 语言 / 动效模式 / 工作区前缀）原样保留。
4. **交互图**：`tmp/<spec-slug>/canvas/` 里某个 `flows/` 目录下直接放着的图片，加上 spec 里链接到、位于 `canvas/` 下的图片，挪进 `prod/pages/<page>/assets/flows/`。图属于**文件名里带着状态 id 的那个状态**的页面（多个状态 id 都在名字里时取最长的）；名字里没有状态 id 的，放进 delta 里第一个页面（没有就取第一个状态的页面），并在输出里说明。`flows/src/` 里的拼图源不挪。目标位置已有内容不同的同名文件、或两张图落到同一个位置，都是冲突，拒绝。然后把 `docs/spec/<spec-slug>/<spec-slug>.md` 里指向旧位置的图片链接改成新路径（链接的写法保持不变，代码围栏里的不改）。
5. **检查目标仓库**：`.gitattributes` 有没有用 Git LFS 管 `docs/design/prod/**/assets/` 下的 png / gif / webm，`.gitignore` 有没有忽略 `docs/design/tmp/`，`prod/index.md` 有没有定主视口 / 主题 / 语言。缺什么在输出里各提示一次，写出要加的行，`.gitattributes` 与 `.gitignore` 留给人改。spec 里还有指向 `tmp/` 却不会被归档的链接，同样提示。
6. **清空** `tmp/<spec-slug>/`。

第 2 到第 4 步先排成一份计划，套在 `docs/` 的一份临时副本上（文本文件真实，其余文件建成空占位），对副本跑**完整**校验（含 `usedBy`），过了才把同一份计划套到仓库上。所以任何一步不过，`prod/`、spec、`tmp/` 都保持原样；`--dry-run` 就是做到这一步为止。没有 `delta/` 目录的需求（只留了画布）照样走第 4、6 步。
