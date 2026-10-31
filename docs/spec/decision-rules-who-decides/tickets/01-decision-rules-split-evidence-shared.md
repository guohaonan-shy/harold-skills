# 01 — decision-rules 只留「谁来定」，讲给人看的共用写法进 evidence，加规则先归并

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

改完之后，一个读插件的 agent 会看到：

- `idea-loop:decision-rules` 只讲谁来定（自己定的四条、依据不成立交给人、PR 流程里代价相称只定推荐、不自动的、人能推翻）。「交给人时」那一节和它指向的参考文件删掉；description 里不再提讲题怎么写。其余几节一字不改：很多 skill 和 agent、Codex 审查进程都整份读它。
- `idea-loop:evidence` 是「给人看的东西怎么写、怎么配证据」的那一处。正文开头写读者模型：读的人清楚方向和高层设计，不清楚实现细节，要快速看懂、快速拿到证据、快速决定。下面是由它推出来的共用写法，每条一两句：
  - 结论在前，先说对读者什么变了；
  - 用能说清要点的最小一种视图（截图、流程图、伪代码、调用树、文件树、diff、时序图），放在它支撑的那句话旁边；
  - 关于现状的话带出处（在哪、什么时候、对着哪个基准查的）和规模数字，同类入口与相邻工作查过，出题前对最新基准再核；
  - 陌生叫法（缩写、内部术语、流程里的叫法）第一次出现就说清是什么、落到一个具体对象上，不用裸编号；
  - 比对类证据在同条件下做；
  - 要人定的写成一道题：选项差在读者能感到的地方，每个选项配一个真实例子（能从项目已有材料取就取），给推荐；要人评判文案或素材时先给评判标准。
  然后接它现有的两类图（spec 里的图、交付证据）和「两类共用的」。description 改成同时路由「写给人看的东西」和「配图」。原「交给人时」参考里的每一条都要在这里有着落（并进上面某条，或者说明为什么删）；「先写交付物，再列做法」那组不进这里，由 to-spec 的重写接（工单 02）。
- `idea-loop:writing-for-agents` 多一条：加内容之前，先看它是不是哪条已有原则的特例；是，就改写那条原则，不加新条。
- `idea-loop:retro` 的候选格式在「落点」「旧文」「新文」之外多一栏「归并：它是哪条已有原则的特例（没有写『无』）」。
- 原来指向「交给人时」的地方改指 `evidence` 的共用写法：`to-spec` 第 5 步那三行里的两行、`to-ticket` 的「唯一会停的情况」、`pr` 停下汇报写法里「决定题的写法」那一条、`implementer` 定义里 spec 缺口那句、插件 README 的实现阶段表格一行和目录树里 `decision-rules`、`evidence` 两行注释。to-spec 和 pr 这次只改指针，不改结构（结构归 02、03）。
- 候选池 `docs/records/retro-candidates/` 里落点写着 `decision-rules` 的 `handing-to-human.md` 的 4 条候选（examples-from-real-material、goal-figures-for-human、retro-candidate-95、handing-to-human-name-references）：「落点」一行改成 `evidence` 的对应共用写法；「旧文」「新文」「出现」一字不动。
- 回放用例 explain-mechanism 的 prompt 改成驱动 `idea-loop:evidence` 摆这道题（问的还是「验证没合并分支上的 skill 规则，用子代理还是 `claude -p`」）；`commit`、`question`、`quote` 不动。

dreaming 的两份参考里「交给人时出候选卡 / 维护卡」是 dreaming 自己的步骤名，不改。

## 验收标准

- [ ] 在 `idea-loop/` 下搜「交给人时」和「handing-to-human」，只剩 dreaming 那两处同名步骤；`decision-rules` 下没有 references 目录
- [ ] `decision-rules` 除删掉的那一节和 description 外，正文与改前逐字相同（diff 只有这两处）
- [ ] `evidence` 正文开头有读者模型，共用写法覆盖上面列的六条；原参考里每一条在 hand-back 里列出去向（并进哪条 / 归 02 / 删掉及理由）
- [ ] `evidence` 主体按 UTF-8 字符数（`LC_ALL=en_US.UTF-8 wc -m`）在 5000 以内
- [ ] `writing-for-agents` 有「先归并」那条；`retro` 的候选格式有「归并」一栏，retro 里其余引用候选格式的地方（决定记录、候选池的格式说明）同步
- [ ] 候选池 4 条的「落点」已改，其余行未动
- [ ] 回放用例 prompt 已改；按仓库的回放流程跑一次改前 / 改后（小用例，当场跑），结果文件路径写进 hand-back；判定是什么都如实写
- [ ] 一个新的文档测试（`node --test`）断言：插件里没有指向「交给人时」或那份参考的文字；`writing-for-agents` 有先归并一条；`retro` 候选格式有归并一栏。改前跑它是红的
- [ ] 仓库现有的全部 `node --test idea-loop/scripts/` 通过

## 选中的存量回归

- `pr-review-slim-doc.test.mjs`：断言 pr-review 文档把 decision-rules 的规则写成指针、不重写；改 decision-rules 的标题或节名会打断它
- `implementer-standards-doc.test.mjs`：断言 implementer 开工必调 decision-rules；改 implementer 那句指针时可能误伤
- `evidence.test.mjs`：读 evidence 的结构；改 evidence 正文时可能打断
- `pr-review-cross-skill-refs-doc.test.mjs`：查跨 skill 的引用；改指针时可能打断
