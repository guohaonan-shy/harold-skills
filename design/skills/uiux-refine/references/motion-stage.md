# 动效段（可选，静态构图冻结之后）

打磨环判 `通过`、静态构图冻结之后，判断要不要开这一段时读。构图还在动就配时间轴，是给一个会变的布局做动效。

## 开不开：块的 job 是闭集四值

动效服务于**块的 job**，job 取自方向说明「结构」那节写的内容责任。命中一条才开：

| job | 动效在这里做什么 |
|---|---|
| **状态** | 让"现在是哪个状态、刚从哪个状态来"可读（加载、禁用、展开、选中的切换） |
| **结果** | 让一次用户意图的结果被看见（提交成功、删除可撤销、计数变化） |
| **身份** | 让品牌的性格在一次动作里可感（营销 register 的签名动作） |
| **氛围** | 让环境活着而主体不动（**只在营销 register**；in-app 的 ambient loop 预算是零，见 [motion-spec.md](design/motion-spec.md) 的「Restraint budget」） |

"看起来更活"不是 job，没有 job 的动效是凑数的装饰。四值都不命中就不开动效，ledger 里如实说一句。

每个要动的元素都欠**一句话理由**，绑在那个 job 上（[motion-protocol.md](design/motion-protocol.md) 的「Principle」）。写不出那句话的元素删掉，不留着调参数。

## 做：在冻结的画布上叠一层

工作文件是画布目录里的 `motion-v<N>.html`：`motion-v1.html` 从签过字的那一版静态画布复制起手，之后每改一次递增一版（见 [refine-canvas.md](refine-canvas.md)，lint hook 同样盯它）。动效是叠上去的一层：做动效时发现构图有问题，记下来，回打磨环改构图。

怎么做、要暴露什么句柄（`window.__maTimeline` 的 `seek` / `duration` / `resume`）、reduced-motion 怎么写：[`design/motion-protocol.md`](design/motion-protocol.md) 的 A 段，法在 [`design/motion-spec.md`](design/motion-spec.md)。duration 与 easing 取 motion-spec 的「Duration tokens」与「Easing tokens」；项目 `DESIGN.md` 的 Motion 章有自己的时长 / 缓动 token 就用它的。

## ui-master 看帧序列

打磨环照常跑，这一轮看**动效**，图换成**定格帧序列**：`__maTimeline.seek(t)` 在 t = 0 / 中 / 末（外加你在意的关键帧）各截一张，按时间顺序给；时间轴盖不住的滚动与指针交互，给交互前 / 中 / 后三张。意图那一句、不给评委的三样、`critic-score.mjs` 的校验与收敛、ledger 每轮一行，都和静态一样。

## 三样验证，一条不能少

判据全在 protocol 里：

| 验证 | 判据在哪 | 不过就是没做完 |
|---|---|---|
| **seek-frame 确定性 gate** | `motion-protocol.md` 的 B 段 Gate 3 | 帧必须**互不相同**且合乎编排。`getComputedStyle` 读到的是目标值，一个从没播过的动画也能读出"对"的结果——它不算证据 |
| **restraint budget** | `motion-spec.md` 的「Restraint budget」 | 按**可见视口**结算，拼起来的各部分算总和；in-app 的 ambient loop 为零 |
| **reduced-motion** | `motion-spec.md` 的「Reduced motion」 | 每条动效都有 `prefers-reduced-motion: reduce` 的退路；内容的可见性挂在静态样式上，不挂在过渡上 |

再加 `motion-protocol.md` B 段的 Gate 1（lint，写文件时 hook 自动跑）、Gate 2（motion-craft 与 a11y 审计，含动效进行中的键盘与焦点）、Gate 4（DoD 逐条），以及 designer 定义里「签字前检查」那几项。

## 动效也停在人身上

动效做完就停下输出，让人看跑起来的 preview。输出的「改了什么」里带：每条动效的那句理由与用的 token、reduced-motion 怎么退、本视口的 restraint 结算、帧证据的路径、偏离 `DESIGN.md` 的地方和为什么。签字由人宣布。

签字过的**新** in-app 动效模式，只进动效文件与候选（冻结时写进冻结记录的「设计法候选」，注明挂在哪个动效对象上；动效文件到合并前归档才写出）：动效文件记具体参数与理由，同一份文件的「设计法候选」里写一条候选（形态见 `idea-loop:design-modeling` 的「设计法候选的形态」），写的是背后的规律，可并进 `DESIGN.md` Motion 章的全局原则。`DESIGN.md` 由 `/idea-loop:dreaming` 处理候选后写。每个新模式都要带一条候选才算做完。
