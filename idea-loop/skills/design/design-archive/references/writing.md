# 写对象文件

写（或改）一个档案对象文件时读，按实体编排；实体是什么、跟谁关联，在 SKILL.md 的「图的实体」。写在 `docs/design/tmp/<spec-slug>/delta/` 下（目录与命名见 SKILL.md），写完用 [check.md](check.md) 的「写完 `delta/` 的标志」自检。

## 通用

每份对象文件照 `idea-loop:wiki-conventions` 的「frontmatter」带 `type` / `tags` / `summary`，再加各自的结构字段。**引用一律写成带引号的 `"[[basename]]"` 字符串**，`{token}` 形式的 token 引用同样加引号。

## 页面 `type: design-page`

```yaml
code: [<页面入口代码路径>]
regions:                          # 区域 → 组件
  - { name: 工具栏, component: "[[NavBar]]" }
```

页面的状态由带这个页面前缀的文件决定，页面文件里不列。

## 状态与边 `type: design-state`

```yaml
page: "[[cookbook]]"
entry:                            # 只有入口节点有
  url: /cookbook
  preconditions: { account: 已登录的测试账号, data: 至少 3 份已保存菜谱 }   # 账号 / 数据 / 开关，自由键值
components: ["[[RecipeCard]]"]    # 可选：这一屏要特别说明的组件
motions: ["[[spinner-ring]]"]     # 可选：这一屏常驻的动效
sections:                         # 只有入口节点写，且只在滚动容器的内容比它的可见区高时写；自上而下
  - { id: header, locate: { role: banner } }
  - { id: faq, locate: { role: heading, name: 常见问题 } }
section: mkt-pricing#faq          # 可选：段内交互的状态写它发生在本页哪一段（入口节点不写）
edges:
  - id: search                    # 在本状态内唯一
    to: "[[cookbook--search-loading]]"
    kind: user
    component: "[[SearchBox]]"
    locate: { role: searchbox, name: 搜索菜谱 }
    action: 输入关键词并回车
    when: 已登录时               # 可选：一句话的条件（同一个操作按环境去不同状态时，拆成几条边各写）
    from: mkt-pricing#hero        # 可选：从本页哪一段出发（有分段的入口状态上，user 边必写）
    section: mkt-pricing#faq      # 可选：落到目标状态（入口状态）的哪一段；页内锚点就是 to 指向自己再加 section
    motion: "[[save-pop]]"        # 可选
  - id: done
    to: "[[cookbook--search-results]]"
    kind: system
    trigger: 搜索请求完成
    how: 放行搜索请求
  - id: fail
    to: "[[cookbook--search-failed]]"
    kind: system
    trigger: 搜索请求失败
    how: 拦截搜索请求并返回 500
    blocked: { missing: 一个能让搜索接口稳定失败的开关, tried: [拦截搜索请求返回 500, 用空关键词搜索] }
async:                            # 这一屏发起了异步动作时必填
  loading: "[[cookbook--search-loading]]"
  failure: "[[cookbook--search-failed]]"
  empty: 不适用
```

- 必填：每条边的 `id` / `to` / `kind`；`user` 边的 `component`、`locate`、`action`；`system` 边的 `trigger`、`how`；入口的 `url`。`locate` 写 `role` + `name`；按角色 + 名字定位不到的元素（例如原生折叠标题 `<summary>`）才改写成 `{ text: <完整文字> }`，两种不混写。`when` 写了就不能为空。
- `blocked` 的 `missing` 与 `tried` 都必填。
- `sections`、`from`、`section` 只在长页面上出现，单屏页面都不写。
- `async` 三项各是一个状态引用，或字符串「不适用」；引用的状态可以在别的页面。
- 状态文件的正文见下面「正文」。

## 分段 `sections`

**`id`**：写 `<类型>` 或 `<类型>-<限定词>`，限定词按内容起、kebab-case。**同一页同一类型出现多次，每个都要加限定词**（`feature-listen` 和 `feature-write`，不能一个 `feature` 一个 `feature-write`）；只出现一次时建议不加，校验不拦。类型按最长前缀认：`feature-grid` 是类型 `feature-grid`，`feature-grid-pricing` 是它加限定词 `pricing`，所以 `feature` 不能用 `grid` 当限定词。

