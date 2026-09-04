# 01 — 建 design plugin 骨架 + 机械迁移

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

harold-skills 顶层新增一个独立 plugin（`design`），遵循本仓库既有的标准 plugin 目录结构（`.claude-plugin/plugin.json` + `README.md` + plugin 级 `references/` + `skills/<name>/{SKILL.md,references/}`）。

内容来自 design-lib 仓库消费侧 plugin 的对应技能，整体搬入且**不做任何行为改动**——上一轮迁移（TOFEL-demo → design-lib）已经把这些技能项目无关化：硬编码的项目专属路径/名称已替换成"目标项目根目录"式的运行时查找，缺失时优雅降级；产品特定知识作为带标注的案例保留。这一刀只是换个 marketplace 位置，不重新做那一轮已经做过的工作。

只搬入这五个技能：设计总入口、Establish/Infer 两种模式的设计语言起草、Surface/Module/Component 三档 altitude 路由的静态 UI 设计、Stage 2 动效与原生交互设计、以及端口验证（这一张的端口验证技能保持迁移前的原样，即"只验证不翻译"——把它跟翻译机制合并成一个技能是下一张 ticket 的事，这里先原样搬）。全部支撑的 references、hooks、scripts 一并搬入。

**不搬这三个**：
- 落地页专属的两个技能——它们的方法论（page taxonomy、Hero 七槽模型）会被拆出来单独整理，通用部分会并入静态 UI 设计技能自己的 craft reference，是另一张 ticket 的事，这里不动。
- 独立的端口翻译技能——它的翻译机制并入端口验证技能，不作为独立技能存在，是下一张 ticket 的事。
- 视频背景生成技能——按讨论明确排除，留到下一版单独展开，这次完全不碰。

plugin 的名称、描述、作者信息按本仓库其它 plugin 的既有惯例改写，不再挂靠原来的产品身份。

搬完之后核实一遍：PostToolUse 的 lint hook 在新的安装位置下依然能正确触发（匹配 `design-preview/`/`design-motion-preview/` 下的 HTML 文件写入），且它链式调用的外部探测器（一个装在用户主目录下、按 marketplace 名字查找的第三方检测脚本，不属于这次迁移范围）在当前环境里仍然能被找到——这条查找路径本来就不依赖 design 技能自己装在哪个 marketplace，只是要在新环境里核实一遍，不代表要改它。

## 验收标准

- [x] design plugin 可以在 harold-skills 里被安装，`skills/` 下恰好是这五个技能，一个不多一个不少
- [x] 对 `design-preview/*.html` 做一次 Write/Edit，PostToolUse hook 能触发且不报错退出
- [x] 全新 plugin 树里 grep 不出任何项目专属的硬编码路径/产品名（上一轮迁移已经清过一遍，这里是核实没有在搬家过程中引入新的）
- [x] plugin 的名称/描述/作者信息不再挂靠原产品身份，符合本仓库其它 plugin 的自我介绍方式

## 选中的存量回归

无 test-cases 库，本仓库也没有既有的自动化测试套件——本次验收全靠上面这几条人工核对。
