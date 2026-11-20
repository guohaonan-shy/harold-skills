---
type: record
captured: 2026-11-16
title: "retro 候选：改了模型读到的内容（prompt、工具描述、工具结果），eval 要覆盖项目在用的模型和语言"
tags: [retro-candidates]
---

> 来自 fishaudio/fish-agent#364（Linear FA-457）的 retro（2026-11-16）。人批了，去处选「进候选池」。

- 信号：人自己说的方向（spec 的测试决策只写了一个模型、6 个手写场景，人自己提出要像别的 case 一样覆盖平台支持的模型和语言）
- 落点：`idea-loop:to-spec` 的测试决策表，「LLM 输出质量」那一行
- 旧文：
> | LLM 输出质量（prompt 改动） | eval（确定性断言） | 改了哪些 prompt、要加或改哪些 eval |
- 新文：
> | LLM 输出质量（模型读到的内容改了：prompt、工具描述、工具结果） | eval：确定性断言，覆盖项目在用的模型和语言，改之前和改之后对比 | 改了哪些内容、覆盖哪些模型和语言、case 从哪来 |
- 归并：to-spec 测试决策表「LLM 输出质量」那一行的扩充：范围从「prompt 改动」扩到模型读到的一切，并要求写明覆盖哪些模型和语言
- 验证：判不了：落点是测试决策表的一行，要判断的是 spec 起草时有没有写出模型和语言的覆盖面；回放用例实现时再写
- 例子：FA-457 把转接失败的工具结果从纯文字改成 JSON，spec 原先只用一个模型跑 6 个手写场景；人提了这句后补了生产回放（5 个模型、3 种语言、27 个 case，改前改后各 3 次），做法同 FA-577 的 tool-preamble
- 状态：在池里

## 出现

- fishaudio/fish-agent#364（Linear FA-457，2026-11-16）：「这个是否需要像其他的case一样覆盖平台支持的所有模型 以及 不同语言。577那个会话跑的eval是所有的case吗？」（审 spec 的测试决策、解释冒烟 eval 只测了一个模型之后）；决定记录：fishaudio/fish-agent `docs/raw/decisions/FA-457.md`