类型取自下面这张闭集表（跨项目通用，不进目标项目的 `DESIGN.md`；校验与反查读的是 `design-archive.mjs` 里的同一份常量 `SECTION_TYPES`）。两类判不准时按「这一段主要在回答什么」定：「为什么信你」归 `trust`，「多少人在用」归 `social-proof`。闭集要扩，改常量、校验的单测和这张表，不在档案里自造。

| 类型 | 是什么 |
|---|---|
| `header` | 页面顶栏：站点标识、主导航、顶部的登录与行动按钮 |
| `hero` | 首屏主视觉：一句主张加一个主行动 |
| `social-proof` | 多少人在用：用户数、客户 logo 墙、评分 |
| `problem` | 用户的痛点：为什么现有做法不够 |
| `feature` | 一项功能的展开说明 |
| `feature-grid` | 多项功能并排的宫格或列表 |
| `demo` | 产品的实际画面、可操作的示例或演示 |
| `how-it-works` | 分步骤说明怎么用 |
| `value-prop` | 价值主张：好处汇总，不绑具体功能 |
| `trust` | 为什么信你：安全、隐私、资质、保证 |
| `testimonials` | 用户的原话与案例 |
| `comparison` | 与别的做法或套餐的对比 |
| `pricing` | 价格与套餐 |
| `stats` | 一组数字 |
| `faq` | 常见问题 |
| `related-content` | 相关文章、延伸阅读 |
| `final-cta` | 页尾前最后一次行动号召 |
| `footer` | 页脚：站点链接、法务、版权 |
| `content` | 兜底：以上都不是的正文（校验给提示：多半该归进某一类，或表里缺一类） |

**`locate`**：写法同边的 `locate`，用可访问性树：

| 段的样子 | `locate` | 范围 |
|---|---|---|
| 有标题 | `{ role: heading, name: <完整名字> }`，精确匹配 | 从标题所在的顶层分块的上沿起（这个分块里还有别的分段标题时，从标题本身的上沿起），到下一个分段的起点为止 |
| 顶栏、页脚 | `{ role: banner }` / `{ role: contentinfo }` | 这个 landmark 元素自己的框 |
| 没有标题的段（首屏、纯图片带） | `{ position: N }` | 第 N 个顶层分块自己的框；校验给提示：这条定位比较脆，页面加一个分块就会错位；页面全套在一个无语义的包装元素里时它用处不大，改用标题或 landmark 定位 |

**顶层分块** = `<main>` 的直接子元素（没有 `<main>` 时取 `<body>` 去掉 banner / contentinfo 之后的直接子元素），只算可见、高度大于 0 的；自身不占位置的包装层（`display: contents`，例如 Astro 的岛）不算一块，往里看，用它的子元素。

最后一段的终点：下一个分段的起点；后面没有分段时取页面上第一个 `contentinfo` 的上沿（不论声明没声明），没有就到页底。没声明页脚时，页脚里的链接会落空、被报出来，而不是静默算进最后一段。标题改名导致定位失败，对账判「进入方式过期」，提议改定位。

**引用与边**：

- 有分段的入口状态上，每条 `user` 边都写 `from`（分段脚本的归属结果给出每个可点元素在哪一段，照抄）。
- **页内锚点**：入口状态的自环（`to` 指向自己）加 `section` 写落点段，不另建状态。
- **段内交互**（FAQ 展开、切标签）是页面的另一个状态，状态写 `section` 说明它在哪一段，截图只拍那一段。

## 组件 `type: design-component`

`code`（代码路径）、可选 `tokens`（引用的 `DESIGN.md` 基础件或 token）、`usedBy`。

## 动效 `type: design-motion`

`duration`、`easing`（`"{token}"` 引用，或字面值）、`properties`、`iterations`、`reducedMotion`（减少动效下怎么退）、字面值时必填的 `deviates`（一句为什么偏离站内 token）、`usedBy`。

**`usedBy`（组件、动效共用）**：写 `delta/` 时留着不动，归档脚本反向生成。页面用组件 = 它的某个 `regions` 写了它，或它的某个状态在 `components` 里列了它，或它的某条边经过它；页面用动效 = 它的某个状态在 `motions` 里列了它，或它的某条边的 `motion` 是它。只有一个页面用也生成。

## 用户路径 `type: design-journey`

`intent`（一句话意图）、`path`（有序状态列表）：

```yaml
path:
  - "[[cookbook--list]]"
  - { state: "[[cookbook--search-results]]", via: save }   # 与下一个状态之间有多条边时，用 via 指定边 id
  - "[[cookbook--recipe-saved]]"
```

