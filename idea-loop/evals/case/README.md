# baseline case —— Toeflair 的练习记录页

## 为什么是这个 case

它是**真的**。Toeflair 是本 plugin 被通用化出来的那个项目，`project/` 下那两份
`DESIGN.md` 与 `PRODUCT.md` 是从它仓库里那两份真文件蒸馏的——不是为了跑 eval 编的。
练习记录页也是它真有的一个 surface，`stages/` 里那份访谈转录、那个状态模型原型、
那份方向说明，形状都照着这条环真实跑起来的样子写。

选它还有一个理由：它**同时喂得饱三个 skill**。

| skill | 这个 case 给它什么 |
|---|---|
| `prototype` | 一条文字定不了的问题：草稿算不算一次 attempt（两个变体在数据上真的不同） |
| `uiux-imagine` | 一档真的没定的高度：布局与处理（语言和结构都已经定了，发散必须知道不去重开它们） |
| `uiux-refine` | 一块要收敛的画布：五格验收矩阵、四条待打磨清单、in-app register（所以素材段该判成不开） |

## 「最小」最小在哪

真项目那份 `DESIGN.md` 是 574 行，这里是 97 行。砍掉的是判不动这一个 surface 的东西：
遗留迁移清单、逐个组件的配方、八节以外的历史沿革。**留下的是 T1 底线、两个 register、
以及这个 surface 真会撞到的那几个 token**——一份小到能整份读完、又真能让一次收敛判出对错的设计法。

`PRODUCT.md` 同理：留 who / what / why、品牌性格、参照与反参照、五条策略原则，
外加一节专门交代这次要做的那个 surface 的已知产品事实。

## 目录

```
case/
├── project/                     每个 eval 都从它的一份副本起步
│   ├── DESIGN.md                最小设计法（八节 + Case Law 从空开始）
│   ├── PRODUCT.md               最小产品语境 + 这次那个 surface 的产品事实
│   └── docs/                    空的 raw / spec 桶与三份 index
└── stages/                      按 eval 需要往副本里补的起始状态
    ├── grill-transcript.md      to-spec 的输入：一场跑完的访谈逐字转录
    ├── raw/                     已经落过的原型证据（raw md + 可点击 HTML）
    ├── spec-awaiting-freeze.md  status: 等设计冻结，§4 无「设计方向」
    └── spec-with-direction.md   同上 + §4 已有七节方向说明
```

`stages/` 不是 fixture 的装饰——**它是让每一格只测一件事的手段**。收敛那一格如果还要先跑一遍发散，
它红了你分不清是谁红的。
