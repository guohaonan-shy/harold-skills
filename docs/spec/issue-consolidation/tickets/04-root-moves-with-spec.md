# 04 — issue 脚本：根随它那份 spec 的子 issue 一起翻、一起关，去掉「根跟着最慢的子 issue」

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

人改了方向（2026-10-30，在 #131 子会话里说、在根会话里确认「我都同意」）：「无论一个根issue有多少个subissue 我觉得还是一份spec，一个会话，也别搞太复杂了。这样这些问题我觉得可以解决了，精力放在issue在cloud 上的整合吧～」

所以一个根 issue 下的全部子 issue 由**一份** spec 覆盖（spec 的 `issues:` 写全部子 issue，不写根），走同一条路。issue 状态脚本里「根的状态跟着阶段最靠前（最慢）的子 issue」那套不再需要，改成：

- **对根号翻状态**：照旧，根和它开着的子 issue 一起翻（已有，保留）。
- **对账、advance**：一份 spec 翻它列的子 issue 时，这些子 issue 的根跟着翻到同一个状态；spec 让子 issue 关闭（完成或不存在）时，根随着关闭（completed），评论写明随哪份 spec 关。根下有的子 issue 不在这份 spec 里、或它们要翻的去向不一致时，根不动，作为问题报出来（不该出现，出现了说明分组和 spec 对不上）。
- **保留**：取候选跳过子 issue 和开了不到 6 小时的（根不受限）；`group` 命令；根不当成「没有 spec 列着它」的孤儿报。
- **文档**：`spec-status` 说明里「根 issue 和子 issue」那句、插件 README 里讲 issue 脚本的那一段（「根跟着最慢的子 issue」的说法）、脚本文件头，都改成上面的规则。
> 人的决定（2026-10-30，review 第 1 轮 S2 接受）：单独搁置的子 issue 不算「去向不一致」——根跟着其余子 issue 翻；还有搁置的子 issue 开着时，spec 完成也不关根；都不报问题。

## 验收标准

- [x] 一份 spec 列着一个根的两个子 issue；advance 把它们从验证中翻到实现中时，根也翻到实现中（单元测试，假 `gh`）
- [x] 这份 spec 完成后对账（或 advance）关掉两个子 issue 时，根也被关闭（completed），评论指向这份 spec（单元测试）
- [x] 根下有一个子 issue 不在这份 spec 里时，根不动、报出一条问题（单元测试）
- [x] 「最慢」相关的代码和测试删干净：没有按阶段顺序取最靠前状态的逻辑；原来测「根跟着最慢」的用例改写成上面的行为
- [x] 对根号翻验证中仍然整组翻；候选仍跳过子 issue 和开了不到 6 小时的；`group` 行为不变（现有测试照过）
- [x] spec-status 说明、插件 README、脚本文件头写的是新规则，没有「最慢」的说法；全量测试通过

## 选中的存量回归

- `idea-loop/scripts/issues.test.mjs`：根的规则全在这里测，改写面最大。
- `idea-loop/scripts/seo-issues.test.mjs`：seo-issues 导入 issues 脚本。