`via` 写在**出发的那一项**上，值是这个状态通往下一项的那条边的 id。

## 正文

- **状态文件**只有两节：「这一屏」（描述，加截图 / GIF）和「应看到什么」（可判定的几条，进状态之后拿它核对）。有分段的入口状态，「这一屏」按段排开：每段一个 `###` 小标题（段 id）、这一段的图（`<入口状态 id>@<段 id>.png`）、一两句描述；「应看到什么」照旧几条可判定的话，可以按段写。决定写在页面、组件、动效、用户路径文件里。
- **页面、组件、动效、用户路径文件**的正文有两个固定二级标题：「## 决定」与「## 设计法候选」。没有内容时各写一行「无」：空着分不清是没有还是漏了。
- **「决定」按编号写**，每条：

  ```markdown
  ### 决定 2：对勾用 ease-out-sine 写出来，不用站内默认曲线
  规则一两句。
  - 为什么：（必填）
  - 否掉过：（必填，写被否的做法和理由；确实没有备选写「无」）
  - 来源：[[<spec-slug>]]
  ```

  不写日期；规则改了**原地改写**，编号不复用。蒸馏成 ADR 之后「来源」改链到 ADR。
- **「设计法候选」**每条的形状照 `idea-loop:design-modeling` 的「设计法候选的形态」：一句规则，下挂「并进」「为什么」「证据」三项。校验只看三项都在。

## 建模的取舍

写档案时遇到下面这些情形，照这里定：

- **结构相同的多项只记一个代表**：一段里有几个结构相同的项（场景、FAQ 条目、卡片、目录项），截图、状态、边都只记第一个，其余在状态文件里一句话说明「还有 N 个同样的」。指向这些项的目录一类入口也只留第一条边。
- **入口是加载中**：页面一打开就发请求的，入口状态是「加载中」（拦住那条请求停在这一屏），加载完、加载失败各用一条 `system` 边连出去，`async` 写在加载中的状态上。回到这个页面的边都指向加载中。
- **组件自己的指示状态不建成页面状态**：计时器变色、字数变色、进度条走到哪里这类，写在组件文件里。页面状态只在出现了新一屏时建：默认状态加有内容的状态，然后沿提交 / 退出的流程往后走。
- **公共组件的交互状态只在一个代表页上记**：顶栏菜单、页脚这类多页共用的组件，展开菜单之类的状态只在一个页面上建，组件文件里写在哪一页记了。
- **站外链接、其他语言版本的链接不画成边**：边只连档案里的状态。在页面文件里列一节「站外链接」（链接文字加去向）。
- **同一个文件里没导出的内部组件、不画东西的组件**（布局壳、`<head>` 之类）不单独存，写在所属组件或页面文件里；整页写在一个文件里、没有拆出子组件的，这个文件本身就是那个组件。
- **`async` 的 `failure` 可以指向别的页面的状态**：加载失败后页面跳去别处，failure 就写那一页的状态。
- **边的条件**：同一个操作按环境去不同状态时（麦克风被拒 / 已授权），拆成几条边，各写 `when`（一句话的条件）；去向取决于浏览历史的「返回上一页」，`to` 写走到这一步的那条路径上的目标，`when` 写「从 X 进来时」。

## 截图矩阵与 `prod/index.md` 的设置键

**`prod/` 只存精简矩阵**：每个状态一张主视口截图（设置在 `prod/index.md` 的 frontmatter，见下）。长页面的入口状态改成每段一张图，叫 `<入口状态 id>@<段 id>.png`，放入口状态同目录的 `assets/`；段内交互的状态只拍那一段，截图照旧叫状态自己的名字。每个有动效的边或节点一张 GIF。完整矩阵（主题 × 视口 × 语言 × 动效偏好）只在 `tmp/<spec-slug>/canvas/`，随 `tmp/` 清掉。各对象可带同目录的 `assets/`（状态截图、动效 GIF、交互图 `flows/`）。拍法见 [shooting.md](shooting.md)。

**`prod/index.md` 的设置键**（项目定一次，归档脚本原样保留）：`viewport`（如 `1440x900`）、`theme`（`light` / `dark`）、`locale`、`motion`（`default` 是默认动效、拍之前把整页滚一遍让内容出现，`reduce` 是减少动效；不写是 `default`）、`workspaces`（可选：项目有不止一个前端时，组件文件名的工作区前缀列表，如 `[mkt, app]`）。
