# 校验

写完 `delta/`、初扫写完草稿、校验报错要看懂时读。

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/design-archive-check.mjs" <仓库根> [--delta <spec-slug>] [--no-used-by] [--workspaces <前缀,前缀>] [--json]
```

退出码 0 = 通过（可以带「提示」），1 = 有违规（逐条指名文件与字段），2 = 用法错误或不是仓库根。`--delta` 把 `tmp/<spec-slug>/delta/` 叠到 `prod/` 上（同 id 的对象以 `delta/` 为准，按 `removed.md` 去掉对象），判叠完之后的样子。`--no-used-by` 跳过规则 6 里 `usedBy` 那一半。`--workspaces mkt,app` 把组件文件名的工作区前缀交给校验（初扫时 `prod/index.md` 还不存在，没处声明）。

**写完 `delta/` 的标志**：`--delta <spec-slug> --no-used-by` 退出码 0。

| 规则 | 判什么 |
|---|---|
| 1 可达 | 每个状态能从某个入口节点沿边（不走 `blocked` 边）到达，或它的某条入边带 `blocked` |
| 2 async | 有 `async` 的状态三项写全，各是存在的状态或「不适用」 |
| 3 引用 | 所有 wikilink 能解析；边的 `component` 指向组件、`motion` 指向动效，`to` 指向状态，状态的 `page` 指向页面；`docs/` 下 basename 不重复 |
| 4 用户路径 | `path` 相邻两个状态之间有边；有多条时写了 `via`，且 `via` 是其中一条的 id |
| 5 决定与候选 | 状态文件没有「决定」；其余对象两节都在，每条决定三项齐全，每条候选三项齐全 |
| 6 动效 | 字面值的 `duration` / `easing` 都带 `deviates`；`usedBy` 与反向引用一致（字段缺失视为未生成，照样报出来） |
| 7 分段 | 分段的类型、`id` 写法、定位形状，边的 `from` / `section` 与状态的 `section` 指向声明过的段（逐条见下） |
| 0 结构 | 读不出的文件、不认识的 `type`、缺了规则依赖的必填字段（逐项见 [writing.md](writing.md) 的「状态与边」）；`prod/index.md` 声明了 `workspaces` 时，每个组件文件名要带其中一个前缀 |

## 规则 7 的逐条违规与提示

一律点名文件与字段：

- **违规**：类型不在闭集；`id` 写法不对（不是 `<类型>` 或 `<类型>-<限定词>`，kebab-case）；同页重名；同页同类型多次却没都加限定词；`sections` 写在非入口状态上；同页两个入口状态都声明分段；`locate` 不是 [writing.md](writing.md)「分段」里三种形状之一；边的 `from` 不是本页声明过的段；边的 `section` 不是 `to` 所指状态声明过的段（`to` 不是入口状态也算）；状态的 `section` 不是本页声明过的段（入口状态写 `section` 也算）；有分段的入口状态上，`user` 边没写 `from`；引用写成 wikilink；`scrollDriven` 写成 `true` 以外的值（`false`、字符串、数字都算，点名文件和 `sections[n].scrollDriven`）。
- **提示**（打印、不拦，退出码照旧）：用 `content` 兜底；`position` 定位。landmark 不提示：一页只有一个 banner / contentinfo，不会错位。
- 校验读的是档案文件，看不到页面：「滚动容器的内容比它的可见区高就要声明分段」和「每个可点元素都落在某一段里」放在拍图那一步判。
